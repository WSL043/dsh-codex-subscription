import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

import { createCodexAuthService, DshOAuthCredentialStore } from './credential-store.js'
import { openCodexAuthUrl } from './external-url.js'
import { CodexLoginCoordinator, createCodexRpcHandler } from './login-coordinator.js'
import {
  createModels,
  openaiCodexSubscriptionProvider,
} from './pi-ai-runtime.js'
import { CODEX_SEARCH_PROVIDER_ID, createCodexSearchProvider } from './codex-search.js'
import { createCodexImageTool } from './codex-images.js'
import { createSubscriptionDiagnostics } from './diagnostics.js'
import {
  DEFAULT_QUICK_QUOTA_VISIBLE,
  DEFAULT_SEARCH_PROVIDER,
  DEFAULT_SPEED_MODE,
  QUICK_QUOTA_FIELD,
  SEARCH_PROVIDER_CODEX,
  SEARCH_PROVIDER_DSH,
  SEARCH_PROVIDER_FIELD,
  SETTINGS_NAMESPACE,
  SPEED_MODE_FAST,
  SPEED_MODE_FIELD,
  SPEED_MODE_STANDARD,
} from './settings-contract.js'
import { createCodexUsageReader } from './usage.js'

export const name = 'codex-subscription'
export const inject = ['llm', 'credentials', 'connection', 'settings', 'web', 'loader', 'tools', 'attachments']

const PROVIDER = 'openai-codex'
const CREDENTIAL_REF = credentialRef('OPENAI_CODEX_SUBSCRIPTION_OAUTH')
const LEGACY_CREDENTIAL_REF = credentialRef('WSL043_OPENAI_CODEX_OAUTH')
const CHANNEL = '/codex-subscription'
const WEB_ENTRY_ID = 'web'
const DSH_SEARCH_PROVIDER_FALLBACK = 'deepseek-official'

const publicError = (code, message) => ({
  ok: false,
  error: { code, message, details: { issues: [] } },
})

export function createSubscriptionRpcHandler({ authHandler, usageReader, preferences, diagnosticsReader }) {
  return async (endpoint, payload, signal) => {
    if (endpoint === 'diagnostics') {
      try {
        signal.throwIfAborted()
        return { ok: true, value: await diagnosticsReader() }
      } catch (error) {
        if (signal.aborted) throw error
        return publicError('internal', 'Could not create support diagnostics')
      }
    }
    if (endpoint === 'preferences/status' || endpoint === 'preferences/update') {
      try {
        signal.throwIfAborted()
        if (endpoint === 'preferences/update') {
          const patch = {}
          if (Object.hasOwn(payload ?? {}, QUICK_QUOTA_FIELD)) {
            if (typeof payload[QUICK_QUOTA_FIELD] !== 'boolean') {
              return publicError('internal', 'Invalid quick quota preference')
            }
            patch[QUICK_QUOTA_FIELD] = payload[QUICK_QUOTA_FIELD]
          }
          if (Object.hasOwn(payload ?? {}, SEARCH_PROVIDER_FIELD)) {
            if (![SEARCH_PROVIDER_DSH, SEARCH_PROVIDER_CODEX].includes(payload[SEARCH_PROVIDER_FIELD])) {
              return publicError('internal', 'Invalid search provider preference')
            }
            patch[SEARCH_PROVIDER_FIELD] = payload[SEARCH_PROVIDER_FIELD]
          }
          if (Object.hasOwn(payload ?? {}, SPEED_MODE_FIELD)) {
            if (![SPEED_MODE_STANDARD, SPEED_MODE_FAST].includes(payload[SPEED_MODE_FIELD])) {
              return publicError('internal', 'Invalid speed mode preference')
            }
            patch[SPEED_MODE_FIELD] = payload[SPEED_MODE_FIELD]
          }
          if (Object.keys(patch).length === 0) {
            return publicError('internal', 'Invalid preference update')
          }
          await preferences.update(patch)
        }
        return { ok: true, value: preferences.status() }
      } catch (error) {
        if (signal.aborted) throw error
        return publicError('internal', 'Could not update preferences')
      }
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
        return publicError('internal', message)
      }
    }
    const result = await authHandler(endpoint, payload, signal)
    if (endpoint === 'logout' && result.ok === true) usageReader.clear()
    return result
  }
}

