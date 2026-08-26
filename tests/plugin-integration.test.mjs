import assert from 'node:assert/strict'
import test from 'node:test'

import * as plugin from '../src/index.js'
import { PACKAGE_VERSION } from '../src/version.js'
import {
  CONTEXT_MODE_CUSTOM,
  CONTEXT_MODE_EXTENDED,
  CONTEXT_MODE_STANDARD,
  CUSTOM_CONTEXT_MODEL_DEFAULTS,
  contextModelGroups,
  CUSTOM_CONTEXT_WINDOW_FIELD,
  CONTEXT_MODE_FIELD,
  formatContextWindow,
  normalizeQuickQuotaMode,
  normalizeSearchProvider,
  parseContextWindow,
  QUICK_QUOTA_MODE_BAR,
  QUICK_QUOTA_MODE_OFF,
  QUICK_QUOTA_MODE_PERCENT,
  OUTPUT_VERBOSITY_DEFAULT,
  OUTPUT_VERBOSITY_FIELD,
  SEARCH_PROVIDER_AUTO,
  SEARCH_PROVIDER_CODEX,
  SEARCH_PROVIDER_DSH,
  SPEED_MODE_FAST,
  SPEED_MODE_STANDARD,
} from '../src/settings-contract.js'

const { apply: applyPlugin } = plugin

test('composer quota mode normalizes formal values and legacy booleans', () => {
  assert.equal(normalizeQuickQuotaMode(QUICK_QUOTA_MODE_OFF), QUICK_QUOTA_MODE_OFF)
  assert.equal(normalizeQuickQuotaMode(QUICK_QUOTA_MODE_PERCENT), QUICK_QUOTA_MODE_PERCENT)
  assert.equal(normalizeQuickQuotaMode(QUICK_QUOTA_MODE_BAR), QUICK_QUOTA_MODE_BAR)
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
    { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark' },
  ]), [
    { key: 'gpt-5.4', label: 'GPT-5.4', maximum: 1_000_000 },
    { key: 'gpt-5.6', label: 'GPT-5.6 Sol / Terra', maximum: 1_000_000 },
    { key: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark', maximum: 128_000, fixed: true },
  ])
})

function fakeContext() {
  const registered = []
  const handled = []
  const searchProviders = []
  const tools = []
  const settings = []
  const webUpdates = []
  const provided = new Map()
  let preference = { quickQuotaVisible: false, searchProvider: SEARCH_PROVIDER_AUTO, outputVerbosity: OUTPUT_VERBOSITY_DEFAULT, speedMode: SPEED_MODE_STANDARD, contextMode: CONTEXT_MODE_STANDARD, customContextWindow: 272_000, customContextGpt54: 1_000_000, customContextGpt54Mini: 400_000, customContextGpt55: 1_000_000, customContextGpt56: 1_000_000 }
  const preferenceWatchers = new Set()
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
        return () => {}
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
    connection: {
      rpc: {
        handle(channel, handler, options) {
          handled.push({ channel, handler, options })
          return () => {}
        },
      },
    },
    settings: {
      writable: true,
      register(namespace, schema) {
        settings.push({ namespace, schema })
         return {
           get: () => preference,
           async update(patch) {
             const previous = preference
             preference = { ...preference, ...patch }
             await Promise.all([...preferenceWatchers].map(callback => callback(preference, previous)))
           },
           watch(callback) {
             preferenceWatchers.add(callback)
             return () => preferenceWatchers.delete(callback)
           },
         }
      },
    },
    loader: {
      * entries() { yield webEntry },
    },
    inject(_services, callback) { callback(ctx) },
    get(name) { return provided.get(name) },
    provide(name, value) { provided.set(name, value) },
    effect(register) { return register() },
  }
  return {
    ctx, registered, handled, provided, searchProviders, settings, tools, webUpdates,
    async updateSettings(patch) {
      const previous = preference
      preference = { ...preference, ...patch }
      await Promise.all([...preferenceWatchers].map(callback => callback(preference, previous)))
    },
  }
}

