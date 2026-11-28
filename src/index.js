import { createSettingsAdapter } from './settings-adapter.js'
import { dirname, isAbsolute, join } from 'node:path'
import { createSessionPreferences, inheritedCodexSpeed, safeSessionPreferences } from './session-preferences.js'
import { observeAdapter } from './request-observer.js'
import { createHiddenModelDirectory } from './hidden-model-directory.js'
import { createDefaultModelController } from './default-model.js'
import { withDefaultReasoningEffort } from './default-reasoning-effort.js'
import { DEFAULT_REASONING_EFFORT_FIELD, normalizeDefaultReasoningEffort } from './settings-contract.js'
import { PREFERENCE_FIELDS, normalizeReasoningCache } from './preference-fields.js'
import { createSubscriptionPreferencesTool } from './subscription-preferences-tool.js'
import { createSubscriptionConnection } from './subscription-connection.js'
import { createCompactionBridge } from './subscription-compaction.js'
import { createReasoningBridge } from './subscription-reasoning.js'
import { registerSubscriptionTransport } from './subscription-transport.js'
import { createSubagentBackendSwitcher, createSubscriptionSubagent, loadSubagentRuntime, presetEntries, subagentConfigListener } from './subagent-backend.js'
import { createSubagentDefaults, normalizeSubagentModel, normalizeSubagentEffort } from './subagent-defaults.js'
import { inspectSubagentRuntime } from './subagent-runtime.js'
import { createSubagentCli } from './subagent-cli.js'
import { createRuntimeManagement } from './runtime-management.js'
import { createSketchAgentBridge } from './sketch-agent-bridge.js'
import { createSketchAgentTool } from './sketch-agent-tool.js'
import * as dshCredentials from '@deepseek-ai/dsh-credentials'
import WebSocket from 'ws'
import { hostname } from 'node:os'
import { watchFile, unwatchFile } from 'node:fs'
import { readSubscriptionCredentials } from './subscription-credentials.js'
import { USER_AGENT } from './version.js'
import { createRemoteControl } from './remote-control.js'
import { createDshRemoteControl } from './remote-control-dsh.js'
import { createVoiceHangupClassifier } from './voice-hangup.js'
import { createRemoteHistorySource } from './remote-history-source.js'
import { createUltraExecutionPreset } from './ultra-execution.js'
import { createRemoteImageAssets } from './remote-image-assets.js'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import * as dshLlm from '@deepseek-ai/dsh-llm'
import { retryPolicyFor } from './retry-policy.js'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { createRequire } from 'node:module'

// Match the settings host's volatile protocol, not a stale profile-local peer.
const z = createRequire(import.meta.resolve('@deepseek-ai/dsh-settings'))('@deepseek-ai/schemastery')

import { createCodexAuthService, DshOAuthCredentialStore } from './credential-store.js'
import { DshOAuthAccountVault } from './account-vault.js'
import { openCodexAuthUrl } from './external-url.js'
import { CodexLoginCoordinator, createCodexRpcHandler } from './login-coordinator.js'
import { createCodexNetworkTransport, resolveCodexOAuthProxy } from './oauth-network.js'
import { createModels, openaiCodexProvider, openaiCodexSubscriptionProvider } from './pi-ai-runtime.js'
import { createOfficialModelCatalog, latestCodexLuna, withModelCatalogReady } from './model-catalog.js'
import { readCapabilitySettings, normalizeSearchDomains, CUSTOM_CONTEXT_OVERRIDES_FIELD, SEARCH_MODE_FIELD, SEARCH_MODES, SEARCH_DOMAINS_FIELD, QUOTA_ALERTS_FIELD, QUOTA_ALERT_MODES, QUOTA_THRESHOLD_FIELDS, MAX_CONTEXT_BUDGET } from './capability-settings.js'
import { DSH_SEARCH_PROVIDER_ID, createDshSearchProvider } from './dsh-search.js'
import { createSearchRouter, gateSearchProvider } from './search-router.js'
import { createWebProviderSettings } from './web-provider-settings.js'
import { CODEX_AUTO_SEARCH_PROVIDER_ID, CODEX_SEARCH_PROVIDER_ID, createCodexAutoSearchProvider, createCodexSearchProvider } from './codex-search.js'
import { CODEX_FETCH_PROVIDER_ID, CODEX_FETCH_FALLBACK_PROVIDER_ID, createCodexFetchProvider, createCodexFallbackFetchProvider, createCodexFetchRouter, configuredFetchProviderId, resolveDshFetchProvider } from './codex-fetch.js'
import { WebError } from '@deepseek-ai/dsh-web'
import { FETCH_CHAIN_PROVIDER_ID, FETCH_ORDER_FIELD, validateFetchOrder } from './fetch-order.js'
import { createFetchChainProvider } from './fetch-chain.js'
import { createFetchOrderSettings } from './fetch-order-settings.js'
import { FETCH_PROVIDER_FIELD, FETCH_PROVIDER_CODEX, FETCH_PROVIDER_CODEX_FALLBACK, normalizeFetchProvider } from './settings-contract.js'
import { createCodexImageTool } from './codex-images.js'
import { IMAGE_FEATURE_DEFAULTS } from './image-features.js'
import { watchImageTool } from './image-tool-registration.js'
import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL } from './image-models.js'
import { OriginalImageStore } from './image-original-store.js'
import { inheritedOriginalImageRef } from './image-original-contract.js'
import { createSubscriptionDiagnostics } from './diagnostics.js'
import { diagnosticLog } from './diagnostic-log.js'
import { createVoiceTranscriptRecovery } from './voice-transcript-recovery.js'
import { createVoiceResultStore } from './voice-result-delivery.js'
import { setAuthFailureLogger } from './http-failure.js'
import { PACKAGE_VERSION } from './version.js'
import { hostDshVersion } from './subagent-runtime.js'
import { createDiagnosticOperations } from './diagnostic-operations.js'
import { VOICE_CALL_FIELD, VOICE_VOICE_FIELD, VOICE_LANGUAGE_FIELD, normalizeVoiceCall, normalizeVoiceVoice, normalizeVoiceLanguage, AUTO_QUOTA_RETRY_FIELD, CONNECTORS_FIELD, normalizeConnectorMode, CONTEXT_MODE_FIELD, contextModelGroups, CUSTOM_CONTEXT_MODEL_CAPS, CUSTOM_CONTEXT_MODEL_DEFAULTS, CUSTOM_CONTEXT_MODEL_FIELDS, CUSTOM_CONTEXT_WINDOW_FIELD, DEFAULT_AUTO_QUOTA_RETRY, DEFAULT_CUSTOM_CONTEXT_WINDOW, DISABLED_MODELS_FIELD, INPUT_IMAGE_DETAIL_FIELD, REASONING_SUMMARY_FIELD, normalizeReasoningSummary, RETRY_POLICY_FIELD, normalizeRetryPolicy, STREAM_IDLE_TIMEOUT_MINUTES_FIELD, LEGACY_QUICK_QUOTA_FIELD, normalizeAutoQuotaRetry, normalizeDisabledModels, normalizeInputImageDetail, normalizeQuickQuotaMode, normalizeOutputVerbosity, normalizeStreamIdleTimeoutMinutes, QUICK_QUOTA_MODE_FORECAST, QUICK_QUOTA_MODE_FIELD, OUTPUT_VERBOSITY_FIELD, SEARCH_PROVIDER_AUTO, SEARCH_PROVIDER_CODEX, SEARCH_PROVIDER_DSH, SEARCH_PROVIDER_FIELD, SPEED_MODE_FIELD, SPEED_SHORTCUT_FIELD, normalizeSpeedShortcut, normalizeComposerModelPicker, normalizeContextMode, normalizeCustomContextWindow, supportsCodexFastMode, ACCOUNT_FAILOVER_FIELD, DEFAULT_ACCOUNT_FAILOVER, normalizeAccountFailover } from './settings-contract.js'
import { CONNECTOR_ACCOUNT_FIELD, DEFAULT_CONNECTOR_ACCOUNT, MAX_CONNECTOR_ACCOUNT_LENGTH } from './settings-contract.js'
import { createCodexUsageReader } from './usage.js'
import { accountCredentialStore, createAccountUsageReader } from './account-usage.js'
import { createPlanHistoryReader } from './plan-history.js'
import { createUsageProfileReader } from './usage-profile.js'
import { createConnectorAccountRouter, createConnectorTools } from './connectors.js'
import { catalogModelsReady, createCodexQuotaRetryHandler } from './quota-retry.js'
import { createAccountFailover } from './account-failover.js'
import { applyAccountTransition } from './account-transition.js'
import { createQuotaForecastReader } from './quota-forecast.js'
import { QuotaForecastStateStore } from './quota-forecast-store.js'
import { createCodexResetCreditService } from './reset-credits.js'

export const name = 'codex-subscription'
export const inject = ['llm', 'credentials', 'settings', 'web', 'loader', 'tools', 'attachments']