export function createSearchProviderSwitcher(loader) {
  const webEntry = () => [...loader.entries()].find(entry => entry.options?.id === WEB_ENTRY_ID)
  return Object.freeze({
    async select(selection) {
      const entry = webEntry()
      const fiber = entry?.fiber
      if (entry === undefined || fiber === undefined || typeof fiber.update !== 'function') {
        throw new Error('DSH web runtime is unavailable')
      }
      const baseConfig = entry.options?.config ?? {}
      const currentConfig = fiber.config ?? baseConfig
      const dshProvider = typeof baseConfig.searchProvider === 'string' && baseConfig.searchProvider.length > 0
        ? baseConfig.searchProvider
        : DSH_SEARCH_PROVIDER_FALLBACK
      const provider = selection === SEARCH_PROVIDER_CODEX ? CODEX_SEARCH_PROVIDER_ID : dshProvider
      if (currentConfig.searchProvider === provider) return
      await fiber.update({ ...currentConfig, searchProvider: provider }, true)
    },
  })
}

export function apply(ctx) {
  const settings = ctx.settings.register(settingsNamespace(SETTINGS_NAMESPACE), z.object({
    [QUICK_QUOTA_FIELD]: z.boolean().default(DEFAULT_QUICK_QUOTA_VISIBLE),
    [SEARCH_PROVIDER_FIELD]: z.union([SEARCH_PROVIDER_DSH, SEARCH_PROVIDER_CODEX]).default(DEFAULT_SEARCH_PROVIDER),
    [SPEED_MODE_FIELD]: z.union([SPEED_MODE_STANDARD, SPEED_MODE_FAST]).default(DEFAULT_SPEED_MODE),
  }))
  const searchProvider = createSearchProviderSwitcher(ctx.loader)
  const preferences = {
    status: () => ({
      [QUICK_QUOTA_FIELD]: settings.get()[QUICK_QUOTA_FIELD],
      [SEARCH_PROVIDER_FIELD]: settings.get()[SEARCH_PROVIDER_FIELD],
      [SPEED_MODE_FIELD]: settings.get()[SPEED_MODE_FIELD],
      writable: ctx.settings.writable,
    }),
    update: patch => settings.update(patch),
  }

  const store = new DshOAuthCredentialStore(ctx.credentials, CREDENTIAL_REF, [LEGACY_CREDENTIAL_REF])
  const provider = openaiCodexSubscriptionProvider({
    resolveSpeedMode: () => settings.get()[SPEED_MODE_FIELD],
  })
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
  const adapterAuth = Object.freeze({
    credentials: store,
    authContext: Object.freeze({
      env: async () => undefined,
      fileExists: async () => false,
    }),
  })
  ctx.tools.register(createCodexImageTool({
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
    attachments: ctx.attachments,
  }))
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
    auth: adapterAuth,
    resolveAttachments: () => ctx.get?.('attachments'),
  })
  ctx.llm.registerAdapter([PROVIDER], adapter)
  const currentAgent = () => ctx.get?.('agents')?.currentInitiator?.()
  ctx.web.registerSearchProvider(createCodexSearchProvider({
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
    resolveModel: () => {
      const request = currentAgent()?.session.requestContext?.()
      return request?.provider === PROVIDER ? request.model : undefined
    },
    resolveSessionId: () => currentAgent()?.session.id,
  }))
  ctx.effect(() => {
    const select = async value => {
      try {
        await searchProvider.select(value[SEARCH_PROVIDER_FIELD])
      } catch (error) {
        ctx.logger?.warn?.('could not select the configured web search provider: %s', error.message)
      }
    }
    void select(settings.get())
    return settings.watch(select)
  }, 'codex-subscription: search provider selection')

  const auth = createCodexAuthService(authModels, store)
  const coordinator = new CodexLoginCoordinator(auth)
  const usageReader = createCodexUsageReader({
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
  })
  const handler = createSubscriptionRpcHandler({
    authHandler: createCodexRpcHandler(coordinator, { openExternal: openCodexAuthUrl }),
    usageReader,
    preferences,
    diagnosticsReader: () => createSubscriptionDiagnostics({ auth, preferences }),
  })

  ctx.effect(
    () => ctx.connection.rpc.handle(CHANNEL, handler, { authority: 'loopback' }),
    'codex-subscription: loopback account RPC',
  )
}

export { createCodexAuthService, DshOAuthCredentialStore } from './credential-store.js'
export { createSubscriptionDiagnostics } from './diagnostics.js'
export { assertCodexAuthUrl, commandForCodexAuthUrl, openCodexAuthUrl } from './external-url.js'
export { CodexLoginCoordinator, createCodexRpcHandler } from './login-coordinator.js'
export { CODEX_USAGE_URL, createCodexUsageReader, parseCodexUsage } from './usage.js'
export {
  CODEX_IMAGE_GENERATION_URL,
  CODEX_IMAGE_TOOL_NAME,
  createCodexImageTool,
  decodeCodexPng,
} from './codex-images.js'
