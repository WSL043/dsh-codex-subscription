import assert from 'node:assert/strict'
import test from 'node:test'
import { createFetchOrderSettings } from '../src/fetch-order-settings.js'
import { CODEX_FETCH_PROVIDER_ID, CODEX_FETCH_FALLBACK_PROVIDER_ID } from '../src/codex-fetch.js'
import { FETCH_CHAIN_PROVIDER_ID, FETCH_ORDER_FIELD } from '../src/fetch-order.js'

function setup({ selected = CODEX_FETCH_PROVIDER_ID, config: initial = {}, managed = true, writable = true, supported = true, failWeb = false, failRestore = false, afterOrderWrite } = {}) {
  const config = { fetchProvider: 'codex', webFetchFallbackProvider: 'http', ...initial }
  const web = { ns: 'web', revision: 1, value: { fetchProvider: selected }, base: { fetchProvider: 'http' } }
  const plugin = { ns: 'codex-subscription', revision: 1 }
  const writes = []
  const codex = { id: CODEX_FETCH_PROVIDER_ID, title: 'Codex', available: () => true }
  const registry = new Map([
    ['http', { id: 'http', title: 'HTTP', available: () => true }],
    ['deepseek-fetch-api', { id: 'deepseek-fetch-api', title: 'DeepSeek Fetch API', available: () => true }],
    [codex.id, { ...codex, available: () => false }],
    [CODEX_FETCH_FALLBACK_PROVIDER_ID, { id: CODEX_FETCH_FALLBACK_PROVIDER_ID, available: () => true }],
    [FETCH_CHAIN_PROVIDER_ID, { id: FETCH_CHAIN_PROVIDER_ID, available: () => true }],
  ])
  const settings = { id: plugin.ns, get: () => config, async update(patch, revision) {
    if (revision !== undefined) assert.equal(revision, plugin.revision)
    writes.push({ entry: plugin.ns, patch: structuredClone(patch) })
    Object.assign(config, patch); plugin.revision++
    await afterOrderWrite?.({ config, web, plugin })
  } }
  const forms = {
    writable,
    describe: () => [web, plugin],
    async update(ns, patch, revision) {
      assert.equal(ns, 'web'); assert.equal(revision, web.revision)
      if (typeof failWeb === 'function') await failWeb({ config, plugin, web })
      else if (failWeb) throw new Error('Web selection rejected')
      writes.push({ entry: ns, patch: structuredClone(patch) })
      Object.assign(web.value, patch); web.revision++
    },
    async mutate(ns, ops, revision) {
      if (failRestore) throw new Error('Restore rejected')
      assert.equal(ns, plugin.ns); assert.equal(revision, plugin.revision)
      assert.deepEqual(ops, [{ op: 'unset', path: [FETCH_ORDER_FIELD] }])
      writes.push({ entry: ns, unset: FETCH_ORDER_FIELD })
      delete config[FETCH_ORDER_FIELD]; plugin.revision++
    },
  }
  const controller = createFetchOrderSettings({ settings, forms, registry, codex, configuredId: () => web.value.fetchProvider, managed: () => managed, available: () => supported })
  return { controller, config, web, plugin, registry, writes, forms }
}

test('the host reader description remains available without another per-plugin provider catalog (#280)', () => {
  const h = setup()
  h.registry.set('custom', { id: 'custom', title: 'Custom', description: 'Uses the host account quota', available: () => true })
  assert.deepEqual(h.controller.sources().find(source => source.id === 'custom'), { id: 'custom', title: 'Custom', description: 'Uses the host account quota', available: true })
})

test('initializing the old Codex-only setting preserves a one-source order without enabling paid fallbacks', async () => {
  const h = setup()
  assert.deepEqual(h.controller.order(), [CODEX_FETCH_PROVIDER_ID])
  await h.controller.initialize()
  assert.deepEqual(h.config[FETCH_ORDER_FIELD], [CODEX_FETCH_PROVIDER_ID])
  assert.equal(h.web.value.fetchProvider, FETCH_CHAIN_PROVIDER_ID)
  assert.deepEqual(h.controller.order(), [CODEX_FETCH_PROVIDER_ID])
  const count = h.writes.length
  await h.controller.initialize()
  assert.equal(h.writes.length, count)
})