const PROVIDER = 'openai-codex'
const OAUTH_EXPIRY_SKEW_MS = 60_000
const CREDENTIAL_REF = dshCredentials.credentialRef('OPENAI_CODEX_SUBSCRIPTION_OAUTH')
const LEGACY_CREDENTIAL_REF = dshCredentials.credentialRef('WSL043_OPENAI_CODEX_OAUTH')
const ACCOUNT_VAULT_KEY = dshCredentials.credentialKey('codex-subscription', 'accounts')
const WEB_ENTRY_ID = 'web'
const DSH_SEARCH_PROVIDER_FALLBACK = 'deepseek-official'
const SUBSCRIPTION_SEARCH_PROVIDER_IDS = new Set([CODEX_SEARCH_PROVIDER_ID, CODEX_AUTO_SEARCH_PROVIDER_ID, DSH_SEARCH_PROVIDER_ID])
const MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
const REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
const REQUEST_IMAGE_MAX_BYTES = 1024 * 1024

import { CUSTOM_INSTRUCTIONS_FIELD, CUSTOM_INSTRUCTIONS_LIMIT } from './settings-contract.js'
import { createSubscriptionRpcHandler } from './subscription-rpc.js'
import { createVoicePreview } from './voice-preview.js'
import { createComposerPredictions } from './composer-predictions.js'
import { withEndCallTool } from './voice-tools.js'
import { createNativeVoiceHost } from './voice-native-host.js'
export { createSubscriptionRpcHandler } from './subscription-rpc.js'

export function createSearchProviderSwitcher(loader) {
  const webEntry = () => [...loader.entries()].find(entry => entry.options?.id === WEB_ENTRY_ID)
  // Cordis 4.1 separates active validated config from raw input.
  const current = () => {
    const fiber = webEntry()?.fiber
    const value = (fiber?.effectiveConfig ?? fiber?.config)?.searchProvider
    return typeof value === 'string' ? value : value?.get?.()
  }
  const dshProviderId = () => {
    const active = current()
    const saved = webEntry()?.options?.config?.searchProvider
    return [active, saved].find(id => typeof id === 'string' && id.length > 0 && !SUBSCRIPTION_SEARCH_PROVIDER_IDS.has(id))
      ?? DSH_SEARCH_PROVIDER_FALLBACK
  }
  const writeProvider = async provider => {
    const entry = webEntry()
    const fiber = entry?.fiber
    if (entry === undefined || fiber === undefined || typeof fiber.update !== 'function') {
      throw new Error('DSH web runtime is unavailable')
    }
    if (current() === provider) return
    // Fiber.update takes the raw config and restarts web with it (noSave: the user's settings are untouched).
    // The restart reloads this plugin, which then finds the provider already selected.
    await fiber.update({ ...(entry.options?.config ?? {}), searchProvider: provider }, true)
  }
  // "dsh" uses only the provider the host has configured.
  const select = selection => writeProvider(selection === SEARCH_PROVIDER_CODEX
    ? CODEX_SEARCH_PROVIDER_ID
    : selection === SEARCH_PROVIDER_AUTO ? CODEX_AUTO_SEARCH_PROVIDER_ID : DSH_SEARCH_PROVIDER_ID)
  return Object.freeze({
    dshProviderId,
    current,
    select,
  })
}

const settingsFields = {
  webProvidersManagedByDsh: z.boolean().default(false),
  webSearchFallbackProvider: z.string(),
  webFetchFallbackProvider: z.string(),
  [FETCH_ORDER_FIELD]: z.transform(z.array(z.string()).min(1).max(100), validateFetchOrder),
  [DISABLED_MODELS_FIELD]: z.transform(z.array(z.string()).max(100), normalizeDisabledModels).default([]),
  [AUTO_QUOTA_RETRY_FIELD]: z.boolean().default(DEFAULT_AUTO_QUOTA_RETRY),
  [ACCOUNT_FAILOVER_FIELD]: z.boolean().default(DEFAULT_ACCOUNT_FAILOVER),
  [CUSTOM_INSTRUCTIONS_FIELD]: z.string().max(CUSTOM_INSTRUCTIONS_LIMIT).default(''),
  subagentDefaultModel: z.transform(z.string().max(80), normalizeSubagentModel).default(''),
  [CONNECTOR_ACCOUNT_FIELD]: z.string().max(MAX_CONNECTOR_ACCOUNT_LENGTH).default(DEFAULT_CONNECTOR_ACCOUNT),
  ...Object.fromEntries(Object.entries(PREFERENCE_FIELDS).map(([field, rule]) => [field, rule.default === undefined ? z.union(rule.choices) : z.union(rule.choices).default(rule.default)])),
  imageModel: z.union(Object.keys(IMAGE_MODELS)).default(DEFAULT_IMAGE_MODEL),
  imageQuality: z.union(['auto','low','medium','high','xhigh','max']).default('auto'),
  ...Object.fromEntries(Object.entries(IMAGE_FEATURE_DEFAULTS).map(([key, value]) => [key, z.boolean().default(value)])),
  [CUSTOM_CONTEXT_OVERRIDES_FIELD]: z.dict(z.number().step(1).min(1).max(MAX_CONTEXT_BUDGET)).default({}),
  [SEARCH_MODE_FIELD]: z.union(SEARCH_MODES).default('live'),
  [SEARCH_DOMAINS_FIELD]: z.transform(z.array(z.string()).max(20), normalizeSearchDomains).default([]),
  ...Object.fromEntries(QUOTA_THRESHOLD_FIELDS.map(key => [key, z.number().step(1).min(1).max(100).default(20)])),
  [QUOTA_ALERTS_FIELD]: z.union(QUOTA_ALERT_MODES).default('important'),
  [LEGACY_QUICK_QUOTA_FIELD]: z.boolean(),
  [CUSTOM_CONTEXT_WINDOW_FIELD]: z.number().step(1).min(128_000).max(1_000_000).default(DEFAULT_CUSTOM_CONTEXT_WINDOW),
  ...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [field, z.number().step(1).min(128_000).max(CUSTOM_CONTEXT_MODEL_CAPS[modelKey]).default(CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey])])),
}
// Keep the metadata API usable by older hosts; the host-matched Schemastery
// above also creates the runtime references required by newer volatile loaders.
export const Config = z.object(Object.fromEntries(Object.entries(settingsFields).map(([key, field]) => [key, field.extra('volatile', true)])))

