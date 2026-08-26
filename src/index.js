import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

import { createCodexAuthService, DshOAuthCredentialStore } from './credential-store.js'
import { openCodexAuthUrl } from './external-url.js'
import { CodexLoginCoordinator, createCodexRpcHandler } from './login-coordinator.js'
import { createCodexNetworkTransport } from './oauth-network.js'
import {
  createModels,
  openaiCodexProvider,
  openaiCodexSubscriptionProvider,
} from './pi-ai-runtime.js'
import { createOfficialModelCatalog } from './model-catalog.js'
import { CODEX_AUTO_SEARCH_PROVIDER_ID, CODEX_SEARCH_PROVIDER_ID, createCodexAutoSearchProvider, createCodexSearchProvider } from './codex-search.js'
import { createCodexImageTool } from './codex-images.js'
import { createSubscriptionDiagnostics } from './diagnostics.js'
import {
  CONTEXT_MODE_CUSTOM,
  CONTEXT_MODE_EXTENDED,
  CONTEXT_MODE_FIELD,
  CONTEXT_MODE_STANDARD,
  contextModelGroups,
  CUSTOM_CONTEXT_MODEL_CAPS,
  CUSTOM_CONTEXT_MODEL_DEFAULTS,
  CUSTOM_CONTEXT_MODEL_FIELDS,
  CUSTOM_CONTEXT_WINDOW_FIELD,
  DEFAULT_CONTEXT_MODE,
  DEFAULT_CUSTOM_CONTEXT_WINDOW,
  DEFAULT_OUTPUT_VERBOSITY,
  LEGACY_QUICK_QUOTA_FIELD,
  normalizeQuickQuotaMode,
  normalizeOutputVerbosity,
  DEFAULT_SEARCH_PROVIDER,
  DEFAULT_SPEED_MODE,
  QUICK_QUOTA_MODE_BAR,
  QUICK_QUOTA_MODE_FIELD,
  QUICK_QUOTA_MODE_OFF,
  QUICK_QUOTA_MODE_PERCENT,
  OUTPUT_VERBOSITY_DEFAULT,
  OUTPUT_VERBOSITY_FIELD,
  OUTPUT_VERBOSITY_HIGH,
  OUTPUT_VERBOSITY_LOW,
  OUTPUT_VERBOSITY_MEDIUM,
  SEARCH_PROVIDER_AUTO,
  SEARCH_PROVIDER_CODEX,
  SEARCH_PROVIDER_DSH,
  SEARCH_PROVIDER_FIELD,
  SETTINGS_NAMESPACE,
  SPEED_MODE_FAST,
  SPEED_MODE_FIELD,
  SPEED_MODE_STANDARD,
  normalizeContextMode,
  normalizeCustomContextWindow,
} from './settings-contract.js'
import { createCodexUsageReader } from './usage.js'
import { createCodexResetCreditService } from './reset-credits.js'

export const name = 'codex-subscription'
export const inject = ['llm', 'credentials', 'connection', 'settings', 'web', 'loader', 'tools', 'attachments']

const PROVIDER = 'openai-codex'
const CREDENTIAL_REF = credentialRef('OPENAI_CODEX_SUBSCRIPTION_OAUTH')
const LEGACY_CREDENTIAL_REF = credentialRef('WSL043_OPENAI_CODEX_OAUTH')
const CHANNEL = '/codex-subscription'
const WEB_ENTRY_ID = 'web'
const DSH_SEARCH_PROVIDER_FALLBACK = 'deepseek-official'
const MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
const REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
const REQUEST_IMAGE_MAX_BYTES = 1024 * 1024

const publicError = (code, message) => ({
  ok: false,
  error: { code, message, details: { issues: [] } },
})