for (const [selected, expected] of [
  [CODEX_FETCH_FALLBACK_PROVIDER_ID, [CODEX_FETCH_PROVIDER_ID, 'http']],
  ['http', ['http']], ['deepseek-fetch-api', ['deepseek-fetch-api']],
]) test(`migration preserves the effective ${selected} selection`, async () => {
  const h = setup({ selected })
  await h.controller.initialize()
  assert.deepEqual(h.config[FETCH_ORDER_FIELD], expected)
  assert.deepEqual(h.controller.order(), expected)
})

test('legacy hosts preserve explicit Codex preferences while retaining the native registry selection', async () => {
  const h = setup({ selected: 'http', managed: false, config: { fetchProvider: 'codex-fallback' } })
  await h.controller.initialize()
  assert.deepEqual(h.controller.order(), [CODEX_FETCH_PROVIDER_ID, 'http'])
  assert.equal(h.web.value.fetchProvider, 'http')
  assert.equal(h.writes.length, 1)
})

test('source discovery excludes composite strategies and uses the atomic Codex availability', () => {
  const h = setup()
  assert.deepEqual(h.controller.sources(), [
    { id: 'http', title: 'HTTP', available: true },
    { id: 'deepseek-fetch-api', title: 'DeepSeek Fetch API', available: true },
    { id: CODEX_FETCH_PROVIDER_ID, title: 'Codex', available: true },
  ])
})

test('saving writes the complete order once and activates the shared chain selection', async () => {
  const h = setup()
  const next = ['http', CODEX_FETCH_PROVIDER_ID, 'deepseek-fetch-api']
  await h.controller.update(next)
  assert.deepEqual(h.writes, [
    { entry: 'codex-subscription', patch: { [FETCH_ORDER_FIELD]: next } },
    { entry: 'web', patch: { fetchProvider: FETCH_CHAIN_PROVIDER_ID } },
  ])
  assert.deepEqual(h.controller.order(), next)
  assert.notEqual(h.config[FETCH_ORDER_FIELD], next)
})

test('existing chain edits keep the exact array order without changing search settings', async () => {
  const h = setup({ selected: FETCH_CHAIN_PROVIDER_ID, config: { [FETCH_ORDER_FIELD]: ['http', CODEX_FETCH_PROVIDER_ID] } })
  h.web.value.searchProvider = 'custom-search'
  await h.controller.update([CODEX_FETCH_PROVIDER_ID, 'http'])
  assert.deepEqual(h.writes, [{ entry: 'codex-subscription', patch: { [FETCH_ORDER_FIELD]: [CODEX_FETCH_PROVIDER_ID, 'http'] } }])
  assert.equal(h.web.value.searchProvider, 'custom-search')
})

test('an activation failure restores the previously absent order instead of claiming a saved chain', async () => {
  const h = setup({ failWeb: true })
  await assert.rejects(h.controller.update(['http', CODEX_FETCH_PROVIDER_ID]), /Web selection rejected/)
  assert.equal(h.config[FETCH_ORDER_FIELD], undefined)
  assert.equal(h.web.value.fetchProvider, CODEX_FETCH_PROVIDER_ID)
  assert.deepEqual(h.controller.order(), [CODEX_FETCH_PROVIDER_ID])
})

test('an activation failure restores the previous order when one was already saved', async () => {
  const h = setup({ failWeb: true, config: { [FETCH_ORDER_FIELD]: [CODEX_FETCH_PROVIDER_ID] } })
  await assert.rejects(h.controller.update(['http']), /Web selection rejected/)
  assert.deepEqual(h.config[FETCH_ORDER_FIELD], [CODEX_FETCH_PROVIDER_ID])
})

test('a concurrent shared selection during the first write is not overwritten by a fresh revision', async () => {
  const h = setup({ afterOrderWrite: ({ web }) => { web.value.fetchProvider = 'deepseek-fetch-api'; web.revision++ } })
  await assert.rejects(h.controller.update(['http']), error => error.code === 'fetch-order-reload-required')
  assert.equal(h.web.value.fetchProvider, 'deepseek-fetch-api')
  assert.equal(h.config[FETCH_ORDER_FIELD], undefined)
  assert.equal(h.writes.some(write => write.entry === 'web'), false)
})

