import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'

import { createCodexAuthService, DshOAuthCredentialStore } from './credential-store.js'
import { openCodexAuthUrl } from './external-url.js'
import { CodexLoginCoordinator, createCodexRpcHandler } from './login-coordinator.js'
import {
  createModels,
  openaiCodexSubscriptionProvider,
} from './pi-ai-runtime.js'
import { createCodexUsageReader } from './usage.js'

export const name = 'codex-subscription'
export const inject = ['llm', 'credentials', 'connection']

const PROVIDER = 'openai-codex'
const CREDENTIAL_REF = credentialRef('OPENAI_CODEX_SUBSCRIPTION_OAUTH')
const LEGACY_CREDENTIAL_REF = credentialRef('WSL043_OPENAI_CODEX_OAUTH')
const CHANNEL = '/codex-subscription'

const publicError = (code, message) => ({
  ok: false,
  error: { code, message, details: { issues: [] } },
})

export function createSubscriptionRpcHandler({ authHandler, usageReader }) {
  return async (endpoint, payload, signal) => {
    if (endpoint === 'usage') {
      try {
        signal.throwIfAborted()
        return { ok: true, value: await usageReader.read({ force: payload?.force === true, signal }) }
      } catch (error) {
        if (signal.aborted) throw error
        const known = new Set([
          'ChatGPT subscription is not signed in',
          'ChatGPT sign-in needs to be renewed',
        ])
        const message = error instanceof Error && known.has(error.message)
          ? error.message
          : 'Could not read ChatGPT usage'
        return publicError('internal', message)
      }
    }
    const result = await authHandler(endpoint, payload, signal)
    if (endpoint === 'logout' && result.ok === true) usageReader.clear()
    return result
  }
}

export function apply(ctx) {
  const store = new DshOAuthCredentialStore(ctx.credentials, CREDENTIAL_REF, [LEGACY_CREDENTIAL_REF])
  const provider = openaiCodexSubscriptionProvider()
  const authModels = createModels({ credentials: store })
  authModels.setProvider(provider)
  const profile = Object.freeze({
    provider: PROVIDER,
    displayName: 'ChatGPT subscription',
    piProvider: provider,
    configuredMaxTokens: new Map(),
    streamIdleTimeoutMs: 10 * 60 * 1000,
    // pi-ai owns prompt_cache_key and encrypted reasoning replay. The explicit
    // profile values make the subscription cache contract auditable.
    cacheRetention: 'short',
    // DSH rc.6 resolves pi-ai 0.82.x, whose cached WebSocket pool is keyed by
    // session only. SSE avoids cross-account connection reuse after sign-out.
    transport: 'sse',
  })
  const profiles = new Map([[PROVIDER, profile]])
  const resolveAuth = () => authModels.getAuth(PROVIDER)
  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: async () => {
      let resolved
      try {
        resolved = await resolveAuth()
      } catch {
        throw new LlmError('ChatGPT subscription authorization failed', 'AUTH_FAILED')
      }
      if (typeof resolved?.auth.apiKey !== 'string' || resolved.auth.apiKey.length === 0) {
        throw new LlmError('ChatGPT subscription is not signed in', 'MISSING_CREDENTIAL')
      }
      return resolved.auth.apiKey
    },
    resolveAttachments: () => ctx.get?.('attachments'),
  })
  ctx.llm.registerAdapter([PROVIDER], adapter)

  const auth = createCodexAuthService(authModels, store)
  const coordinator = new CodexLoginCoordinator(auth)
  const usageReader = createCodexUsageReader({
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
  })
  const handler = createSubscriptionRpcHandler({
    authHandler: createCodexRpcHandler(coordinator, { openExternal: openCodexAuthUrl }),
    usageReader,
  })

  ctx.effect(
    () => ctx.connection.rpc.handle(CHANNEL, handler, { authority: 'loopback' }),
    'codex-subscription: loopback account RPC',
  )
}

export { createCodexAuthService, DshOAuthCredentialStore } from './credential-store.js'
export { assertCodexAuthUrl, commandForCodexAuthUrl, openCodexAuthUrl } from './external-url.js'
export { CodexLoginCoordinator, createCodexRpcHandler } from './login-coordinator.js'
export { CODEX_USAGE_URL, createCodexUsageReader, parseCodexUsage } from './usage.js'
