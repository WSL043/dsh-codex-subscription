import assert from 'node:assert/strict'
import { RPC_ENDPOINTS } from '../src/rpc-contract.js'
import { IMAGE_FEATURE_DEFAULTS } from '../src/image-features.js'
import test from 'node:test'
import Schema from '@deepseek-ai/schemastery'

test('settings schema survives the native browser JSON round trip', () => {
  const schema = plugin.Config
  const plain = config => Object.fromEntries(Object.entries(config).map(([key, field]) => [key, typeof field?.get === 'function' ? field.get() : field]))
  const value = plain(schema({ imageSketch: true, imageSketchAgent: true, searchDomains: ['EXAMPLE.com', 'example.com'], disabledModels: ['gpt-5.5'] }))
  const browserSchema = new Schema(JSON.parse(JSON.stringify(schema)))
  assert.deepEqual(plain(browserSchema(JSON.parse(JSON.stringify(value)))), value)
  assert.equal(value.autoQuotaRetry, false)
  assert.deepEqual(value.disabledModels, ['gpt-5.5'])
  assert.deepEqual(value.searchDomains, ['example.com'])
  assert.throws(() => browserSchema({ searchDomains: ['https://example.com/path'] }), /Invalid search domain/)
})

test('every subscription preference remains editable on supported DSH settings hosts', () => {
  for (const [name, field] of Object.entries(plugin.Config.dict)) {
    assert.equal(field.meta.volatile, true, `${name} must be writable in DSH settings`)
  }
})

import * as plugin from '../src/index.js'
import { hostDshVersion } from '../src/subagent-runtime.js'
import { PACKAGE_VERSION } from '../src/version.js'
import {
  AUTO_QUOTA_RETRY_FIELD,
  CONTEXT_MODE_CUSTOM,
  CONTEXT_MODE_EXTENDED,
  CONTEXT_MODE_STANDARD,
  CUSTOM_CONTEXT_MODEL_DEFAULTS,
  contextModelGroups,
  CUSTOM_CONTEXT_WINDOW_FIELD,
  CONTEXT_MODE_FIELD,
  DISABLED_MODELS_FIELD,
  formatContextWindow,
  INPUT_IMAGE_DETAIL_FIELD,
  normalizeAutoQuotaRetry,
  normalizeQuickQuotaMode,
  normalizeSearchProvider,
  parseContextWindow,
  QUICK_QUOTA_MODE_BAR,
  QUICK_QUOTA_MODE_FORECAST,
  QUICK_QUOTA_MODE_OFF,
  QUICK_QUOTA_MODE_PERCENT,
  OUTPUT_VERBOSITY_DEFAULT,
  OUTPUT_VERBOSITY_FIELD,
  STREAM_IDLE_TIMEOUT_MINUTES_FIELD,
  SEARCH_PROVIDER_AUTO,
  SEARCH_PROVIDER_CODEX,
  SEARCH_PROVIDER_DSH,
  SPEED_MODE_FAST,
  SPEED_MODE_STANDARD,
} from '../src/settings-contract.js'

const { apply: applyPlugin } = plugin

test('composer quota mode normalizes formal values and legacy booleans', () => {
  assert.equal(normalizeAutoQuotaRetry(undefined), false)
  assert.equal(normalizeAutoQuotaRetry(false), false)
  assert.equal(normalizeAutoQuotaRetry('false'), false)
  assert.equal(normalizeQuickQuotaMode(QUICK_QUOTA_MODE_OFF), QUICK_QUOTA_MODE_OFF)
  assert.equal(normalizeQuickQuotaMode(QUICK_QUOTA_MODE_PERCENT), QUICK_QUOTA_MODE_PERCENT)
  assert.equal(normalizeQuickQuotaMode(QUICK_QUOTA_MODE_BAR), QUICK_QUOTA_MODE_BAR)
  assert.equal(normalizeQuickQuotaMode(QUICK_QUOTA_MODE_FORECAST), QUICK_QUOTA_MODE_FORECAST)
  assert.equal(normalizeQuickQuotaMode(undefined, true), QUICK_QUOTA_MODE_PERCENT)
  assert.equal(normalizeQuickQuotaMode(undefined, false), QUICK_QUOTA_MODE_OFF)
  assert.equal(normalizeQuickQuotaMode('invalid', true), QUICK_QUOTA_MODE_PERCENT)
})

test('context settings expose safe presets and bounded custom values', async () => {
  assert.equal(plugin.normalizeContextMode(CONTEXT_MODE_STANDARD), CONTEXT_MODE_STANDARD)
  assert.equal(plugin.normalizeContextMode(CONTEXT_MODE_EXTENDED), CONTEXT_MODE_EXTENDED)
  assert.equal(plugin.normalizeContextMode(CONTEXT_MODE_CUSTOM), CONTEXT_MODE_CUSTOM)
  assert.equal(plugin.normalizeContextMode('unknown'), CONTEXT_MODE_STANDARD)
  assert.equal(plugin.normalizeCustomContextWindow(500_000), 500_000)
  assert.equal(plugin.normalizeCustomContextWindow(99), 128_000)
  assert.equal(plugin.normalizeCustomContextWindow(2_000_000), 1_000_000)
})