test('a shared selection conflict after the baseline check also requires a reload', async () => {
  const h = setup({ failWeb: ({ web }) => {
    web.value.fetchProvider = 'deepseek-fetch-api'; web.revision++
    throw new Error('Concurrent selection revision changed')
  } })
  await assert.rejects(h.controller.update(['http']), error => error.code === 'fetch-order-reload-required')
  assert.equal(h.web.value.fetchProvider, 'deepseek-fetch-api')
  assert.equal(h.config[FETCH_ORDER_FIELD], undefined)
})

test('a failed rollback visibly reports the need to reload settings', async () => {
  const h = setup({ failWeb: true, failRestore: true })
  await assert.rejects(h.controller.update(['http']), /Could not activate or restore.*reload settings/)
})

test('rollback never overwrites another editor’s later order', async () => {
  const h = setup({ failWeb: ({ config, plugin }) => {
    config[FETCH_ORDER_FIELD] = ['deepseek-fetch-api']; plugin.revision++
    throw new Error('Concurrent Web edit')
  } })
  await assert.rejects(h.controller.update(['http']), /changed during activation/)
  assert.deepEqual(h.config[FETCH_ORDER_FIELD], ['deepseek-fetch-api'])
})

test('read-only or unsupported hosts do not migrate or persist an unavailable order', async () => {
  const readOnly = setup({ writable: false })
  await readOnly.controller.initialize()
  assert.deepEqual(readOnly.writes, [])
  const unsupported = setup({ supported: false })
  await unsupported.controller.initialize()
  await assert.rejects(unsupported.controller.update(['http']), /cannot configure/)
  assert.deepEqual(unsupported.writes, [])
})

test('new sources enter discovery only; removed selected sources remain in the order', async () => {
  const h = setup({ selected: FETCH_CHAIN_PROVIDER_ID, config: { [FETCH_ORDER_FIELD]: [CODEX_FETCH_PROVIDER_ID, 'http'] } })
  h.registry.set('new-reader', { id: 'new-reader', available: () => true })
  assert.deepEqual(h.controller.order(), [CODEX_FETCH_PROVIDER_ID, 'http'])
  h.registry.delete('http')
  assert.deepEqual(h.controller.order(), [CODEX_FETCH_PROVIDER_ID, 'http'])
  await h.controller.update(['http', CODEX_FETCH_PROVIDER_ID])
  assert.deepEqual(h.controller.order(), ['http', CODEX_FETCH_PROVIDER_ID])
  await assert.rejects(h.controller.update(['not-registered']), /no longer registered/)
})

test('external shared Web choices are respected without replacing the saved chain', async () => {
  const h = setup({ selected: FETCH_CHAIN_PROVIDER_ID, config: { [FETCH_ORDER_FIELD]: [CODEX_FETCH_PROVIDER_ID, 'http'] } })
  h.web.value.fetchProvider = 'deepseek-fetch-api'
  assert.deepEqual(h.controller.order(), ['deepseek-fetch-api'])
  await h.controller.initialize()
  assert.deepEqual(h.writes, [])
  assert.deepEqual(h.config[FETCH_ORDER_FIELD], [CODEX_FETCH_PROVIDER_ID, 'http'])
  await h.controller.update(['deepseek-fetch-api', 'http'])
  assert.equal(h.web.value.fetchProvider, FETCH_CHAIN_PROVIDER_ID)
})

test('an ambiguous absent native fallback is not guessed or silently extended', async () => {
  const h = setup({ selected: CODEX_FETCH_FALLBACK_PROVIDER_ID, config: { webFetchFallbackProvider: undefined } })
  delete h.web.base.fetchProvider
  assert.deepEqual(h.controller.order(), [])
  await h.controller.initialize()
  assert.deepEqual(h.writes, [])
})

test('invalid or recursive orders are rejected before writing any configuration', async () => {
  const h = setup()
  for (const next of [[], ['http', 'http'], [FETCH_CHAIN_PROVIDER_ID], [CODEX_FETCH_FALLBACK_PROVIDER_ID], ['__stop__']]) {
    await assert.rejects(h.controller.update(next))
  }
  assert.deepEqual(h.writes, [])
})