export function apply(ctx, config = {}) {
  const settings = createSettingsAdapter(ctx, config)
  const searchProvider = createSearchProviderSwitcher(ctx.loader)
  const webSettings = createWebProviderSettings(ctx, settings)
  const nativeWebSettings = () => webSettings?.managed() === true
  if (!process.env.NODE_TEST_CONTEXT) diagnosticLog.attach(dshHomePath('state', 'codex-subscription', 'diagnostic-log.jsonl'))
  diagnosticLog.info('plugin', `loaded ${PACKAGE_VERSION}`, `DSH ${hostDshVersion() ?? 'unknown'}, node ${process.version}, ${process.platform}`)
  setAuthFailureLogger((message, detail) => diagnosticLog.error('auth', message, detail))
  const network = createCodexNetworkTransport()
  const diagnosticOperations = createDiagnosticOperations()
  ctx.effect(() => ctx.on?.('tools/result', (exec, result) => diagnosticOperations.tool(exec, result)), 'codex-subscription: operation evidence')
  const originalImages = new OriginalImageStore()
  const accountVault = new DshOAuthAccountVault(ctx.credentials, {
    key: ACCOUNT_VAULT_KEY,
    legacyRef: CREDENTIAL_REF,
    legacyRefs: [LEGACY_CREDENTIAL_REF],
  })
  const store = new DshOAuthCredentialStore(ctx.credentials, CREDENTIAL_REF, [LEGACY_CREDENTIAL_REF], {
    expirySkewMs: OAUTH_EXPIRY_SKEW_MS,
    vault: accountVault,
  })
  const baseProvider = openaiCodexProvider()
  let resolveAuth = async () => undefined
  let subagentBackend
  const subagentCli = createSubagentCli({ profile: () => ctx.get?.('profileContext') })
  const runtimeManagement = createRuntimeManagement({
    inspect: () => inspectSubagentRuntime(undefined, subagentCli), cli: subagentCli,
    active: () => subagentBackend?.activeCount() ?? 0,
    selectDsh: async () => { if (subagentBackend) await subagentBackend.select('dsh'); else await settings.update({ subagentBackend: 'dsh' }) },
  })
  const modelCatalog = createOfficialModelCatalog({
    onUpdated: () => ctx.llm.emitAdaptersUpdated?.(),
    onCacheError: error => ctx.logger?.debug?.('could not access the Codex model catalog cache (%s)', error?.code ?? error?.name ?? 'unknown error'),
    cacheDirectory: dshHomePath('state', 'codex-subscription', 'model-catalog'),
    getAuth: options => resolveAuth(options),
    readCredential: options => store.read(PROVIDER, options),
    baseModels: () => baseProvider.getModels(),
    fetch: (input, init) => network.fetch('catalog', input, init),
    retryDelaysMs: [5_000, 15_000, 30_000, 60_000, 120_000, 300_000],
  })
  const subagentCatalog = createOfficialModelCatalog({
    subagent: true,
    getAuth: options => resolveAuth(options),
    readCredential: options => store.read(PROVIDER, options),
    baseModels: () => baseProvider.getModels(),
    fetch: (input, init) => network.fetch('catalog', input, init),
  })
  ctx.effect(() => () => subagentCatalog.clear())
  const subagentDefaults = createSubagentDefaults({
    readSettings: settings.get, catalog: subagentCatalog,
    modelSelection: () => ctx.get?.('subagentModelSelection')?.current(),
    projections: () => ctx.get?.('sessionProjections'),
  })
  const ultra = createUltraExecutionPreset({
    catalog: modelCatalog,
    resolveAgent: () => ctx.get?.('agents')?.currentInitiator?.(),
    defaultEffort: () => settings.get()[DEFAULT_REASONING_EFFORT_FIELD],
  })
  ctx.inject(['systemPrompt'], scope => scope.effect(() => {
    const dispose = ultra.install(scope)
    ctx.llm.emitAdaptersUpdated?.()
    return () => { dispose(); ctx.llm.emitAdaptersUpdated?.() }
  }, 'codex-subscription: Ultra execution preset'))
  const connection = createSubscriptionConnection({ resolveMode: () => settings.get().connectionMode })
  const requestAccountBySession = new Map()
  // The settings surface edits DSH's own default model instead of keeping a
  // second copy, so every new conversation opens on what the user selected.
  const defaultModel = createDefaultModelController({
    resolveService: () => ctx.get?.('agentDefaultModel'),
    resolveEditor: () => ctx.get?.('configEditor'),
    listModels: () => modelCatalog.getModels().map(model => model.id),
  })
  const accountScope = async () => {
    await resolveAuth()
    const credential = await store.read(PROVIDER)
    return credential?.type === 'oauth' ? credential.accountId : undefined
  }
  const compaction = createCompactionBridge({ enabled: () => settings.get().compactionMode === 'cloud', accountScope })
  const reasoning = createReasoningBridge({
    enabled: () => normalizeReasoningCache(settings.get().reasoningCache) === 'on',
    supportsModel: id => modelCatalog.metadata(id)?.supportsReasoningEffortUpdates === true,
    resolveSession: id => ctx.get?.('sessions')?.get?.(id),
    cloud: () => settings.get().compactionMode === 'cloud',
    unlimited: () => settings.get()[RETRY_POLICY_FIELD] === 'unlimited',
    accountScope,
    diagnostic: reason => diagnosticLog.info('model', `cache-preserving reasoning: ${reason}`),
    lockDiagnostic: event => diagnosticLog[event.event === 'conflict' ? 'warn' : 'info']('model', 'reasoning checkpoint lock', JSON.stringify(event)),
  })
  const profileDir = ctx.get?.('profileContext')?.dir
  const settingsPath = ctx.settings.documentPath
  const preferencesRoot = typeof profileDir === 'string' && isAbsolute(profileDir) ? profileDir
    : typeof settingsPath === 'string' && isAbsolute(settingsPath) ? dirname(settingsPath) : undefined
  const liveSession = id => ctx.get?.('sessions')?.get?.(id)
  const sessionPreferenceError = error => ctx.logger?.warn?.('Could not access Codex session preferences (%s)', error?.code ?? error?.name ?? 'unknown error')
  const sessionPrefs = createSessionPreferences({
    directory: preferencesRoot && join(preferencesRoot, 'state', 'codex-subscription', 'preferences'),
    defaults: settings.get,
    parentSpeed: id => parentSpeed(ctx.get?.('agents')?.get?.(id)),
  })
  const sessionRequestPreferences = session => {
    try { return sessionPrefs.forRequest(session) }
    catch (error) { sessionPreferenceError(error); return safeSessionPreferences }
  }
  const parentSpeed = parent => inheritedCodexSpeed(parent, sessionRequestPreferences, id => modelCatalog.metadata(id))
  try { sessionPrefs.initialize() } catch (error) { sessionPreferenceError(error) }
  ctx.on('session/created', session => {
    reasoning.sessionCreated(session)
    try { sessionPrefs.created(session) } catch (error) { sessionPreferenceError(error) }
  })
  ctx.on('session/disposed', session => {
    reasoning.sessionDisposed(session)
    sessionPrefs.disposed(session)
  })
  const resolveRequestPreferences = options => {
    if (typeof options?.sessionId !== 'string') return settings.get()
    const session = liveSession(options.sessionId)
    return session ? sessionRequestPreferences(session) : safeSessionPreferences
  }
  const resolvePreferenceSession = async (id, signal) => {
    const live = liveSession(id)
    if (live) return live
    // A session can be viewed and configured while its agent is dormant. Use
    // only the stored header; never start an agent or read its log for this RPC.
    const stored = await ctx.get?.('sessionPersistence')?.stat?.(id, { signal })
    const header = stored?.header ?? stored?.meta
    if (header?.id === id) return liveSession(id) ?? { id, header }
  }
  ctx.on('session/event', (session, event) => reasoning.sessionEvent(session, event))
  ctx.effect(() => () => connection.dispose())
  const provider = openaiCodexSubscriptionProvider({
    ultra,
    connection,
    compaction,
    reasoning,
    resolveConversationPreferences: resolveRequestPreferences,
    resolveCustomInstructions: () => settings.get()[CUSTOM_INSTRUCTIONS_FIELD],
    resolveInputImageDetail: () => settings.get()[INPUT_IMAGE_DETAIL_FIELD],
    resolveReasoningSummary: () => settings.get()[REASONING_SUMMARY_FIELD],
    resolveContextMode: () => normalizeContextMode(settings.get()[CONTEXT_MODE_FIELD]),
    resolveCustomContextWindow: modelKey => {
      const overrides = readCapabilitySettings(settings.get())[CUSTOM_CONTEXT_OVERRIDES_FIELD]
      if (Object.hasOwn(overrides, modelKey)) return overrides[modelKey]
      const field = CUSTOM_CONTEXT_MODEL_FIELDS[modelKey]
      if (field === undefined) return undefined
      return normalizeCustomContextWindow(settings.get()[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey])
    },
    resolveReviewModel: () => settings.get().reviewModel,
    catalog: modelCatalog,
    runNetwork: network.run,
    runOAuthRefresh: network.refreshOAuth,
    beginModelAttempt: network.beginModelAttempt,
    onRequestAccount: async ({ sessionId, apiKey }) => {
      const entry = requestAccountBySession.get(sessionId)
      if (!entry || entry.confirmed) return
      const accountId = await accountVault.accountForAccessToken(apiKey).catch(() => undefined)
      if (requestAccountBySession.get(sessionId) === entry) {
        entry.accountId = accountId
        entry.confirmed = true
      }
    },
  })
  let fetchRouted = false
  let fetchOrderSettings
  const preferences = {
    status: () => {
      const models = modelCatalog.getModels()
      return {
        [DISABLED_MODELS_FIELD]: normalizeDisabledModels(settings.get()[DISABLED_MODELS_FIELD]),
        [AUTO_QUOTA_RETRY_FIELD]: normalizeAutoQuotaRetry(settings.get()[AUTO_QUOTA_RETRY_FIELD]),
        [ACCOUNT_FAILOVER_FIELD]: normalizeAccountFailover(settings.get()[ACCOUNT_FAILOVER_FIELD]),
        compactionMode: settings.get().compactionMode ?? 'dsh',
        reasoningCache: normalizeReasoningCache(settings.get().reasoningCache),
        [DEFAULT_REASONING_EFFORT_FIELD]: normalizeDefaultReasoningEffort(settings.get()[DEFAULT_REASONING_EFFORT_FIELD]),
        connectionMode: settings.get().connectionMode ?? 'sse',
        reviewModel: settings.get().reviewModel ?? 'session',
        remoteControl: settings.get().remoteControl ?? 'off',
        composerPredictions: settings.get().composerPredictions === 'on' ? 'on' : 'off',
        composerModelPicker: normalizeComposerModelPicker(settings.get().composerModelPicker),
        otherModels: settings.get().otherModels === 'off' ? 'off' : 'on',
        subagentBackend: settings.get().subagentBackend ?? 'dsh',
        subagentDefaultModel: normalizeSubagentModel(settings.get().subagentDefaultModel),
        subagentDefaultEffort: normalizeSubagentEffort(settings.get().subagentDefaultEffort),
        subagentModels: subagentDefaults.list(),
        subagentBackendAvailable: subagentBackend !== undefined,
        subagentRuntimeInstalled: inspectSubagentRuntime(undefined, subagentCli).installed,
        ...readCapabilitySettings(settings.get()),
        [QUICK_QUOTA_MODE_FIELD]: normalizeQuickQuotaMode(
          settings.get()[QUICK_QUOTA_MODE_FIELD],
          settings.get()[LEGACY_QUICK_QUOTA_FIELD],
        ),
        [SEARCH_PROVIDER_FIELD]: settings.get()[SEARCH_PROVIDER_FIELD],
        [FETCH_PROVIDER_FIELD]: normalizeFetchProvider(settings.get()[FETCH_PROVIDER_FIELD]),
        ...(nativeWebSettings() ? {
          webProvidersManagedByDsh: true,
          webSearchFallbackProvider: settings.get().webSearchFallbackProvider,
          webFetchFallbackProvider: settings.get().webFetchFallbackProvider,
        } : {}),
        fetchRoutingAvailable: fetchRouted,
        ...fetchOrderSettings?.status(),
        [SPEED_MODE_FIELD]: settings.get()[SPEED_MODE_FIELD],
        [SPEED_SHORTCUT_FIELD]: normalizeSpeedShortcut(settings.get()[SPEED_SHORTCUT_FIELD]),
        [CUSTOM_INSTRUCTIONS_FIELD]: settings.get()[CUSTOM_INSTRUCTIONS_FIELD] ?? '',
        [OUTPUT_VERBOSITY_FIELD]: normalizeOutputVerbosity(settings.get()[OUTPUT_VERBOSITY_FIELD]),
        [INPUT_IMAGE_DETAIL_FIELD]: normalizeInputImageDetail(settings.get()[INPUT_IMAGE_DETAIL_FIELD]),
        [REASONING_SUMMARY_FIELD]: normalizeReasoningSummary(settings.get()[REASONING_SUMMARY_FIELD]),
        [VOICE_CALL_FIELD]: normalizeVoiceCall(settings.get()[VOICE_CALL_FIELD]),
        [VOICE_VOICE_FIELD]: normalizeVoiceVoice(settings.get()[VOICE_VOICE_FIELD]),
        [VOICE_LANGUAGE_FIELD]: normalizeVoiceLanguage(settings.get()[VOICE_LANGUAGE_FIELD]),
        [RETRY_POLICY_FIELD]: normalizeRetryPolicy(settings.get()[RETRY_POLICY_FIELD]),
        [CONNECTORS_FIELD]: normalizeConnectorMode(settings.get()[CONNECTORS_FIELD]),
        [CONNECTOR_ACCOUNT_FIELD]: settings.get()[CONNECTOR_ACCOUNT_FIELD] ?? DEFAULT_CONNECTOR_ACCOUNT,
        [STREAM_IDLE_TIMEOUT_MINUTES_FIELD]: normalizeStreamIdleTimeoutMinutes(settings.get()[STREAM_IDLE_TIMEOUT_MINUTES_FIELD]),
        [CONTEXT_MODE_FIELD]: normalizeContextMode(settings.get()[CONTEXT_MODE_FIELD]),
        [CUSTOM_CONTEXT_WINDOW_FIELD]: normalizeCustomContextWindow(settings.get()[CUSTOM_CONTEXT_WINDOW_FIELD]),
        ...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [field, normalizeCustomContextWindow(settings.get()[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey])])),
        contextModels: contextModelGroups(models),
        availableModels: models.map(({ id, name }) => ({ id, name })),
        catalogStatus: modelCatalog.status(),
        verbosityModels: provider.getModels().filter(model => modelCatalog.metadata(model.id)?.supportVerbosity ?? model.id !== 'gpt-5.3-codex-spark').map(model => model.id),
        ultrafastModels: provider.getModels().filter(model => modelCatalog.metadata(model.id)?.supportsUltrafast === true).map(model => model.id),
        ultraModels: provider.getModels().filter(model => ultra.supported(model.id)).map(model => model.id),
        fastModels: provider.getModels().filter(model => modelCatalog.metadata(model.id)?.supportsFast ?? supportsCodexFastMode(model.id)).map(model => model.id),
        writable: ctx.settings.writable,
      }
    },
    update: async patch => {
      if (patch.subagentDefaultModel && !subagentDefaults.list().some(model => model.id === patch.subagentDefaultModel)) {
        throw new Error('Codex subtask model is unavailable or disallowed')
      }
      const connectorAccount = patch[CONNECTOR_ACCOUNT_FIELD]
      if (connectorAccount && (await accountVault.readAccount(connectorAccount)) === undefined) {
        const error = new Error('The selected ChatGPT connector account is not signed in')
        error.code = 'connector-account-unavailable'
        throw error
      }
      if (nativeWebSettings() && (Object.hasOwn(patch, SEARCH_PROVIDER_FIELD) || Object.hasOwn(patch, FETCH_PROVIDER_FIELD))) {
        throw new Error('Select the provider in DSH Web Search and Fetch settings')
      }
      if ([FETCH_PROVIDER_CODEX, FETCH_PROVIDER_CODEX_FALLBACK].includes(patch[FETCH_PROVIDER_FIELD]) && !fetchRouted) throw new Error('This DSH version does not support Codex webpage reading')
      if (Object.hasOwn(patch, 'subagentBackend')) {
        if (!subagentBackend) throw new Error('DSH subagent services are unavailable')
        await subagentBackend.select(patch.subagentBackend)
        if (patch.subagentBackend === 'codex') await subagentCatalog.refresh().catch(() => {})
      }
      const rest = { ...patch }
      delete rest.subagentBackend
      if (Object.hasOwn(rest, FETCH_ORDER_FIELD)) {
        await webSettings?.migrate()
        await fetchOrderSettings.update(rest[FETCH_ORDER_FIELD])
        delete rest[FETCH_ORDER_FIELD]
      } else if (Object.hasOwn(rest, FETCH_PROVIDER_FIELD) && settings.get()[FETCH_ORDER_FIELD] !== undefined) {
        await fetchOrderSettings.update(fetchOrderSettings.legacyOrder(rest[FETCH_PROVIDER_FIELD]))
      }
      if (Object.keys(rest).length) await settings.update(rest)
    },
  }
  const authModels = createModels({ credentials: store })
  authModels.setProvider(provider)
  const profile = Object.freeze({
    provider: PROVIDER,
    displayName: 'ChatGPT subscription',
    piProvider: provider,
    configuredMaxTokens: new Map(),
    // Custom PiAiAdapter profiles bypass the settings-backed profile resolver,
    // so the model diagnostics the host adapter reads on resolution must be
    // present here rather than left undefined.
    modelErrors: new Map(),
    // Custom PiAiAdapter profiles bypass the settings-backed profile resolver,
    // so request-image limits must be complete here rather than left undefined.
    maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: REQUEST_IMAGE_MAX_BYTES,
    maxImageBytes: REQUEST_IMAGE_MAX_BYTES,
    requestImageBudgetCount: 20,
    // pi-ai owns prompt_cache_key and encrypted reasoning replay. The explicit
    // profile values make the subscription cache contract auditable.
    cacheRetention: 'short',
    // The request-local connection policy upgrades this only when opted in.
    transport: 'sse',
  })
  // Retries are DSH's own: this only hands its retry layer the policy the person chose.
  const retryProfile = choice => {
    const retryPolicy = retryPolicyFor(choice, dshLlm.resolveRetryPolicy)
    return retryPolicy === undefined ? {} : { retryPolicy }
  }
  let profileKey
  let profileSnapshot
  const profiles = () => {
    const preferences = settings.get()
    const streamIdleTimeoutMinutes = normalizeStreamIdleTimeoutMinutes(preferences[STREAM_IDLE_TIMEOUT_MINUTES_FIELD])
    const retryChoice = normalizeRetryPolicy(preferences[RETRY_POLICY_FIELD])
    const key = JSON.stringify([modelCatalog.revision(), streamIdleTimeoutMinutes, retryChoice, normalizeContextMode(preferences[CONTEXT_MODE_FIELD]), preferences[CUSTOM_CONTEXT_OVERRIDES_FIELD], ...Object.values(CUSTOM_CONTEXT_MODEL_FIELDS).map(field => preferences[field])])
    if (key !== profileKey) {
      profileKey = key
      profileSnapshot = new Map([[PROVIDER, Object.freeze({ ...profile, streamIdleTimeoutMs: streamIdleTimeoutMinutes * 60 * 1000, ...retryProfile(retryChoice) })]])
    }
    return profileSnapshot
  }
  resolveAuth = () => authModels.getAuth(PROVIDER)
  ctx.inject(['subagents', 'subprocess', 'sandboxPolicy'], scoped => {
    const instance = createSubscriptionSubagent({
      ctx: scoped, nativeHome: dshHomePath('state', 'codex-subscription', 'native-subagent'),
      resolveAuth, store,
      refresh: provider.auth.oauth.refresh,
      loadRuntime: () => loadSubagentRuntime({ cli: subagentCli }),
      maintenance: runtimeManagement.blocked,
      defaults: subagentDefaults,
      parentSpeed,
      modelMetadata: async (id, signal) => {
        if (!subagentCatalog.metadata(id)) await subagentCatalog.refresh({ signal }).catch(() => signal.throwIfAborted())
        return subagentCatalog.metadata(id)
      },
    })
    scoped.subagents.registerProvider(instance.provider)
    const switcher = createSubagentBackendSwitcher({
      entries: () => [...scoped.loader.entries(), ...presetEntries(scoped)], prepare: instance.prepare,
      hostVersion: hostDshVersion(),
      persist: mode => settings.update({ subagentBackend: mode }),
    })
    // Web presets mount their scoped tool rows lazily, after the settings page.
    const unconfigure = scoped.on('internal/config', subagentConfigListener(switcher), { global: true })
    let requested = 'dsh'
    const select = async (mode, options) => {
      requested = mode
      try { await switcher.select(mode, options) } catch (error) { requested = settings.get().subagentBackend ?? 'dsh'; throw error }
    }
    subagentBackend = { select, activeCount: instance.activeCount }
    const sync = value => {
      const mode = value.subagentBackend ?? 'dsh'
      // A saved Codex choice must report a missing component on use, never
      // silently run the task through DSH while an update is required.
      if (mode !== requested) void select(mode, { validate: false }).catch(() => scoped.logger.warn('Could not switch the subscription subagent backend'))
    }
    void scoped.loader.await().then(() => sync(settings.get())).catch(() => scoped.logger.warn('Could not initialize the subscription subagent backend'))
    const unwatch = settings.watch(sync)
    scoped.effect(() => async () => {
      unwatch()
      unconfigure()
      subagentBackend = undefined
      instance.dispose()
      await switcher.dispose()
    }, 'codex-subscription: subagent backend')
  })
  const adapterAuth = Object.freeze({
    credentials: store,
    authContext: Object.freeze({
      env: async () => undefined,
      fileExists: async () => false,
    }),
  })
  ctx.effect(() => watchImageTool(settings, () => ctx.tools.register(createCodexImageTool({
    getFeatures: () => settings.get(),
    allowed: sessionId => settings.get().otherModels !== 'off'
      || ctx.get?.('sessions')?.get?.(sessionId)?.requestContext?.()?.provider === PROVIDER,
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
    attachments: ctx.attachments,
    resolveSession: sessionId => ctx.get?.('sessions')?.get?.(sessionId),
    getSessionMessages: sessionId => ctx.get?.('sessions')?.get?.(sessionId)?.deriveMessages?.() ?? [],
    originalImages,
    fetch: (input, init) => network.fetch('image', input, init),
  }))), 'codex-subscription: image tool availability')
  const connectorSelection = (value = settings.get()) => ({
    account: value[CONNECTOR_ACCOUNT_FIELD] ?? DEFAULT_CONNECTOR_ACCOUNT,
    mode: normalizeConnectorMode(value[CONNECTORS_FIELD]),
  })
  const createAccountModels = credentials => {
    const accountModels = createModels({ credentials })
    accountModels.setProvider(provider)
    return accountModels
  }
  const connectorAccounts = createConnectorAccountRouter({
    vault: accountVault,
    getSelection: connectorSelection,
    createAuth: id => {
      const accountModels = createAccountModels(accountCredentialStore(accountVault, id, OAUTH_EXPIRY_SKEW_MS))
      return async ({ signal }) => {
        try {
          return await accountModels.getAuth(PROVIDER, { signal })
        } catch {
          signal?.throwIfAborted()
          throw new Error('Could not authorize the selected ChatGPT connector account; check the connection or renew its sign-in')
        }
      }
    },
    fetch: (input, init) => network.fetch('connectors', input, init),
  })
  ctx.effect(() => {
    let disposers = []
    const sync = (value, previous) => {
      const selection = connectorSelection(value)
      if (previous !== undefined) {
        const before = connectorSelection(previous)
        if (selection.account !== before.account || selection.mode !== before.mode) connectorAccounts.clear()
      }
      const on = selection.mode !== 'off'
      if (on && disposers.length === 0) {
        disposers = createConnectorTools({
          open: connectorAccounts.open,
          allowed: () => servesCurrentModel(),
          getApproval: () => ctx.get?.('approval'),
        }).map(tool => ctx.tools.register(tool))
      } else if (!on && disposers.length > 0) {
        for (const dispose of disposers) dispose()
        disposers = []
      }
    }
    sync()
    const unwatch = settings.watch(sync)
    return () => { unwatch(); connectorAccounts.clear(); for (const dispose of disposers) dispose(); disposers = [] }
  }, 'codex-subscription: ChatGPT connectors')
  const adapter = new PiAiAdapter({
    profiles,
    resolveApiKey: async () => {
      let resolved
      try {
        resolved = await resolveAuth()
      } catch (error) {
        // DSH lists models by resolving the route's key; signed out has to read as "no credential".
        if (error?.code === 'MISSING_CREDENTIAL') throw new dshLlm.LlmError('ChatGPT subscription is not signed in', 'MISSING_CREDENTIAL')
        throw new dshLlm.LlmError('ChatGPT subscription authorization failed', 'AUTH_FAILED')
      }
      if (typeof resolved?.auth.apiKey !== 'string' || resolved.auth.apiKey.length === 0) {
        throw new dshLlm.LlmError('ChatGPT subscription is not signed in', 'MISSING_CREDENTIAL')
      }
      return resolved.auth.apiKey
    },
    auth: adapterAuth,
    resolveAttachments: () => ctx.get?.('attachments'),
  })
  // Hiding a model means "do not use it": the host directory drops hidden models, except those a session, the default or a plugin setting still uses.
  const hiddenDirectory = createHiddenModelDirectory({
    provider: PROVIDER,
    disabled: () => normalizeDisabledModels(settings.get()[DISABLED_MODELS_FIELD]),
    pinned: () => {
      const keep = []
      try {
        for (const session of ctx.get?.('sessions')?.list?.() ?? []) {
          const route = session.requestContext?.()
          if (route?.provider === PROVIDER && typeof route.model === 'string') keep.push(route.model)
        }
      } catch {}
      const selection = defaultModel.status()
      if (selection.managed) keep.push(selection.model)
      return keep
    },
    fallback: () => { const selection = defaultModel.status(); return selection.managed ? selection.model : undefined },
    emit: () => ctx.llm.emitAdaptersUpdated?.(),
  })
  ctx.effect(() => settings.watch((value, previous) => hiddenDirectory.settingsChanged(normalizeDisabledModels(value[DISABLED_MODELS_FIELD]), normalizeDisabledModels(previous[DISABLED_MODELS_FIELD]))), 'codex-subscription: hidden model directory')
  ctx.effect(() => ctx.on?.('session/event', (_session, event) => { if (event?.type === 'request/context') hiddenDirectory.dependenciesChanged() }), 'codex-subscription: hidden model dependencies')
  ctx.effect(() => settings.watch((value, previous) => {
    if (normalizeDefaultReasoningEffort(value[DEFAULT_REASONING_EFFORT_FIELD]) !== normalizeDefaultReasoningEffort(previous[DEFAULT_REASONING_EFFORT_FIELD])) ctx.llm.emitAdaptersUpdated?.()
  }), 'codex-subscription: default reasoning effort')
  ctx.effect(() => {
    const lifetime = new AbortController()
    const defaults = withDefaultReasoningEffort(ultra.wrapAdapter(observeAdapter(reasoning.wrapAdapter(compaction.wrapAdapter(provider.wrapRetryAdapter(adapter))), provider)), {
      preference: () => settings.get()[DEFAULT_REASONING_EFFORT_FIELD],
      modelDefault: id => modelCatalog.metadata(id)?.defaultReasoningEffort,
    })
    const readyAdapter = withModelCatalogReady(hiddenDirectory.wrap(defaults), modelCatalog, { signal: lifetime.signal })
    const disposeAdapter = ctx.llm.registerAdapter([PROVIDER], readyAdapter)
    // Defer credential work until the synchronous apply() has installed resolveAuth.
    void Promise.resolve().then(() => modelCatalog.refresh({ signal: lifetime.signal }))
      .catch(error => { if (!lifetime.signal.aborted) ctx.logger?.debug?.('could not refresh Codex model catalog (%s)', error?.code ?? error?.name ?? 'unknown error') })
    return () => {
      lifetime.abort()
      disposeAdapter?.()
      modelCatalog.clear()
    }
  }, 'codex-subscription: official model catalog')
  const currentAgent = () => ctx.get?.('agents')?.currentInitiator?.()
  const latestLuna = () => latestCodexLuna(modelCatalog.getModels())
  const resolveWebModel = () => {
    const request = currentAgent()?.session.requestContext?.()
    return (request?.provider === PROVIDER ? request.model : undefined) || latestLuna()
  }
  let fetchActive = true
  ctx.effect(() => () => { fetchActive = false }, 'codex-subscription: fetch lifetime')
  const fetchAllowed = llmProvider => fetchActive && (nativeWebSettings() || fetchRouted) && (settings.get().otherModels !== 'off' || (llmProvider ?? currentAgent()?.session.requestContext?.()?.provider) === PROVIDER)
  const codexFetch = createCodexFetchProvider({
    allowed: fetchAllowed,
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
    resolveModel: resolveWebModel,
    resolveSessionId: () => currentAgent()?.session.id,
    fetch: (input, init) => network.fetch('search', input, init),
  })
  const realFetchProviders = ctx.web.fetchProviders
  const fetchConfiguredId = () => configuredFetchProviderId(ctx.web, ctx.loader.entries())
  fetchOrderSettings = createFetchOrderSettings({
    settings, forms: ctx.settings, registry: realFetchProviders, codex: codexFetch,
    configuredId: fetchConfiguredId, managed: nativeWebSettings,
    available: () => fetchActive && realFetchProviders instanceof Map && (nativeWebSettings() || fetchRouted),
  })
  const chainFetch = createFetchChainProvider({
    order: () => fetchOrderSettings.order(),
    resolveProvider: id => id === CODEX_FETCH_PROVIDER_ID ? codexFetch : realFetchProviders?.get(id),
    allowed: () => fetchActive && (nativeWebSettings() || fetchRouted),
    authorize: (id, llmProvider) => {
      if (id === CODEX_FETCH_PROVIDER_ID && !fetchAllowed(llmProvider)) throw new WebError('Codex webpage reading is disabled for this model', 'WEB_PROVIDER_UNAVAILABLE')
    },
    report: record => diagnosticLog.info('fetch', 'webpage reading order', JSON.stringify(record)),
  })
  const fallbackFetch = createCodexFallbackFetchProvider({
    codex: codexFetch,
    resolveDshProvider: () => resolveDshFetchProvider(realFetchProviders, webSettings?.nativeFetch()),
    allowed: llmProvider => fetchAllowed(llmProvider) && (nativeWebSettings()
      ? configuredFetchProviderId(ctx.web, ctx.loader.entries()) === CODEX_FETCH_FALLBACK_PROVIDER_ID
      : fetchRouted && normalizeFetchProvider(settings.get()[FETCH_PROVIDER_FIELD]) === FETCH_PROVIDER_CODEX_FALLBACK),
  })
  for (const [provider, selection] of [[codexFetch, FETCH_PROVIDER_CODEX], [fallbackFetch, FETCH_PROVIDER_CODEX_FALLBACK]]) {
    ctx.web.registerFetchProvider?.({ ...provider, available: () => nativeWebSettings()
      ? configuredFetchProviderId(ctx.web, ctx.loader.entries()) === provider.id
      : fetchRouted && normalizeFetchProvider(settings.get()[FETCH_PROVIDER_FIELD]) === selection })
  }
  ctx.web.registerFetchProvider?.({ ...chainFetch, available: () => fetchActive && (nativeWebSettings()
    ? fetchConfiguredId() === FETCH_CHAIN_PROVIDER_ID
    : fetchRouted && settings.get()[FETCH_ORDER_FIELD] !== undefined) })
  ctx.effect(() => {
    if (nativeWebSettings()) return undefined
    const web = ctx.web
    const configuredId = () => configuredFetchProviderId(web, ctx.loader.entries())
    const router = createCodexFetchRouter({ registry: realFetchProviders, configuredId, mode: () => fetchRouted && !nativeWebSettings() ? normalizeFetchProvider(settings.get()[FETCH_PROVIDER_FIELD]) : 'dsh', codex: codexFetch, allowed: fetchAllowed,
      chain: chainFetch, orderEnabled: () => fetchActive && fetchRouted && !nativeWebSettings() && settings.get()[FETCH_ORDER_FIELD] !== undefined })
    if (router !== undefined) {
      try { web.fetchProviders = router } catch { /* A host without a writable registry cannot opt in. */ }
      fetchRouted = web.fetchProviders === router
    }
    if (!fetchRouted) {
      diagnosticLog.warn('fetch', 'Codex webpage reading is unavailable: DSH does not support fetch routing')
      if (settings.get()[FETCH_ORDER_FIELD] !== undefined || [FETCH_PROVIDER_CODEX, FETCH_PROVIDER_CODEX_FALLBACK].includes(normalizeFetchProvider(settings.get()[FETCH_PROVIDER_FIELD]))) {
        diagnosticLog.error('fetch', 'Configured Codex webpage reading could not be activated; select DSH or update the host')
        throw new Error('Configured Codex webpage reading could not be activated; select DSH or update the host')
      }
      return undefined
    }
    diagnosticLog.info('fetch', 'webpage reading is routed without replacing the configured DSH provider')
    return () => { fetchRouted = false; if (web.fetchProviders === router) web.fetchProviders = realFetchProviders }
  }, 'codex-subscription: fetch router')
  ctx.effect(() => {
    let active = true
    void Promise.resolve().then(async () => {
      if (!active) return
      await webSettings?.migrate()
      if (active) await fetchOrderSettings.initialize()
    })
      .catch(error => ctx.logger?.warn?.('could not migrate webpage reading order: %s', error.message))
    return () => { active = false }
  }, 'codex-subscription: fetch order migration')
  // With "other models" switched off, subscription search, images and connectors serve conversations on this plugin's own models only.
  const servesCurrentModel = () => {
    if (settings.get().otherModels !== 'off') return true
    const provider = currentAgent()?.session.requestContext?.()?.provider
    return provider === undefined || provider === PROVIDER
  }
  const realSearchProviders = ctx.web.searchProviders
  const resolveDshSearch = () => realSearchProviders?.get(nativeWebSettings() ? webSettings.nativeSearch() ?? DSH_SEARCH_PROVIDER_FALLBACK : searchProvider.dshProviderId())
  const gateSearch = provider => gateSearchProvider(provider, {
    allowed: llmProvider => settings.get().otherModels !== 'off' || (llmProvider ?? currentAgent()?.session.requestContext?.()?.provider) === PROVIDER,
    resolveDshProvider: resolveDshSearch,
  })
  const codexSearch = createCodexSearchProvider({
    resolvePreferences: () => readCapabilitySettings(settings.get()),
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
    resolveModel: resolveWebModel,
    resolveSessionId: () => currentAgent()?.session.id,
    fetch: (input, init) => network.fetch('search', input, init),
  })
  const searchTrace = route => diagnosticLog.info('search', `web search: ${route}`)
  const tracedCodexSearch = gateSearch({
    id: codexSearch.id,
    title: 'Codex Subscription',
    available: () => codexSearch.available(),
    ready: llmProvider => codexSearch.ready(llmProvider),
    async search(request, signal) {
      const result = await codexSearch.search(request, signal)
      searchTrace('answered by Codex subscription')
      return result
    },
  })
  ctx.web.registerSearchProvider(tracedCodexSearch)
  // The registry as DSH built it: the search router below stands in for it, and the DSH provider is always looked up here.
  const dshSearch = gateSearch(createDshSearchProvider({
    report: searchTrace,
    resolveDshProvider: resolveDshSearch,
  }))
  ctx.web.registerSearchProvider(dshSearch)
  const autoSearch = gateSearch(createCodexAutoSearchProvider({
    codex: tracedCodexSearch,
    resolveModelProvider: () => currentAgent()?.session.requestContext?.()?.provider,
    resolveDshProvider: () => dshSearch,
  }))
  ctx.web.registerSearchProvider(autoSearch)
  // Search is routed at lookup time, so the provider DSH has configured (and its settings page shows) is never replaced.
  let searchRouted = false
  ctx.effect(() => {
    if (nativeWebSettings()) return undefined
    const web = ctx.web
    const router = createSearchRouter({
      registry: realSearchProviders,
      configuredId: () => searchProvider.current(),
      // Each provider enforces the model switch at request time, including legacy hosts.
      mode: () => settings.get()[SEARCH_PROVIDER_FIELD],
      enabled: () => !nativeWebSettings(),
      providers: { codex: tracedCodexSearch, auto: autoSearch, dsh: dshSearch },
    })
    if (router === undefined) return undefined
    try { web.searchProviders = router } catch { return undefined }
    if (web.searchProviders !== router) return undefined
    searchRouted = true
    diagnosticLog.info('search', 'web search is routed without replacing the configured provider')
    return () => { searchRouted = false; if (web.searchProviders === router) web.searchProviders = realSearchProviders }
  }, 'codex-subscription: search router')
  ctx.effect(() => {
    const select = async value => {
      if (nativeWebSettings()) return
      // Hosts that do not let the registry be stood in for fall back to pointing DSH's web runtime at a provider of this plugin.
      if (searchRouted) { diagnosticLog.info('search', `web search source is ${value[SEARCH_PROVIDER_FIELD]}`); return }
      try {
        await searchProvider.select(value[SEARCH_PROVIDER_FIELD])
        diagnosticLog.info('search', `web search source is ${searchProvider.current()}`)
      } catch (error) {
        ctx.logger?.warn?.('could not select the configured web search provider: %s', error.message)
        diagnosticLog.warn('search', 'could not select the web search provider', error.message)
      }
    }
    void select(settings.get())
    return settings.watch(select)
  }, 'codex-subscription: search provider selection')
  if (webSettings) ctx.effect(() => {
    // Document notifications can precede the running fiber's new configuration.
    let timer
    const sync = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        void (nativeWebSettings() ? webSettings.remember() : webSettings.migrate()).catch(error => {
          ctx.logger?.warn?.('could not sync Web Search and Fetch settings: %s', error.message)
        })
      }, 75)
    }
    const documentPath = ctx.settings.documentPath
    if (typeof documentPath === 'string') watchFile(documentPath, { persistent: false, interval: 250 }, sync)
    sync()
    return () => {
      clearTimeout(timer)
      if (typeof documentPath === 'string') unwatchFile(documentPath, sync)
    }
  }, 'codex-subscription: migrate web provider settings')

  const auth = createCodexAuthService(authModels, store, {
    runLogin: operation => network.run('login', operation),
    accountVault,
    createLoginModels: credentials => {
      const loginModels = createModels({ credentials })
      loginModels.setProvider(provider)
      return loginModels
    },
  })
  const coordinator = new CodexLoginCoordinator(auth)
  const remoteImages = createRemoteImageAssets({
    credentials: ({ signal }) => readSubscriptionCredentials(resolveAuth, options => store.read(PROVIDER, { ...options, signal }), signal),
    fetch: (input, init) => network.fetch('remote', input, init),
    stateFile: dshHomePath('state', 'codex-subscription', 'remote-images.json'),
  })
  const remoteBridge = createDshRemoteControl({
    controller: () => ctx.get?.('sessionController'),
    agents: () => ctx.get?.('agents'),
    permissions: () => ctx.get?.('permissionPresets'),
    workspaces: () => ctx.get?.('workspaceRegistry'),
    attachments: () => ctx.attachments,
    remoteImages,
    usage: () => usageReader,
    usageProfile: () => usageProfileReader,
    projections: () => ctx.get?.('sessionProjections'),
    skills: () => ctx.get?.('skills'),
    commands: () => ctx.get?.('commands'),
    llm: () => ctx.llm,
    modelMetadata: (provider, model) => provider === PROVIDER ? modelCatalog.metadata(model) : undefined,
    historySource: createRemoteHistorySource({ query: () => ctx.get?.('sessionQuery') }),
    speed: {
      tiers: (provider, model) => provider === PROVIDER ? (modelCatalog.metadata(model)?.serviceTiers ?? []) : [],
      current: session => sessionPrefs.forRequest(session).speedMode,
      set: (mode, session) => sessionPrefs.update(session, { [SPEED_MODE_FIELD]: mode }),
      temporary: sessionPrefs.temporary,
    },
    trace: entry => { try { remoteControl.host.note(entry) } catch { /* diagnostics only */ } },
    userAgent: USER_AGENT,
    configFile: dshHomePath('state', 'codex-subscription', 'remote-config.json'),
    voice: {
      WebSocket,
      recovery: createVoiceTranscriptRecovery(dshHomePath('state', 'codex-subscription', 'voice-transcript-recovery')),
      resultStore: createVoiceResultStore(dshHomePath('state', 'codex-subscription', 'voice-results')),
      flushSession: session => ctx.get?.('sessions')?.flush?.(session),
      resolveProxy: resolveCodexOAuthProxy,
      fetch: (input, init) => network.fetch('voice', input, init),
      credentials: signal => readSubscriptionCredentials(resolveAuth, options => store.read(PROVIDER, { ...options, signal }), signal),
      classifyHangUp: createVoiceHangupClassifier({
        stream: request => ctx.llm.stream(request), provider: PROVIDER,
        model: () => latestLuna() ?? (modelCatalog.getModels().some(model => model.id === 'gpt-5.4-mini') ? 'gpt-5.4-mini' : 'gpt-5.6-luna'),
      }),
    },
  })
  ctx.effect(() => () => remoteBridge.close())
  const remoteControl = createRemoteControl({
    credentials: signal => readSubscriptionCredentials(resolveAuth, options => store.read(PROVIDER, { ...options, signal }), signal),
    WebSocket,
    fetch: (input, init) => network.fetch('remote', input, init),
    stateFile: dshHomePath('state', 'codex-subscription', 'remote-control.json'),
    debugFile: dshHomePath('state', 'codex-subscription', 'remote-debug.jsonl'),
    hostName: `DSH (${hostname()})`,
    userAgent: USER_AGENT,
    // Only for acceptance runs against a local stand-in relay; anything but chatgpt.com or a loopback address is refused.
    base: process.env.DSH_CODEX_REMOTE_BASE || undefined,
    methods: remoteBridge.methods,
    onActive: (_client, notify) => remoteBridge.adopt(notify),
    onClose: (_client, notify) => remoteBridge.forget(notify),
    onStop: remoteBridge.clearUploads,
  })
  ctx.on('agent/assistant-stream', ({ agent, frame }) => { try { remoteBridge.onStream(agent?.session, frame) } catch { /* the phone view must never disturb the session */ } })
  ctx.on('session/event', (session, event) => { try { remoteBridge.onSessionEvent(session, event) } catch { /* the phone view must never disturb the session */ } })
  // Prepended: the DSH window answers these too and would otherwise claim them before the phone sees them.
  ctx.on('approval/request', (request, next) => { try { return remoteBridge.onApproval(request, next) } catch { return next() } }, true)
  ctx.on('user-questions/request', (request, next) => { try { return remoteBridge.onQuestion(request, next) } catch { return next() } }, true)
  ctx.effect(() => {
    // Remote Control stays off until the user switches it on; then it follows the setting.
    let wanted = false
    const follow = value => {
      const next = value.remoteControl === 'on'
      if (next === wanted) return
      wanted = next
      void (next ? remoteControl.enable() : remoteControl.disable()).catch(error => ctx.logger?.debug?.('Remote Control: %s', error?.code ?? error?.message))
    }
    follow(settings.get())
    const unwatch = settings.watch(follow)
    return () => { unwatch(); void remoteControl.disable().catch(() => {}) }
  }, 'codex-subscription: Remote Control host')
  const baseUsageReader = createCodexUsageReader({
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
    fetch: (input, init) => network.fetch('quota', input, init),
  })
  const planHistoryReader = createPlanHistoryReader({
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
    fetch: (input, init) => network.fetch('quota', input, init),
  })
  const usageProfileReader = createUsageProfileReader({
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
    fetch: (input, init) => network.fetch('quota', input, init),
  })
  const usageReader = createQuotaForecastReader({
    reader: baseUsageReader,
    enabled: () => normalizeQuickQuotaMode(settings.get()[QUICK_QUOTA_MODE_FIELD], settings.get()[LEGACY_QUICK_QUOTA_FIELD]) === QUICK_QUOTA_MODE_FORECAST,
    scope: async () => await accountVault?.activeId() ?? 'legacy',
    stateStore: new QuotaForecastStateStore({
      filename: dshHomePath('state', 'codex-subscription', 'quota-forecast.json'),
    }),
  })
  ctx.effect(() => {
    let forecasting = false
    const warmForecast = value => {
      const next = normalizeQuickQuotaMode(value[QUICK_QUOTA_MODE_FIELD], value[LEGACY_QUICK_QUOTA_FIELD]) === QUICK_QUOTA_MODE_FORECAST
      if (!next) {
        if (forecasting) void usageReader.clear().catch(error => ctx.logger?.debug?.('could not clear Codex quota forecast: %s', error.message))
        forecasting = false
        return
      }
      forecasting = true
      void usageReader.read().catch(error => ctx.logger?.debug?.('could not warm Codex quota forecast: %s', error.message))
    }
    warmForecast(settings.get())
    const unwatch = settings.watch(warmForecast)
    return () => {
      unwatch()
      usageReader.clearCache()
    }
  }, 'codex-subscription: quota forecast warm-up')
  const quotaRetryLifetime = new AbortController()
  const activeQuotaRetries = new Set()
  const quotaRetryHandler = createCodexQuotaRetryHandler({
    usageReader,
    enabled: () => normalizeAutoQuotaRetry(settings.get()[AUTO_QUOTA_RETRY_FIELD]),
    modelsReady: catalogModelsReady(modelCatalog),
  })
  const disposeQuotaRetry = ctx.on('agent/request-error', (payload, next) => {
    if (quotaRetryLifetime.signal.aborted) return Promise.resolve(undefined)
    const signal = payload.signal === undefined
      ? quotaRetryLifetime.signal
      : AbortSignal.any([payload.signal, quotaRetryLifetime.signal])
    const operation = quotaRetryHandler({ ...payload, signal }, next)
    const tracked = operation.finally(() => activeQuotaRetries.delete(tracked))
    activeQuotaRetries.add(tracked)
    return tracked
  }, true)
  ctx.effect(() => async () => {
    disposeQuotaRetry()
    quotaRetryLifetime.abort(new Error('codex-subscription quota retry disposed'))
    await Promise.allSettled([...activeQuotaRetries])
  }, 'codex-subscription: abort and drain quota recovery')
  ctx.effect(() => settings.watch((value, previous) => {
    if (normalizeAutoQuotaRetry(value[AUTO_QUOTA_RETRY_FIELD])
      !== normalizeAutoQuotaRetry(previous?.[AUTO_QUOTA_RETRY_FIELD])) {
      quotaRetryHandler.notifyConfigurationChanged()
    }
  }), 'codex-subscription: update quota recovery preference')
  const resetCreditService = createCodexResetCreditService({
    getAuth: resolveAuth,
    readCredential: options => store.read(PROVIDER, options),
    usageReader,
    fetch: (input, init) => network.fetch('quota-reset', input, init),
  })
  const sketchBridge = createSketchAgentBridge({enabled:()=>settings.get().imageSketchAgent && settings.get().imageSketch && settings.get().imageEditing})
  ctx.effect(()=>{
    let dispose
    const sync=()=>{
      const value=settings.get()
      if(value.imageSketchAgent && value.imageSketch && value.imageEditing){dispose??=ctx.tools.register(createSketchAgentTool(sketchBridge,ctx.attachments,sessionId=>ctx.get?.('sessions')?.get?.(sessionId)?.deriveMessages?.()??[]))}
      else {dispose?.();dispose=undefined;sketchBridge.dispose()}
    }
    sync();const unwatch=settings.watch(sync)
    return ()=>{unwatch();dispose?.();sketchBridge.dispose()}
  },'codex-subscription: native sketch tool')
  const accountUsageReader = createAccountUsageReader({
    vault: accountVault,
    createModels: createAccountModels,
    fetch: (input, init) => network.fetch('quota', input, init),
    expirySkewMs: OAUTH_EXPIRY_SKEW_MS,
    activeReader: baseUsageReader,
  })
  const desktopVoice = withEndCallTool(remoteBridge.desktopVoice, tool => ctx.tools.register(tool))
  const nativeVoice = createNativeVoiceHost({ desktopVoice, log: diagnosticLog })
  ctx.effect(() => {
    const close = () => { void nativeVoice.close().catch(() => diagnosticLog.warn('voice-native', 'native call cleanup is waiting for a cancelled start')) }
    const sync = () => { if (settings.get().voiceCall !== 'on') close() }
    const unwatch = settings.watch(sync)
    return () => { unwatch(); close() }
  })
  const voicePreview = createVoicePreview({ fetch: (input, init) => network.fetch('voice', input, init, { standardHttps: true }), credentials: signal => readSubscriptionCredentials(resolveAuth, options => store.read(PROVIDER, { ...options, signal }), signal), userAgent: USER_AGENT })
  ctx.effect(() => () => voicePreview.clear())
  const composerPredictions = createComposerPredictions({
    fetch: (input, init) => network.fetch('predictions', input, init, { standardHttps: true }),
    credentials: signal => readSubscriptionCredentials(resolveAuth, options => store.read(PROVIDER, { ...options, signal }), signal),
    modelAvailable: id => provider.getModels().some(model => model.id === id),
    enabled: () => settings.get().composerPredictions === 'on', userAgent: USER_AGENT,
  })
  ctx.effect(() => () => composerPredictions.clear())
  ctx.effect(() => settings.watch(value => { if (value.composerPredictions !== 'on') composerPredictions.clear() }))
  // Account-pool failover runs ahead of the quota-reset wait: when another account
  // can serve the turn right now, waiting hours for this one to reset is the wrong
  // answer. It only owns the decision; the switch and its cache invalidation stay
  // here, next to the other account transitions.
  const failoverLifetime = new AbortController()
  const activeFailovers = new Set()
  // Bind each model-request attempt to the account that was active before the
  // request waterfall ran. request-error can arrive after another turn or a
  // manual account/select changes the vault, so reading the vault only there can
  // misattribute a late response and rotate back to the account that failed.
  const requestAccountSnapshots = new WeakMap()
  const requestAttemptKey = (turn, step) => `${turn}:${step}`
  const disposeRequestAccount = ctx.on('agent/request', async ({ agent, turn, step }, next) => {
    if (agent !== null && typeof agent === 'object') {
      const accountId = await accountVault.activeId().catch(() => undefined)
      if (typeof accountId === 'string' && accountId.length > 0) {
        let snapshots = requestAccountSnapshots.get(agent)
        if (snapshots === undefined) {
          snapshots = new Map()
          requestAccountSnapshots.set(agent, snapshots)
        }
        const entry = { accountId, turn, step, confirmed: false, snapshots }
        snapshots.set(requestAttemptKey(turn, step), entry)
        if (requestAccountBySession.has(agent.session?.id) || requestAccountBySession.size < 256) requestAccountBySession.set(agent.session?.id, entry)
        else { entry.accountId = undefined; entry.confirmed = true }
      }
    }
    return next()
  })
  const disposeRequestSnapshots = ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    const sessionId = agent?.session?.id
    accountFailover.endTurn({ sessionId, turn })
    if (requestAccountBySession.get(sessionId)?.turn === turn) requestAccountBySession.delete(sessionId)
    const snapshots = agent !== null && typeof agent === 'object' ? requestAccountSnapshots.get(agent) : undefined
    if (snapshots === undefined) return
    for (const key of snapshots.keys()) if (key.startsWith(`${turn}:`)) snapshots.delete(key)
  })
  const accountFailover = createAccountFailover({
    enabled: () => normalizeAccountFailover(settings.get()[ACCOUNT_FAILOVER_FIELD]),
    listAccounts: () => accountVault.list(),
    activeAccountId: () => accountVault.activeId(),
    // The vault serializes the write; everything else an account switch invalidates
    // is applied exactly as a manual account/select does, including the catalogue reload.
    switchAccount: async (id, options) => {
      if (!await accountVault.select(id, options)) return false
      await applyAccountTransition({ closeConnections: () => connection.dispose({ drain: true }), usageReader, accountUsageReader, planHistoryReader,
        usageProfileReader, resetCreditService, modelCatalog, onAccountChanged: () => {
          remoteBridge.clearUploads(); subagentCatalog.clear(); usageProfileReader.clear(); voicePreview.clear(); composerPredictions.clear()
          if (connectorSelection().account === DEFAULT_CONNECTOR_ACCOUNT) connectorAccounts.clear()
          // A parked quota wait is over: the turn is on a different account now.
          quotaRetryHandler.notifyAccountChanged()
        }, onCleanupFailure: () => diagnosticOperations.record('account/cleanup', 'failed') })
    },
    modelsReady: catalogModelsReady(modelCatalog),
    onSwitched: () => diagnosticLog.info('account-failover', 'the turn continues on another signed-in account'),
    log: { info: (area, message) => diagnosticLog.info(area, message), warn: (area, message, detail) => diagnosticLog.warn(area, message, detail) },
  })
  const disposeRequestSuccess = ctx.on('session/event', (session, event) => {
    if (event.type !== 'assistant/message' || event.data?.message?.source?.provider !== PROVIDER) return
    const entry = requestAccountBySession.get(session.id)
    if (!entry || entry.turn !== event.data.turn || entry.step !== event.data.step) return
    accountFailover.succeeded({ sessionId: session.id, accountId: entry.accountId })
    entry.snapshots.delete(requestAttemptKey(entry.turn, entry.step))
    requestAccountBySession.delete(session.id)
  })
  const disposeFailoverSession = ctx.on('session/disposed', session => {
    requestAccountBySession.delete(session.id)
    accountFailover.disposeSession(session.id)
  })
  const disposeFailover = ctx.on('agent/request-error', (payload, next) => {
    const snapshots = payload.agent !== null && typeof payload.agent === 'object'
      ? requestAccountSnapshots.get(payload.agent)
      : undefined
    const entry = snapshots?.get(requestAttemptKey(payload.turn, payload.step))
    const requestAccountId = entry?.accountId
    snapshots?.delete(requestAttemptKey(payload.turn, payload.step))
    if (requestAccountBySession.get(payload.agent?.session?.id) === entry) requestAccountBySession.delete(payload.agent?.session?.id)
    if (entry?.confirmed && !requestAccountId) return next()
    if (failoverLifetime.signal.aborted) return Promise.resolve(undefined)
    const signal = payload.signal === undefined
      ? failoverLifetime.signal
      : AbortSignal.any([payload.signal, failoverLifetime.signal])
    // Registered after the quota listener with the same prepend flag, so this runs
    // first: another account that can serve now beats waiting for this one to reset.
    // The two never both claim a turn, because the one that recovers returns first.
    const operation = accountFailover({ ...payload, requestAccountId, signal }, next)
    const tracked = operation.finally(() => activeFailovers.delete(tracked))
    activeFailovers.add(tracked)
    return tracked
  }, true)
  ctx.effect(() => async () => {
    disposeRequestAccount()
    disposeRequestSnapshots()
    disposeRequestSuccess()
    disposeFailoverSession()
    disposeFailover()
    failoverLifetime.abort(new Error('codex-subscription account failover disposed'))
    await Promise.allSettled([...activeFailovers])
    requestAccountBySession.clear()
  }, 'codex-subscription: abort and drain account failover')
  const subscriptionHandler = createSubscriptionRpcHandler({
    authHandler: createCodexRpcHandler(coordinator, { openExternal: openCodexAuthUrl }),
    usageReader,
    accountUsageReader,
    planHistoryReader,
    usageProfileReader,
    resetCreditService,
    preferences,
    sessionPreferences: { ...sessionPrefs, resolve: resolvePreferenceSession },
    defaultModel,
    runtimeManagement,
    remoteControl,
    desktopVoice,
    nativeVoice,
    voicePreview,
    composerPredictions,
    onAccountChanged: (endpoint, id) => {
      remoteBridge.clearUploads(); subagentCatalog.clear(); usageProfileReader.clear(); voicePreview.clear(); composerPredictions.clear(); quotaRetryHandler.notifyAccountChanged(); accountFailover.clear()
      const { account } = connectorSelection()
      if (account === DEFAULT_CONNECTOR_ACCOUNT || endpoint === 'logout' || endpoint === 'login/status' || (endpoint === 'account/remove' && id === account)) connectorAccounts.clear()
    },
    diagnosticsReader: () => createSubscriptionDiagnostics({ auth, preferences, login: coordinator.supportState(), network, modelCatalog, connection, compaction, review: provider, operations: diagnosticOperations, runtimeManagement, storage: () => usageReader.storage(), tools: ctx.tools }),
    onCleanupFailure: () => diagnosticOperations.record('account/cleanup', 'failed'),
    modelCatalog,
    subagentCatalog,
    closeConnections: () => connection.dispose(),
    originalImages,
    resolveInheritedOriginal: (sessionId, assetId) => inheritedOriginalImageRef(
      ctx.get?.('sessions')?.get?.(sessionId),
      assetId,
    ),
  })

  const handler=diagnosticOperations.wrap((endpoint,payload,signal)=>endpoint.startsWith('sketch/')?sketchBridge.rpc(endpoint,payload):subscriptionHandler(endpoint,payload,signal))

  ctx.effect(() => ctx.tools.register(createSubscriptionPreferencesTool(handler, () => ctx.get?.('approval'))),
    'codex-subscription: response preferences tool')

  ctx.inject(['connection'], connectionContext => connectionContext.effect(
    () => registerSubscriptionTransport(connectionContext.connection, handler),
    'codex-subscription: DSH-trusted account RPC',
  ))
}

export { createCodexAuthService, DshOAuthCredentialStore } from './credential-store.js'
export { createSubscriptionDiagnostics } from './diagnostics.js'
export { normalizeContextMode, normalizeCustomContextWindow } from './settings-contract.js'
export { createDefaultModelController, DEFAULT_MODEL_PROVIDER } from './default-model.js'
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