test('custom context starts from the audited Codex default and accepts plain token counts', () => {
  assert.deepEqual(CUSTOM_CONTEXT_MODEL_DEFAULTS, {
    'gpt-5.4': 272_000,
    'gpt-5.4-mini': 272_000,
    'gpt-5.5': 272_000,
    'gpt-5.6': 272_000,
    'gpt-6-astra': 272_000,
  })
  assert.equal(formatContextWindow(1_000_000), '1M')
  assert.equal(formatContextWindow(400_000), '400K')
  assert.equal(parseContextWindow('750000'), 750_000)
  assert.equal(parseContextWindow('272000'), 272_000)
  assert.ok(Number.isNaN(parseContextWindow('750K')))
  assert.ok(Number.isNaN(parseContextWindow('0.5M')))
})

test('custom context rows follow the active upstream model catalog', () => {
  assert.deepEqual(contextModelGroups([
    { id: 'gpt-5.4', name: 'GPT-5.4' },
    { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
    { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' },
    { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
    { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark' },
  ]), [
    { key: 'gpt-5.4', label: 'GPT-5.4', maximum: 1_000_000 },
    { key: 'gpt-5.6', label: 'GPT-5.6 Sol / Terra', maximum: 1_000_000 },
    { key: 'gpt-6-astra', label: 'GPT-6 Astra', maximum: 872_000 },
    { key: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark', maximum: 128_000, fixed: true },
  ])
})

function fakeContext({ connection = true, webServer = true } = {}) {
  const registered = []
  const handled = []
  const listeners = []
  const searchProviders = []
  const tools = []
  const settings = []
  const webUpdates = []
  const provided = new Map()
  const preference = { autoQuotaRetry: false, quickQuotaVisible: false, searchProvider: SEARCH_PROVIDER_AUTO, outputVerbosity: OUTPUT_VERBOSITY_DEFAULT, streamIdleTimeoutMinutes: 10, speedMode: SPEED_MODE_STANDARD, contextMode: CONTEXT_MODE_STANDARD, customContextWindow: 272_000, customContextGpt54: 1_000_000, customContextGpt54Mini: 400_000, customContextGpt55: 1_000_000, customContextGpt56: 1_000_000 }
  let credential
  const webEntry = {
    options: { id: 'web', config: { searchProvider: 'deepseek-official', fetchProvider: 'local' } },
    fiber: {
      config: { searchProvider: 'deepseek-official', fetchProvider: 'local' },
      async update(config, noSave) {
        webUpdates.push({ config, noSave })
        this.config = config
      },
    },
  }
  const searchProviderMap = new Map([['deepseek-official', { id: 'deepseek-official', available: () => true, async search() { return { sources: [], truncated: false } } }]])
  const updateSettings = async patch => {
    Object.assign(preference, patch)
    await Promise.all(listeners.filter(entry => entry.event === 'loader/volatile-update').map(entry => entry.listener()))
  }
  const ctx = {
    credentials: {
      async resolve() { return credential === undefined ? undefined : { value: credential } },
      async set(_ref, value) { credential = value },
      async unset() { credential = undefined },
    },
    llm: {
      registerAdapter(providers, adapter) {
        registered.push({ providers, adapter })
        return () => {}
      },
    },
    attachments: {
      imageLimits: {
        maxImageBytes: 10 * 1024 * 1024,
        maxMessageImageBytes: 10 * 1024 * 1024,
        mediaTypes: ['image/png'],
      },
      async saveImage() { throw new Error('not used') },
    },
    tools: {
      register(tool) {
        tools.push(tool)
        return () => { const index=tools.indexOf(tool);if(index>=0)tools.splice(index,1) }
      },
    },
    web: {
      searchProviders: searchProviderMap,
      registerSearchProvider(provider) {
        searchProviders.push(provider)
        searchProviderMap.set(provider.id, provider)
        return () => {}
      },
    },
    webServer: webServer ? {} : undefined,
    connection: connection ? {
      fetch: {
        register(route) {
          handled.push(route)
          return () => {}
        },
      },
    } : undefined,
    settings: {
      writable: true,
      configure(presentation) {
        settings.push(presentation)
        return () => {}
      },
      async update(id, patch) {
        assert.equal(id, 'codex-subscription')
        await updateSettings(patch)
      },
    },
    fiber: { entry: { options: { id: 'codex-subscription' } } },
    loader: {
      * entries() { yield webEntry },
    },
    inject(services, callback) {
      if (services.every(service => ctx[service] !== undefined)) callback(ctx)
    },
    on(event, listener) {
      const entry = { event, listener }
      listeners.push(entry)
      return () => {
        const index = listeners.indexOf(entry)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    get(name) { return provided.get(name) },
    provide(name, value) { provided.set(name, value) },
    effect(register) { return register() },
  }
  return {
    ctx, config: preference, registered, handled, listeners, provided, searchProviders, settings, tools, webUpdates,
    async request(endpoint, payload, signal) {
      const method = 'codex-subscription/' + endpoint
      const route = handled.find(route => route.path === '/api/' + method)
      const response = await route.fetch(new Request('http://localhost' + route.path, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({type:'client-request',rpcId:'test-rpc',method,payload}), signal}))
      return (await response.json()).result
    },
    updateSettings,
  }
}

test('account routes register without directly accessing the web server', () => {
  const host = fakeContext({ webServer: false })
  assert.doesNotThrow(() => applyPlugin(host.ctx, host.config))
  assert.equal(host.handled.length, RPC_ENDPOINTS.length)
  assert.equal(host.tools.length, 1)
})

test('plugin activates without the web connection service in Headless mode', () => {
  const host = fakeContext({ connection: false })

  assert.doesNotThrow(() => applyPlugin(host.ctx, host.config))
  assert.deepEqual(host.registered.map(item => item.providers), [['openai-codex']])
  assert.equal(host.handled.length, 0)
})

test('signed out, the account advertises no models and model metadata never reads credentials', async () => {
  const host = fakeContext()
  applyPlugin(host.ctx, host.config)
  host.ctx.credentials.resolve = async () => assert.fail('model metadata must not read credentials')
  const adapter = host.registered[0].adapter
  assert.deepEqual(await adapter.listModels('openai-codex'), [], 'no bundled list stands in for the account catalog')
  await assert.rejects(adapter.resolveModel('openai-codex', 'gpt-5.5'))
})

test('hiding a model only changes the saved display list, not what the adapter advertises', async () => {
  const host = fakeContext()
  applyPlugin(host.ctx, host.config)
  const adapter = host.registered[0].adapter
  const signal = new AbortController().signal
  const updated = await host.request('preferences/update', { [DISABLED_MODELS_FIELD]: ['gpt-5.5'] }, signal)
  assert.equal(updated.ok, true)
  assert.deepEqual(updated.value.disabledModels, ['gpt-5.5'])
  assert.deepEqual(updated.value.availableModels, [])
  assert.deepEqual(await adapter.listModels('openai-codex'), [])
  await host.request('preferences/update', { [DISABLED_MODELS_FIELD]: [] }, signal)
})

test('plugin registers one Codex route, subscription image tool, and DSH-trusted redacted RPC', async () => {
  const host = fakeContext()
  applyPlugin(host.ctx, host.config)

  assert.equal('CODEX_PROVIDER_POLICY' in plugin, false, 'do not replace the removed boundary with cosmetic metadata')
  assert.deepEqual(host.registered.map(item => item.providers), [['openai-codex']])
  const profile = host.registered[0].adapter.current().profiles.get('openai-codex')
  assert.equal(profile.streamIdleTimeoutMs, 10 * 60 * 1000)
  assert.deepEqual({
    maxRequestImageBytes: profile.maxRequestImageBytes,
    requestImagePixelBudget: profile.requestImagePixelBudget,
    requestImageMaxBytes: profile.requestImageMaxBytes,
  }, {
    maxRequestImageBytes: 20 * 1024 * 1024,
    requestImagePixelBudget: 2048 * 2048,
    requestImageMaxBytes: 1024 * 1024,
  })
  assert.ok(profile.modelErrors instanceof Map, 'the host adapter reads model diagnostics from the profile on resolution')
  assert.equal(profile.modelErrors.get('gpt-5.5'), undefined, 'a serviceable model records no diagnostic')
  assert.deepEqual(host.searchProviders.map(provider => provider.id), ['codex-subscription', 'codex-subscription-auto'])
  assert.deepEqual(host.tools.map(tool => tool.name), ['codex_image_generate'])
  assert.equal(host.listeners.filter(listener => listener.event === 'agent/request-error').length, 1)
  assert.equal(host.registered[0].adapter.providerRetryPolicy(), undefined)
  const models = await host.registered[0].adapter.listModels('openai-codex')
  assert.deepEqual(models, [], 'signed out there is no account catalog to advertise')
  assert.equal(host.handled.length, RPC_ENDPOINTS.length)
  assert.equal(host.handled[0].path, '/api/codex-subscription/status')
  assert.ok(host.handled.every(route => route.methods.length === 1 && route.methods[0] === 'POST'))
  assert.equal(host.settings.length, 1)
  assert.equal(host.provided.size, 0, 'the plugin should not publish undocumented host services')
  assert.equal('CodexCacheTelemetry' in plugin, false, 'cache diagnostics are outside the subscription route boundary')

  const signal = new AbortController().signal
  const status = await host.request('status', {}, signal)
  assert.deepEqual(status, {
    ok: true,
    value: { authenticated: false, provider: 'openai-codex' },
  })
  assert.doesNotMatch(JSON.stringify(status), /access|refresh|accountId/)

  const diagnostics = await host.request('diagnostics', {}, signal)
  assert.equal(diagnostics.value.catalog.source, 'unavailable')
  assert.ok(['idle', 'refreshing'].includes(diagnostics.value.catalog.refresh))
  assert.ok(Number.isFinite(Date.parse(diagnostics.value.generatedAt)))
  assert.equal(diagnostics.value.inspection.meaning, 'collection-success-is-not-feature-success')
  assert.ok(diagnostics.value.inspection.capabilities.every(item => item.execution === 'not-verified'))
  assert.deepEqual(diagnostics, {
    ok: true,
    value: {
      schemaVersion: 3,
      generatedAt: diagnostics.value.generatedAt,
      inspection: diagnostics.value.inspection,
      requestHistory: { scope: 'plugin-process', capacity: 32, dropped: 0, events: [] },
      operations: { scope: 'plugin-process', capacity: 32, dropped: 0, events: [] },
      package: 'dsh-codex-subscription',
      version: PACKAGE_VERSION,
      runtime: { node: process.version, platform: process.platform, arch: process.arch, dsh: hostDshVersion() },
      account: { status: 'signed-out' },
      login: { phase: 'idle' },
      requests: {},
      websocket: { requests: 0, connectionsCreated: 0, connectionsReused: 0, deltaRequests: 0, websocketFailures: 0, sseFallbacks: 0 },
      compaction: { requests: 0, checkpointsSaved: 0, checkpointsReused: 0 },
      review: { requests: 0, routed: 0, sessionModel: 0, retries: 0 },
      catalog: diagnostics.value.catalog,
      configuration: {
        autoQuotaRetry: false,
        contextMode: CONTEXT_MODE_STANDARD,
        quickQuotaMode: QUICK_QUOTA_MODE_OFF,
        outputVerbosity: OUTPUT_VERBOSITY_DEFAULT,
        searchProvider: SEARCH_PROVIDER_AUTO,
        speedMode: SPEED_MODE_STANDARD,
        writable: true,
      },
      issues: [],
    },
  })
  assert.doesNotMatch(JSON.stringify(diagnostics), /access_token|refresh_token|accountId|expiresAt/)

  await host.updateSettings({ quickQuotaVisible: true })
  assert.deepEqual(host.webUpdates, [{
    config: { searchProvider: 'codex-subscription-auto', fetchProvider: 'local' },
    noSave: true,
  }], 'quota-only settings must not touch the web provider after automatic routing is selected')
  await host.updateSettings({ searchProvider: 'codex' })
  assert.deepEqual(host.webUpdates, [{
    config: { searchProvider: 'codex-subscription-auto', fetchProvider: 'local' },
    noSave: true,
  }, {
    config: { searchProvider: 'codex-subscription', fetchProvider: 'local' },
    noSave: true,
  }])

  const preferenceStatus = await host.request('preferences/status', {}, signal)
  const activeContextModels = preferenceStatus.value.contextModels
  assert.deepEqual(activeContextModels, [], 'signed out there are no per-model context rows')
  assert.deepEqual(preferenceStatus.value.availableModels, [])
  const verbosityModels = preferenceStatus.value.verbosityModels
  assert.deepEqual(verbosityModels, [])
  assert.equal(verbosityModels.includes('gpt-5.3-codex-spark'), false)
  assert.equal(typeof preferenceStatus.value.subagentRuntimeInstalled, 'boolean')
  assert.deepEqual(preferenceStatus, {
    ok: true,
    value: { disabledModels: [], autoQuotaRetry: false, compactionMode: 'dsh', connectionMode: 'sse', reviewModel: 'session', remoteControl: 'off', subagentBackend: 'dsh', subagentBackendAvailable: false, subagentRuntimeInstalled: preferenceStatus.value.subagentRuntimeInstalled, ...IMAGE_FEATURE_DEFAULTS, imageModel: 'gpt-image-2', imageQuality: 'auto', quickQuotaMode: QUICK_QUOTA_MODE_PERCENT, searchProvider: 'codex', speedMode: SPEED_MODE_STANDARD, outputVerbosity: OUTPUT_VERBOSITY_DEFAULT, inputImageDetail: 'auto', streamIdleTimeoutMinutes: 10, contextMode: CONTEXT_MODE_STANDARD, customContextWindow: 272_000, customContextGpt54: 1_000_000, customContextGpt54Mini: 400_000, customContextGpt55: 1_000_000, customContextGpt56: 1_000_000, customContextGpt6Astra: 272_000, contextModels: activeContextModels, availableModels: preferenceStatus.value.availableModels, verbosityModels, fastModels: preferenceStatus.value.fastModels, ultrafastModels: preferenceStatus.value.ultrafastModels, catalogStatus: preferenceStatus.value.catalogStatus, customContextModels: {}, searchMode: 'live', searchDomains: [], quotaAlerts: 'important', quotaShortThreshold: 20, quotaLongThreshold: 20, writable: true },
  })
  const preferenceUpdate = await host.request('preferences/update', {
    [AUTO_QUOTA_RETRY_FIELD]: false,
    quickQuotaMode: QUICK_QUOTA_MODE_BAR,
    searchProvider: 'dsh',
    speedMode: SPEED_MODE_FAST,
    [INPUT_IMAGE_DETAIL_FIELD]: 'high',
    [STREAM_IDLE_TIMEOUT_MINUTES_FIELD]: 5,
    contextMode: CONTEXT_MODE_EXTENDED,
    customContextWindow: 500_000,
    customContextGpt54Mini: 400_000,
  }, signal)
  assert.deepEqual(preferenceUpdate, {
    ok: true,
    value: { disabledModels: [], autoQuotaRetry: false, compactionMode: 'dsh', connectionMode: 'sse', reviewModel: 'session', remoteControl: 'off', subagentBackend: 'dsh', subagentBackendAvailable: false, subagentRuntimeInstalled: preferenceStatus.value.subagentRuntimeInstalled, ...IMAGE_FEATURE_DEFAULTS, imageModel: 'gpt-image-2', imageQuality: 'auto', quickQuotaMode: QUICK_QUOTA_MODE_BAR, searchProvider: 'dsh', speedMode: SPEED_MODE_FAST, outputVerbosity: OUTPUT_VERBOSITY_DEFAULT, inputImageDetail: 'high', streamIdleTimeoutMinutes: 5, contextMode: CONTEXT_MODE_EXTENDED, customContextWindow: 500_000, customContextGpt54: 1_000_000, customContextGpt54Mini: 400_000, customContextGpt55: 1_000_000, customContextGpt56: 1_000_000, customContextGpt6Astra: 272_000, contextModels: activeContextModels, availableModels: preferenceStatus.value.availableModels, verbosityModels, fastModels: preferenceStatus.value.fastModels, ultrafastModels: preferenceStatus.value.ultrafastModels, catalogStatus: preferenceStatus.value.catalogStatus, customContextModels: {}, searchMode: 'live', searchDomains: [], quotaAlerts: 'important', quotaShortThreshold: 20, quotaLongThreshold: 20, writable: true },
  })
  assert.equal(host.registered[0].adapter.current().profiles.get('openai-codex').streamIdleTimeoutMs, 5 * 60 * 1000)
  await host.request('preferences/update', { [STREAM_IDLE_TIMEOUT_MINUTES_FIELD]: 10 }, signal)
  assert.equal(host.registered[0].adapter.current().profiles.get('openai-codex').streamIdleTimeoutMs, 10 * 60 * 1000)
  const downstream = { kind: 'downstream' }
  const requestErrorListener = host.listeners.find(listener => listener.event === 'agent/request-error').listener
  assert.equal(await requestErrorListener({
    provider: 'openai-codex',
    failure: { code: 'RATE_LIMIT', message: 'quota reached' },
    signal,
  }, async () => downstream), downstream)
  assert.deepEqual(host.webUpdates.at(-1), {
    config: { searchProvider: 'deepseek-official', fetchProvider: 'local' },
    noSave: true,
  })
  const invalidQuotaMode = await host.request('preferences/update', {
    quickQuotaMode: 'card',
  }, signal)
  assert.deepEqual(invalidQuotaMode, {
    ok: false,
    error: { code: 'internal', message: 'Invalid quick quota preference', details: { issues: [] } },
  })
  assert.deepEqual(await host.request('preferences/update', { [AUTO_QUOTA_RETRY_FIELD]: 'yes' }, signal), {
    ok: false,
    error: { code: 'internal', message: 'Invalid automatic quota retry preference', details: { issues: [] } },
  })
})

test('successful account changes wake parked quota recovery while failed changes do not', async () => {
  let succeeds = true
  let wakes = 0
  const handler = plugin.createSubscriptionRpcHandler({
    authHandler: async endpoint => succeeds
      ? { ok: true, value: { authenticated: endpoint !== 'logout' } }
      : { ok: false, error: { code: 'internal', message: 'account change failed', details: { issues: [] } } },
    usageReader: { clearCache() {}, clearScope() {}, clear() {} },
    resetCreditService: { clear() {} },
    onAccountChanged: () => { wakes += 1 },
  })
  const signal = new AbortController().signal

  assert.equal((await handler('account/select', { id: 'account-b' }, signal)).ok, true)
  assert.equal((await handler('account/remove', { id: 'account-a' }, signal)).ok, true)
  assert.equal((await handler('login/status', {}, signal)).ok, true)
  assert.equal((await handler('logout', {}, signal)).ok, true)
  assert.equal(wakes, 4)
  succeeds = false
  assert.equal((await handler('account/select', { id: 'missing' }, signal)).ok, false)
  assert.equal(wakes, 4)
})

test('Astra custom context is persisted through settings RPC with its audited bounds', async () => {
  const host = fakeContext()
  applyPlugin(host.ctx, host.config)
  const rpc = (method, payload = {}) => host.request(method, payload, new AbortController().signal)
  assert.equal((await rpc('preferences/status')).value.customContextGpt6Astra, 272_000)
  for (const value of [128_000, 500_000, 872_000]) {
    const result = await rpc('preferences/update', { contextMode: 'custom', customContextGpt6Astra: value })
    assert.equal(result.ok, true)
    assert.equal(result.value.customContextGpt6Astra, value)
    assert.equal((await rpc('preferences/status')).value.customContextGpt6Astra, value)
  }
  for (const value of [127_999, 872_001, 1_000_000, 500_000.5, '500000']) {
    const result = await rpc('preferences/update', { customContextGpt6Astra: value })
    assert.equal(result.ok, false)
    assert.equal(result.error.message, 'Invalid custom model context window')
    assert.equal((await rpc('preferences/status')).value.customContextGpt6Astra, 872_000)
  }
})

test('forecast cache management exposes only its size and delegates serialized clearing', async () => {
  let clears = 0
  const handler = plugin.createSubscriptionRpcHandler({ usageReader: {
    clear: async () => { clears++ },
    storage: async () => ({ bytes: clears ? 0 : 128, limit: 262144 }),
  } })
  assert.deepEqual(await handler('storage/status', {}, new AbortController().signal), { ok: true, value: { bytes: 128, limit: 262144 } })
  assert.equal(clears, 0)
  assert.deepEqual(await handler('storage/clear-forecast', { path: 'ignored' }, new AbortController().signal), { ok: true, value: { bytes: 0, limit: 262144 } })
  assert.equal(clears, 1)
  const aborted = AbortSignal.abort()
  await assert.rejects(handler('storage/clear-forecast', {}, aborted))
  assert.equal(clears, 1)
})

test('preferences/models refreshes the catalog before returning the current model surfaces', async () => {
  const calls = []
  let fail = false
  const handler = plugin.createSubscriptionRpcHandler({
    modelCatalog: {
      async refresh() {
        calls.push('refresh')
        if (fail) throw new Error('credential details must stay private')
      },
    },
    preferences: {
      status() {
        calls.push('status')
        return { contextModels: [{ key: 'gpt-6-astra' }], verbosityModels: ['gpt-6-astra'] }
      },
    },
  })
  const signal = new AbortController().signal
  assert.deepEqual(await handler('preferences/models', {}, signal), {
    ok: true,
    value: { availableModels: [], contextModels: [{ key: 'gpt-6-astra' }], verbosityModels: ['gpt-6-astra'], fastModels: [], ultrafastModels: [], catalogStatus: undefined },
  })
  assert.deepEqual(calls, ['refresh', 'status'])

  fail = true
  const failed = await handler('preferences/models', {}, signal)
  assert.deepEqual(failed, {
    ok: false,
    error: { code: 'internal', message: 'Could not refresh Codex model catalog', details: { issues: [] } },
  })
  assert.doesNotMatch(JSON.stringify(failed), /credential details/)
})

test('usage failures use a DSH-supported bounded RPC error', async () => {
  const handler = plugin.createSubscriptionRpcHandler({
    async authHandler() { throw new Error('not used') },
    usageReader: { async read() { throw new Error('host secret') }, clear() {} },
    resetCreditService: { async inspect() {}, async prepare() {}, async consume() {}, clear() {} },
  })
  const result = await handler('usage', {}, new AbortController().signal)
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'internal', message: 'Could not read ChatGPT usage', details: { issues: [] } },
  })
  assert.doesNotMatch(JSON.stringify(result), /host secret/)
})

test('original image RPC delegates only a bounded session-owned chunk request', async () => {
  const calls = []
  const inherited = { assetId: 'img_0123456789abcdef0123456789abcdef', sha256: 'a'.repeat(64) }
  const handler = plugin.createSubscriptionRpcHandler({
    originalImages: {
      async chunk(sessionId, assetId, offset, access) {
        calls.push({ sessionId, assetId, offset, access })
        return sessionId === 'session-a' ? { ref: { assetId }, offset, encoded: 'AA==', done: true } : undefined
      },
    },
    resolveInheritedOriginal(sessionId, assetId) {
      return sessionId === 'session-a' && assetId === inherited.assetId ? inherited : undefined
    },
  })
  const signal = new AbortController().signal
  assert.deepEqual(await handler('image/original/chunk', {
    sessionId: 'session-a', assetId: 'img_0123456789abcdef0123456789abcdef', offset: 0,
  }, signal), {
    ok: true,
    value: { ref: { assetId: 'img_0123456789abcdef0123456789abcdef' }, offset: 0, encoded: 'AA==', done: true },
  })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    sessionId: 'session-a', assetId: inherited.assetId, offset: 0, access: inherited,
  })
  assert.deepEqual(await handler('image/original/chunk', { sessionId: 'session-b', assetId: 'img_0123456789abcdef0123456789abcdef', offset: 0 }, signal), {
    ok: false, error: { code: 'not-found', message: 'Original image is unavailable', details: { issues: [] } },
  })
  assert.deepEqual(await handler('image/original/chunk', { sessionId: 'session-a', assetId: 'same', offset: -1 }, signal), {
    ok: false, error: { code: 'invalid-input', message: 'Invalid original image request', details: { issues: [] } },
  })
})

test('quota reset RPC exposes bounded inspection, prepare, and consume results', async () => {
  const calls = []
  const handler = plugin.createSubscriptionRpcHandler({
    async authHandler() { throw new Error('not used') },
    usageReader: { async read() {}, clear() {} },
    resetCreditService: {
      async inspect(value) { calls.push(['inspect', value]); return { availableCount: 1, nextExpiresAt: 9 } },
      async prepare(value) { calls.push(['prepare', value]); return { challengeId: 'opaque', readyAt: 5 } },
      async consume(value) { calls.push(['consume', value]); return { code: 'reset', windowsReset: ['primary'] } },
      clear() {},
    },
  })
  const controller = new AbortController()
  assert.deepEqual(await handler('reset-credit/inspect', {}, controller.signal), {
    ok: true,
    value: { availableCount: 1, nextExpiresAt: 9 },
  })
  assert.deepEqual(await handler('reset-credit/prepare', {}, controller.signal), {
    ok: true,
    value: { challengeId: 'opaque', readyAt: 5 },
  })
  assert.deepEqual(await handler('reset-credit/consume', { challengeId: 'opaque', acknowledged: true }, controller.signal), {
    ok: true,
    value: { code: 'reset', windowsReset: ['primary'] },
  })
  assert.equal(calls.length, 3)
})

test('quota reset RPC forwards only the opaque credit reference to host prepare', async () => {
  let prepared
  const handler = plugin.createSubscriptionRpcHandler({
    async authHandler() { throw new Error('not used') },
    usageReader: { async read() {}, clear() {} },
    resetCreditService: {
      async inspect() { return { availableCount: 2, credits: [] } },
      async prepare(value) { prepared = value; return { challengeId: 'opaque', readyAt: 5 } },
      async consume() { return { code: 'reset', windowsReset: [] } },
      clear() {},
    },
  })
  const controller = new AbortController()
  await handler('reset-credit/prepare', { creditRef: 'opaque-ref' }, controller.signal)
  assert.equal(prepared.creditRef, 'opaque-ref')
  assert.equal(prepared.creditId, undefined)
})

test('quota reset RPC bounds host failures and logout invalidates pending challenges', async () => {
  let cleared = 0
  const handler = plugin.createSubscriptionRpcHandler({
    async authHandler(endpoint) { return endpoint === 'logout' ? { ok: true, value: {} } : { ok: false } },
    usageReader: { async read() {}, clear() { cleared += 1 } },
    resetCreditService: {
      async inspect() { throw new Error('provider-secret credit-secret') },
      async prepare() { throw new Error('provider-secret credit-secret') },
      async consume() { throw new Error('provider-secret credit-secret') },
      clear() { cleared += 1 },
    },
  })
  const controller = new AbortController()
  const failed = await handler('reset-credit/prepare', {}, controller.signal)
  assert.deepEqual(failed, {
    ok: false,
    error: { code: 'internal', message: 'Could not prepare a quota reset', details: { issues: [] } },
  })
  assert.doesNotMatch(JSON.stringify(failed), /provider-secret|credit-secret/)
  await handler('logout', {}, controller.signal)
  assert.equal(cleared, 2)
})

test('diagnostics converts credential failures to a fixed public issue without leaking host errors', async () => {
  const report = await plugin.createSubscriptionDiagnostics({
    auth: { async status() { throw new Error('refresh-secret account-local') } },
    preferences: { status: () => ({ quickQuotaVisible: false, searchProvider: 'dsh', speedMode: 'standard', writable: true }) },
  })

  assert.deepEqual(report.account, { status: 'unknown' })
  assert.deepEqual(report.issues, [{ code: 'account-status-unavailable' }])
  assert.doesNotMatch(JSON.stringify(report), /refresh-secret|account-local/)
})

test('diagnostics includes bounded request failures and excludes proxy or credential details', async () => {
  const report = await plugin.createSubscriptionDiagnostics({
    auth: { async status() { return { authenticated: false } } },
    preferences: { status: () => ({ contextMode: 'standard', quickQuotaMode: 'off', searchProvider: 'dsh', speedMode: 'standard', writable: true, ignored: 'noise' }) },
    network: { snapshot: () => ({ login: { status: 'failed', stage: 'transport', code: 'dns', route: 'environment', elapsed: '1-5s' } }) },
  })
  assert.deepEqual(report.requests, { login: { status: 'failed', stage: 'transport', code: 'dns', route: 'environment', elapsed: '1-5s' } })
  assert.equal('ignored' in report.configuration, false)
  assert.doesNotMatch(JSON.stringify(report), /proxy|bearer|token|accountId/iu)
})

test('unknown browser search preferences fail safe to automatic routing', () => {
  assert.equal(normalizeSearchProvider(SEARCH_PROVIDER_AUTO), SEARCH_PROVIDER_AUTO)
  assert.equal(normalizeSearchProvider(SEARCH_PROVIDER_DSH), SEARCH_PROVIDER_DSH)
  assert.equal(normalizeSearchProvider(SEARCH_PROVIDER_CODEX), SEARCH_PROVIDER_CODEX)
  assert.equal(normalizeSearchProvider(undefined), SEARCH_PROVIDER_AUTO)
  assert.equal(normalizeSearchProvider('unexpected-provider'), SEARCH_PROVIDER_AUTO)
})

test('catalog diagnostics includes refresh failures without copying private metadata', async () => {
  const report = await plugin.createSubscriptionDiagnostics({
    auth: { status: async () => ({ authenticated: false }) },
    preferences: { status: () => ({}) },
    network: { snapshot: () => ({ catalog: { status: 'failed', stage: 'http', code: 'http-error', httpStatus: 403, route: 'direct', elapsed: 'under-1s', url: 'private-url' } }) },
    modelCatalog: { status: () => ({ source: 'unavailable', refresh: 'failed', accountId: 'private-account' }) },
  })
  assert.equal(report.requests.catalog.httpStatus, 403)
  assert.deepEqual(report.catalog, { source: 'unavailable', refresh: 'failed' })
  assert.doesNotMatch(JSON.stringify(report), /private-|accountId|url/)
})

test('sketch tool is absent until both Beta switches are enabled and removed when disabled',async()=>{
 const host=fakeContext();applyPlugin(host.ctx, host.config)
 const registered=()=>host.tools.some(tool=>tool.name==='codex_sketch')
 assert.equal(registered(),false)
 await host.updateSettings({imageSketch:true,imageEditing:true})
 assert.equal(registered(),false)
 await host.updateSettings({imageSketchAgent:true})
 assert.equal(registered(),true)
 await host.updateSettings({imageSketchAgent:false})
 assert.equal(registered(),false)
})

test('the settings default model writes the DSH default a new conversation starts on', async () => {
  const host = fakeContext()
  applyPlugin(host.ctx, host.config)
  const signal = new AbortController().signal
  // The default-model service may mount after this plugin, so a missing service
  // is reported instead of cached.
  assert.deepEqual(await host.request('default-model/status', {}, signal), {
    ok: true,
    value: { available: false, managed: false },
  })
  assert.deepEqual(await host.request('default-model/select', { model: 'gpt-5.6-terra' }, signal), {
    ok: false,
    error: { code: 'unavailable', message: 'Could not save the default model', details: { issues: [] } },
  })

  let selection = { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' }
  const writes = []
  host.ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ ...selection }),
    async saveSelection(next) {
      writes.push({ ...next })
      selection = { ...next }
    },
  })
  assert.deepEqual(await host.request('default-model/status', {}, signal), {
    ok: true,
    value: { available: true, managed: false, provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' },
  })
  assert.deepEqual(await host.request('default-model/select', { model: 'gpt-5.6-terra' }, signal), {
    ok: true,
    value: { available: true, managed: true, provider: 'openai-codex', model: 'gpt-5.6-terra' },
  })
  assert.deepEqual(writes, [{ provider: 'openai-codex', model: 'gpt-5.6-terra' }])
  assert.deepEqual(await host.request('default-model/select', { model: 'gpt 5.6' }, signal), {
    ok: false,
    error: { code: 'invalid-input', message: 'Invalid default model', details: { issues: [] } },
  })
  assert.deepEqual(await host.request('default-model/select', {}, signal), {
    ok: false,
    error: { code: 'invalid-input', message: 'Invalid default model', details: { issues: [] } },
  })
  assert.equal(writes.length, 1, 'a rejected selection never reaches the host service')
})
