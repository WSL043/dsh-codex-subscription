import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'

import { CodexCacheTelemetry } from './cache-telemetry.js'
import { createCodexAuthService, DshOAuthCredentialStore } from './credential-store.js'
import { openCodexAuthUrl } from './external-url.js'
import { CodexLoginCoordinator, createCodexRpcHandler } from './login-coordinator.js'
import {
  createModels,
  getOpenAICodexWebSocketDebugStats,
  openaiCodexSubscriptionProvider,
} from './pi-ai-runtime.js'
import { createCodexUsageReader } from './usage.js'

export const name = 'wsl043-codex-subscription'
export const inject = ['llm', 'credentials', 'connection', 'wsl043CodexBoundary']

const PROVIDER = 'openai-codex'
const CREDENTIAL_REF = credentialRef('WSL043_OPENAI_CODEX_OAUTH')
const CHANNEL = '/wsl043-codex-subscription'

class CodexAdapter extends PiAiAdapter {
  constructor(options, telemetry) {
    super(options)
    this.telemetry = telemetry
  }

  providerRetryPolicy() {
    return undefined
  }

  async *stream(options) {
    this.telemetry.begin(options)
    let usage
    try {
      for await (const chunk of super.stream(options)) {
        if (chunk.type === 'usage') usage = chunk.usage
        yield chunk
      }
    } finally {
      const sessionId = options.sessionId === undefined ? undefined : String(options.sessionId)
      this.telemetry.finish(
        options,
        usage,
        sessionId === undefined ? undefined : getOpenAICodexWebSocketDebugStats(sessionId),
      )
    }
  }
}

const publicError = (code, message) => ({
  ok: false,
  error: { code, message, details: { issues: [] } },
})

export function createSubscriptionRpcHandler({ authHandler, usageReader, telemetry }) {
  return async (endpoint, payload, signal) => {
    if (endpoint === 'cache') {
      signal.throwIfAborted()
      return { ok: true, value: telemetry.snapshot() }
    }
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
        return publicError('usage-unavailable', message)
      }
    }
    const result = await authHandler(endpoint, payload, signal)
    if (endpoint === 'logout' && result.ok === true) usageReader.clear()
    return result
  }
}

export function apply(ctx) {
  const policy = ctx.wsl043CodexBoundary?.resolve(PROVIDER)
    ?? ctx.get?.('wsl043CodexBoundary')?.resolve(PROVIDER)
  if (policy?.fallback !== 'none' || policy?.auth !== 'oauth') {
    throw new Error('Codex route refused an inconsistent provider boundary')
  }

  const telemetry = new CodexCacheTelemetry()
  const store = new DshOAuthCredentialStore(ctx.credentials, CREDENTIAL_REF)
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
    transport: 'auto',
  })
  const profiles = new Map([[PROVIDER, profile]])
  const resolveAuth = () => authModels.getAuth(PROVIDER)
  const adapter = new CodexAdapter({
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
  }, telemetry)
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
    telemetry,
  })

  ctx.provide('wsl043CodexCacheTelemetry', telemetry)
  ctx.provide('wsl043CodexAuth', auth)
  ctx.effect(
    () => ctx.connection.rpc.handle(CHANNEL, handler, { authority: 'loopback' }),
    'wsl043-codex-subscription: loopback account RPC',
  )
}

export { CodexCacheTelemetry, prefixFingerprint } from './cache-telemetry.js'
export { createCodexAuthService, DshOAuthCredentialStore } from './credential-store.js'
export { assertCodexAuthUrl, commandForCodexAuthUrl, openCodexAuthUrl } from './external-url.js'
export { CodexLoginCoordinator, createCodexRpcHandler } from './login-coordinator.js'
export { CODEX_USAGE_URL, createCodexUsageReader, parseCodexUsage } from './usage.js'
