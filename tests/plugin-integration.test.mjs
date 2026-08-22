import assert from 'node:assert/strict'
import test from 'node:test'

import * as plugin from '../src/index.js'
import { PACKAGE_VERSION } from '../src/version.js'
import {
  normalizeSearchProvider,
  SEARCH_PROVIDER_CODEX,
  SEARCH_PROVIDER_DSH,
  SPEED_MODE_FAST,
  SPEED_MODE_STANDARD,
} from '../src/settings-contract.js'

const { apply: applyPlugin } = plugin

function fakeContext() {
  const registered = []
  const handled = []
  const searchProviders = []
  const tools = []
  const settings = []
  const webUpdates = []
  const provided = new Map()
  let preference = { quickQuotaVisible: false, searchProvider: 'dsh', speedMode: SPEED_MODE_STANDARD }
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
      registerSearchProvider(provider) {
        searchProviders.push(provider)
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
  assert.deepEqual(host.searchProviders.map(provider => provider.id), ['codex-subscription'])
  assert.deepEqual(host.tools.map(tool => tool.name), ['codex_image_generate'])
  assert.equal(host.registered[0].adapter.providerRetryPolicy(), undefined)
  const models = await host.registered[0].adapter.listModels('openai-codex')
  assert.ok(models.length > 0, 'the supported DSH adapter must receive auth before creating its model registry')
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
      schemaVersion: 1,
      package: 'dsh-codex-subscription',
      version: PACKAGE_VERSION,
      runtime: { node: process.version },
      account: { status: 'signed-out' },
      provider: {
        id: 'openai-codex',
        transport: 'sse',
        cache: { owner: 'dsh/pi-ai', retention: 'short' },
      },
      capabilities: {
        models: true,
        quota: true,
        search: true,
        imageGeneration: true,
        composerQuota: true,
        speedMode: true,
      },
      configuration: {
        quickQuotaVisible: false,
        searchProvider: 'dsh',
        speedMode: SPEED_MODE_STANDARD,
        writable: true,
      },
      issues: [],
    },
  })
  assert.doesNotMatch(JSON.stringify(diagnostics), /access|refresh|accountId|expiresAt/)

  await host.updateSettings({ quickQuotaVisible: true })
  assert.deepEqual(host.webUpdates, [], 'quota-only settings must not touch the web provider')
  await host.updateSettings({ searchProvider: 'codex' })
  assert.deepEqual(host.webUpdates, [{
    config: { searchProvider: 'codex-subscription', fetchProvider: 'local' },
    noSave: true,
  }])

  const preferenceStatus = await host.handled[0].handler('preferences/status', {}, signal)
  assert.deepEqual(preferenceStatus, {
    ok: true,
    value: { quickQuotaVisible: true, searchProvider: 'codex', speedMode: SPEED_MODE_STANDARD, writable: true },
  })
  const preferenceUpdate = await host.handled[0].handler('preferences/update', {
    quickQuotaVisible: false,
    searchProvider: 'dsh',
    speedMode: SPEED_MODE_FAST,
  }, signal)
  assert.deepEqual(preferenceUpdate, {
    ok: true,
    value: { quickQuotaVisible: false, searchProvider: 'dsh', speedMode: SPEED_MODE_FAST, writable: true },
  })
  assert.deepEqual(host.webUpdates.at(-1), {
    config: { searchProvider: 'deepseek-official', fetchProvider: 'local' },
    noSave: true,
  })
})

test('usage failures use a DSH-supported bounded RPC error', async () => {
  const handler = plugin.createSubscriptionRpcHandler({
    async authHandler() { throw new Error('not used') },
    usageReader: { async read() { throw new Error('host secret') }, clear() {} },
  })
  const result = await handler('usage', {}, new AbortController().signal)
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'internal', message: 'Could not read ChatGPT usage', details: { issues: [] } },
  })
  assert.doesNotMatch(JSON.stringify(result), /host secret/)
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

test('unknown browser search preferences fail safe to the DSH default', () => {
  assert.equal(normalizeSearchProvider(SEARCH_PROVIDER_DSH), SEARCH_PROVIDER_DSH)
  assert.equal(normalizeSearchProvider(SEARCH_PROVIDER_CODEX), SEARCH_PROVIDER_CODEX)
  assert.equal(normalizeSearchProvider(undefined), SEARCH_PROVIDER_DSH)
  assert.equal(normalizeSearchProvider('unexpected-provider'), SEARCH_PROVIDER_DSH)
})