test('plugin registers one Codex route, subscription image tool, and loopback-only redacted RPC', async () => {
  const host = fakeContext()
  applyPlugin(host.ctx)

  assert.equal('CODEX_PROVIDER_POLICY' in plugin, false, 'do not replace the removed boundary with cosmetic metadata')
  assert.deepEqual(host.registered.map(item => item.providers), [['openai-codex']])
  const profile = host.registered[0].adapter.current().profiles.get('openai-codex')
  assert.deepEqual({
    maxRequestImageBytes: profile.maxRequestImageBytes,
    requestImagePixelBudget: profile.requestImagePixelBudget,
    requestImageMaxBytes: profile.requestImageMaxBytes,
  }, {
    maxRequestImageBytes: 20 * 1024 * 1024,
    requestImagePixelBudget: 2048 * 2048,
    requestImageMaxBytes: 1024 * 1024,
  })
  assert.deepEqual(host.searchProviders.map(provider => provider.id), ['codex-subscription', 'codex-subscription-auto'])
  assert.deepEqual(host.tools.map(tool => tool.name), ['codex_image_generate'])
  assert.equal(host.registered[0].adapter.providerRetryPolicy(), undefined)
  const models = await host.registered[0].adapter.listModels('openai-codex')
  assert.ok(models.length > 0, 'the supported DSH adapter must receive auth before creating its model registry')
  assert.equal((await host.registered[0].adapter.resolveModel('openai-codex', 'gpt-5.5')).context.contextWindow, 272_000)
  await host.updateSettings({ [CONTEXT_MODE_FIELD]: CONTEXT_MODE_EXTENDED })
  assert.equal((await host.registered[0].adapter.resolveModel('openai-codex', 'gpt-5.5')).context.contextWindow, 1_000_000)
  await host.updateSettings({ [CONTEXT_MODE_FIELD]: CONTEXT_MODE_CUSTOM, customContextGpt54Mini: 400_000, customContextGpt55: 500_000 })
  assert.equal((await host.registered[0].adapter.resolveModel('openai-codex', 'gpt-5.4-mini')).context.contextWindow, 400_000)
  assert.equal((await host.registered[0].adapter.resolveModel('openai-codex', 'gpt-5.5')).context.contextWindow, 500_000)
  await host.updateSettings({ [CONTEXT_MODE_FIELD]: CONTEXT_MODE_STANDARD, [CUSTOM_CONTEXT_WINDOW_FIELD]: 272_000, customContextGpt54: 272_000, customContextGpt54Mini: 272_000, customContextGpt55: 272_000, customContextGpt56: 272_000 })
  assert.equal(host.handled.length, 1)
  assert.equal(host.handled[0].channel, '/codex-subscription')
  assert.deepEqual(host.handled[0].options, { authority: 'loopback' })
  assert.equal(host.settings.length, 1)
  assert.equal(host.provided.size, 0, 'the plugin should not publish undocumented host services')
  assert.equal('CodexCacheTelemetry' in plugin, false, 'cache diagnostics are outside the subscription route boundary')

  const signal = new AbortController().signal
  const status = await host.handled[0].handler('status', {}, signal)
  assert.deepEqual(status, {
    ok: true,
    value: { authenticated: false, provider: 'openai-codex' },
  })
  assert.doesNotMatch(JSON.stringify(status), /access|refresh|accountId/)

  const diagnostics = await host.handled[0].handler('diagnostics', {}, signal)
  assert.deepEqual(diagnostics, {
    ok: true,
    value: {
      schemaVersion: 3,
      package: 'dsh-codex-subscription',
      version: PACKAGE_VERSION,
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      account: { status: 'signed-out' },
      login: { phase: 'idle' },
      requests: {},
      configuration: {
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
  assert.doesNotMatch(JSON.stringify(diagnostics), /access|refresh|accountId|expiresAt/)

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

  const preferenceStatus = await host.handled[0].handler('preferences/status', {}, signal)
  const activeContextModels = [
    { key: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark', maximum: 128_000, fixed: true },
    { key: 'gpt-5.4', label: 'GPT-5.4', maximum: 1_000_000 },
    { key: 'gpt-5.4-mini', label: 'GPT-5.4 mini', maximum: 400_000 },
    { key: 'gpt-5.5', label: 'GPT-5.5', maximum: 1_000_000 },
    { key: 'gpt-5.6', label: 'GPT-5.6 Luna / Sol / Terra', maximum: 1_000_000 },
  ]
  const verbosityModels = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.5', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra']
  assert.deepEqual(preferenceStatus, {
    ok: true,
    value: { quickQuotaMode: QUICK_QUOTA_MODE_PERCENT, searchProvider: 'codex', speedMode: SPEED_MODE_STANDARD, outputVerbosity: OUTPUT_VERBOSITY_DEFAULT, contextMode: CONTEXT_MODE_STANDARD, customContextWindow: 272_000, customContextGpt54: 272_000, customContextGpt54Mini: 272_000, customContextGpt55: 272_000, customContextGpt56: 272_000, contextModels: activeContextModels, verbosityModels, writable: true },
  })
  const preferenceUpdate = await host.handled[0].handler('preferences/update', {
    quickQuotaMode: QUICK_QUOTA_MODE_BAR,
    searchProvider: 'dsh',
    speedMode: SPEED_MODE_FAST,
    contextMode: CONTEXT_MODE_EXTENDED,
    customContextWindow: 500_000,
    customContextGpt54Mini: 400_000,
  }, signal)
  assert.deepEqual(preferenceUpdate, {
    ok: true,
    value: { quickQuotaMode: QUICK_QUOTA_MODE_BAR, searchProvider: 'dsh', speedMode: SPEED_MODE_FAST, outputVerbosity: OUTPUT_VERBOSITY_DEFAULT, contextMode: CONTEXT_MODE_EXTENDED, customContextWindow: 500_000, customContextGpt54: 272_000, customContextGpt54Mini: 400_000, customContextGpt55: 272_000, customContextGpt56: 272_000, contextModels: activeContextModels, verbosityModels, writable: true },
  })
  assert.deepEqual(host.webUpdates.at(-1), {
    config: { searchProvider: 'deepseek-official', fetchProvider: 'local' },
    noSave: true,
  })
  const invalidQuotaMode = await host.handled[0].handler('preferences/update', {
    quickQuotaMode: 'card',
  }, signal)
  assert.deepEqual(invalidQuotaMode, {
    ok: false,
    error: { code: 'internal', message: 'Invalid quick quota preference', details: { issues: [] } },
  })
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