export function createSubscriptionRpcHandler({ authHandler, usageReader, resetCreditService, preferences, diagnosticsReader, modelCatalog }) {
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
          if (Object.hasOwn(payload ?? {}, QUICK_QUOTA_MODE_FIELD)) {
            if (![QUICK_QUOTA_MODE_OFF, QUICK_QUOTA_MODE_PERCENT, QUICK_QUOTA_MODE_BAR].includes(payload[QUICK_QUOTA_MODE_FIELD])) {
              return publicError('internal', 'Invalid quick quota preference')
            }
            patch[QUICK_QUOTA_MODE_FIELD] = payload[QUICK_QUOTA_MODE_FIELD]
          }
          if (Object.hasOwn(payload ?? {}, SEARCH_PROVIDER_FIELD)) {
            if (![SEARCH_PROVIDER_AUTO, SEARCH_PROVIDER_DSH, SEARCH_PROVIDER_CODEX].includes(payload[SEARCH_PROVIDER_FIELD])) {
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
          if (Object.hasOwn(payload ?? {}, OUTPUT_VERBOSITY_FIELD)) {
            if (![OUTPUT_VERBOSITY_DEFAULT, OUTPUT_VERBOSITY_LOW, OUTPUT_VERBOSITY_MEDIUM, OUTPUT_VERBOSITY_HIGH].includes(payload[OUTPUT_VERBOSITY_FIELD])) {
              return publicError('internal', 'Invalid output verbosity preference')
            }
            patch[OUTPUT_VERBOSITY_FIELD] = payload[OUTPUT_VERBOSITY_FIELD]
          }
          if (Object.hasOwn(payload ?? {}, CONTEXT_MODE_FIELD)) {
            if (![CONTEXT_MODE_STANDARD, CONTEXT_MODE_EXTENDED, CONTEXT_MODE_CUSTOM].includes(payload[CONTEXT_MODE_FIELD])) {
              return publicError('internal', 'Invalid context mode preference')
            }
            patch[CONTEXT_MODE_FIELD] = payload[CONTEXT_MODE_FIELD]
          }
          if (Object.hasOwn(payload ?? {}, CUSTOM_CONTEXT_WINDOW_FIELD)) {
            if (normalizeCustomContextWindow(payload[CUSTOM_CONTEXT_WINDOW_FIELD]) !== payload[CUSTOM_CONTEXT_WINDOW_FIELD]) {
              return publicError('internal', 'Invalid custom context window')
            }
            patch[CUSTOM_CONTEXT_WINDOW_FIELD] = payload[CUSTOM_CONTEXT_WINDOW_FIELD]
          }
          for (const [modelKey, field] of Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS)) {
            if (!Object.hasOwn(payload ?? {}, field)) continue
            if (normalizeCustomContextWindow(payload[field], CUSTOM_CONTEXT_MODEL_CAPS[modelKey]) !== payload[field]) {
              return publicError('internal', 'Invalid custom model context window')
            }
            patch[field] = payload[field]
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
    if (endpoint === 'reset-credit/inspect' || endpoint === 'reset-credit/prepare' || endpoint === 'reset-credit/consume') {
      try {
        signal.throwIfAborted()
        const value = endpoint === 'reset-credit/inspect'
          ? await resetCreditService.inspect({ signal })
          : endpoint === 'reset-credit/prepare'
            ? await resetCreditService.prepare({ signal })
            : await resetCreditService.consume({
            challengeId: payload?.challengeId,
            acknowledged: payload?.acknowledged,
            signal,
            })
        return { ok: true, value }
      } catch (error) {
        if (signal.aborted) throw error
        const known = new Set([
          'ChatGPT subscription is not signed in',
          'ChatGPT sign-in needs to be renewed',
          'No quota reset is available',
          'No usable quota reset is available',
          'The available quota reset expires too soon',
          'This quota reset confirmation is no longer valid',
          'This quota reset is already in progress',
          'Wait before confirming this quota reset',
          'You must acknowledge that one quota reset will be consumed',
          'The signed-in ChatGPT account changed',
        ])
        const fallback = endpoint === 'reset-credit/inspect'
          ? 'Could not read quota reset details'
          : endpoint === 'reset-credit/prepare'
            ? 'Could not prepare a quota reset'
            : 'Could not use the quota reset'
        const message = error instanceof Error && known.has(error.message) ? error.message : fallback
        return publicError('internal', message)
      }
    }
    const result = await authHandler(endpoint, payload, signal)
    if (endpoint === 'logout' && result.ok === true) {
      usageReader.clear()
      resetCreditService.clear()
      modelCatalog?.clear()
    } else if (result.ok === true && (endpoint === 'status' || result.value?.authenticated === true)) {
      void modelCatalog?.refresh({ signal: undefined }).catch(() => {})
    }
    return result
  }
}

export function createSearchProviderSwitcher(loader) {
  const webEntry = () => [...loader.entries()].find(entry => entry.options?.id === WEB_ENTRY_ID)
  const dshProviderId = () => {
    const baseConfig = webEntry()?.options?.config ?? {}
    return typeof baseConfig.searchProvider === 'string' && baseConfig.searchProvider.length > 0
      ? baseConfig.searchProvider
      : DSH_SEARCH_PROVIDER_FALLBACK
  }
  return Object.freeze({
    dshProviderId,
    async select(selection) {
      const entry = webEntry()
      const fiber = entry?.fiber
      if (entry === undefined || fiber === undefined || typeof fiber.update !== 'function') {
        throw new Error('DSH web runtime is unavailable')
      }
      const baseConfig = entry.options?.config ?? {}
      const currentConfig = fiber.config ?? baseConfig
      const dshProvider = dshProviderId()
      const provider = selection === SEARCH_PROVIDER_CODEX
        ? CODEX_SEARCH_PROVIDER_ID
        : selection === SEARCH_PROVIDER_AUTO
          ? CODEX_AUTO_SEARCH_PROVIDER_ID
          : dshProvider
      if (currentConfig.searchProvider === provider) return
      await fiber.update({ ...currentConfig, searchProvider: provider }, true)
    },
  })
}

export function apply(ctx) {
  const settings = ctx.settings.register(settingsNamespace(SETTINGS_NAMESPACE), z.object({
    [QUICK_QUOTA_MODE_FIELD]: z.union([QUICK_QUOTA_MODE_OFF, QUICK_QUOTA_MODE_PERCENT, QUICK_QUOTA_MODE_BAR]),
    [LEGACY_QUICK_QUOTA_FIELD]: z.boolean(),
    [SEARCH_PROVIDER_FIELD]: z.union([SEARCH_PROVIDER_AUTO, SEARCH_PROVIDER_DSH, SEARCH_PROVIDER_CODEX]).default(DEFAULT_SEARCH_PROVIDER),
    [SPEED_MODE_FIELD]: z.union([SPEED_MODE_STANDARD, SPEED_MODE_FAST]).default(DEFAULT_SPEED_MODE),
    [OUTPUT_VERBOSITY_FIELD]: z.union([OUTPUT_VERBOSITY_DEFAULT, OUTPUT_VERBOSITY_LOW, OUTPUT_VERBOSITY_MEDIUM, OUTPUT_VERBOSITY_HIGH]).default(DEFAULT_OUTPUT_VERBOSITY),
    [CONTEXT_MODE_FIELD]: z.union([CONTEXT_MODE_STANDARD, CONTEXT_MODE_EXTENDED, CONTEXT_MODE_CUSTOM]).default(DEFAULT_CONTEXT_MODE),
    [CUSTOM_CONTEXT_WINDOW_FIELD]: z.number().step(1).min(128_000).max(1_000_000).default(DEFAULT_CUSTOM_CONTEXT_WINDOW),
    ...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [field, z.number().step(1).min(128_000).max(CUSTOM_CONTEXT_MODEL_CAPS[modelKey]).default(CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey])])),
  }))
  const searchProvider = createSearchProviderSwitcher(ctx.loader)
  const network = createCodexNetworkTransport()
  const store = new DshOAuthCredentialStore(ctx.credentials, CREDENTIAL_REF, [LEGACY_CREDENTIAL_REF])
  const baseProvider = openaiCodexProvider()
  let resolveAuth = async () => undefined
  const modelCatalog = createOfficialModelCatalog({
    getAuth: options => resolveAuth(options),
    readCredential: options => store.read(PROVIDER, options),
    baseModels: () => baseProvider.getModels(),
    fetch: (input, init) => network.fetch('catalog', input, init),
  })
  const provider = openaiCodexSubscriptionProvider({
    resolveSpeedMode: () => settings.get()[SPEED_MODE_FIELD],
    resolveOutputVerbosity: () => normalizeOutputVerbosity(settings.get()[OUTPUT_VERBOSITY_FIELD]),
    resolveContextMode: () => normalizeContextMode(settings.get()[CONTEXT_MODE_FIELD]),
    resolveCustomContextWindow: modelKey => {
      const field = CUSTOM_CONTEXT_MODEL_FIELDS[modelKey]
      return normalizeCustomContextWindow(settings.get()[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey])
    },
    catalog: modelCatalog,
    runNetwork: network.run,
  })
  const preferences = {
    status: () => ({
      [QUICK_QUOTA_MODE_FIELD]: normalizeQuickQuotaMode(
        settings.get()[QUICK_QUOTA_MODE_FIELD],
        settings.get()[LEGACY_QUICK_QUOTA_FIELD],
      ),
      [SEARCH_PROVIDER_FIELD]: settings.get()[SEARCH_PROVIDER_FIELD],
      [SPEED_MODE_FIELD]: settings.get()[SPEED_MODE_FIELD],
      [OUTPUT_VERBOSITY_FIELD]: normalizeOutputVerbosity(settings.get()[OUTPUT_VERBOSITY_FIELD]),
      [CONTEXT_MODE_FIELD]: normalizeContextMode(settings.get()[CONTEXT_MODE_FIELD]),
      [CUSTOM_CONTEXT_WINDOW_FIELD]: normalizeCustomContextWindow(settings.get()[CUSTOM_CONTEXT_WINDOW_FIELD]),
      ...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [field, normalizeCustomContextWindow(settings.get()[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey])])),
      contextModels: contextModelGroups(provider.getModels()),
      verbosityModels: provider.getModels().filter(model => modelCatalog.metadata(model.id)?.supportVerbosity ?? model.id !== 'gpt-5.3-codex-spark').map(model => model.id),
      writable: ctx.settings.writable,
    }),
    update: patch => settings.update(patch),
  }

  const authModels = createModels({ credentials: store })
  authModels.setProvider(provider)
  const profile = Object.freeze({
    provider: PROVIDER,
    displayName: 'ChatGPT subscription',
    piProvider: provider,
    configuredMaxTokens: new Map(),
    streamIdleTimeoutMs: 10 * 60 * 1000,
    // Custom PiAiAdapter profiles bypass the settings-backed profile resolver,
    // so request-image limits must be complete here rather than left undefined.
    maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: REQUEST_IMAGE_MAX_BYTES,
    // pi-ai owns prompt_cache_key and encrypted reasoning replay. The explicit
    // profile values make the subscription cache contract auditable.
    cacheRetention: 'short',
    // DSH rc.6 resolves pi-ai 0.82.x, whose cached WebSocket pool is keyed by
    // session only. SSE avoids cross-account connection reuse after sign-out.
    transport: 'sse',
  })
  let profileKey
  let profileSnapshot
  const profiles = () => {
    const key = [modelCatalog.revision(), normalizeContextMode(settings.get()[CONTEXT_MODE_FIELD]), ...Object.values(CUSTOM_CONTEXT_MODEL_FIELDS).map(field => settings.get()[field])].join(':')
    if (key !== profileKey) {
      profileKey = key
      profileSnapshot = new Map([[PROVIDER, profile]])
    }
    return profileSnapshot
  }
  resolveAuth = () => authModels.getAuth(PROVIDER)
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
    fetch: (input, init) => network.fetch('image', input, init),
  }))
  const adapter = new PiAiAdapter({
    profiles,
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
  const codexSearch = createCodexSearchProvider({
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
    resolveModel: () => {
      const request = currentAgent()?.session.requestContext?.()
      return request?.provider === PROVIDER ? request.model : undefined
    },
    resolveSessionId: () => currentAgent()?.session.id,
    fetch: (input, init) => network.fetch('search', input, init),
  })
  ctx.web.registerSearchProvider(codexSearch)
  ctx.web.registerSearchProvider(createCodexAutoSearchProvider({
    codex: codexSearch,
    resolveModelProvider: () => currentAgent()?.session.requestContext?.()?.provider,
    resolveDshProvider: () => ctx.web.searchProviders?.get(searchProvider.dshProviderId()),
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

  const auth = createCodexAuthService(authModels, store, { runLogin: operation => network.run('login', operation) })
  const coordinator = new CodexLoginCoordinator(auth)
  const usageReader = createCodexUsageReader({
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
    fetch: (input, init) => network.fetch('quota', input, init),
  })
  const resetCreditService = createCodexResetCreditService({
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
    usageReader,
    fetch: (input, init) => network.fetch('quota-reset', input, init),
  })
  const handler = createSubscriptionRpcHandler({
    authHandler: createCodexRpcHandler(coordinator, { openExternal: openCodexAuthUrl }),
    usageReader,
    resetCreditService,
    preferences,
    diagnosticsReader: () => createSubscriptionDiagnostics({ auth, preferences, login: coordinator.supportState(), network }),
    modelCatalog,
  })

  ctx.effect(() => {
    void modelCatalog.refresh().catch(error => ctx.logger?.debug?.('could not refresh Codex model catalog: %s', error.message))
  }, 'codex-subscription: official model catalog')

  ctx.effect(
    () => ctx.connection.rpc.handle(CHANNEL, handler, { authority: 'loopback' }),
    'codex-subscription: loopback account RPC',
  )
}

export { createCodexAuthService, DshOAuthCredentialStore } from './credential-store.js'
export { createSubscriptionDiagnostics } from './diagnostics.js'
export { normalizeContextMode, normalizeCustomContextWindow } from './settings-contract.js'
export { assertCodexAuthUrl, commandForCodexAuthUrl, openCodexAuthUrl } from './external-url.js'
export { CodexLoginCoordinator, createCodexRpcHandler } from './login-coordinator.js'
export { CODEX_USAGE_URL, createCodexUsageReader, parseCodexUsage } from './usage.js'
export {
  CODEX_RESET_CONSUME_URL,
  CODEX_RESET_CREDITS_URL,
  createCodexResetCreditService,
} from './reset-credits.js'
export {
  CODEX_IMAGE_GENERATION_URL,
  CODEX_IMAGE_TOOL_NAME,
  createCodexImageTool,
  decodeCodexPng,
} from './codex-images.js'
