import assert from 'node:assert/strict'
import test from 'node:test'
import { createWebProviderSettings } from '../src/web-provider-settings.js'

function setup({ search = 'deepseek-search-api', fetch = 'deepseek-fetch-api', legacy = { searchProvider: 'codex', fetchProvider: 'codex' }, user = legacy } = {}) {
  const web = { ns: 'web', value: { searchProvider: search, fetchProvider: fetch }, base: { searchProvider: 'deepseek-search-api' }, revision: 2 }
  const plugin = { ns: 'subscription', user, revision: 4 }
  const config = { ...legacy }
  const writes = []
  const settings = {
    id: plugin.ns,
    get: () => config,
    async update(patch, revision) {
      assert.equal(revision, plugin.revision)
      Object.assign(config, patch)
      plugin.revision += 1
    },
  }
  const ctx = {
    web: { listProviders() {} },
    settings: {
      describe: () => [web, plugin],
      writable: true,
      async update(ns, patch, revision) {
        assert.equal(ns, web.ns)
        assert.equal(revision, web.revision)
        writes.push(patch)
        Object.assign(web.value, patch)
        web.revision += 1
      },
    },
  }
  return { sync: createWebProviderSettings(ctx, settings), web, writes, ctx, config }
}

test('moves both legacy Codex routes in one Web update and respects future DSH choices', async () => {
  const { sync, web, writes } = setup()
  await sync.migrate()
  assert.deepEqual(writes, [{ searchProvider: 'codex-subscription', fetchProvider: 'codex-subscription-fetch' }])
  assert.equal(sync.managed(), true)
  web.value.searchProvider = 'custom-search'
  await sync.migrate()
  assert.equal(writes.length, 1)
  assert.equal(sync.nativeSearch(), 'custom-search')
})

test('Auto keeps the native third-party search it previously delegated to', async () => {
  const { sync, writes } = setup({ search: 'custom-search', legacy: { searchProvider: 'auto', fetchProvider: 'dsh' } })
  await sync.migrate()
  assert.deepEqual(writes, [{ searchProvider: 'codex-subscription-auto' }])
  assert.equal(sync.nativeSearch(), 'custom-search')
})

test('native provider, explicit DSH-page selection and fresh profiles keep their route', async () => {
  for (const input of [
    { legacy: { searchProvider: 'dsh', fetchProvider: 'dsh' } },
    { search: 'codex-subscription-auto', legacy: { searchProvider: 'codex', fetchProvider: 'dsh' } },
    { user: undefined, legacy: { searchProvider: 'auto', fetchProvider: 'dsh' } },
  ]) {
    const { sync, writes } = setup(Object.hasOwn(input, 'user') ? { ...input, user: {} } : input)
    await sync.migrate()
    assert.deepEqual(writes, [])
    assert.equal(sync.managed(), true)
  }
})

test('read-only host saves no migration marker', async () => {
  const { sync, writes, ctx } = setup()
  ctx.settings.writable = false
  await sync.migrate()
  assert.equal(sync.managed(), false)
  assert.deepEqual(writes, [])
})

test('remembers the last native search and fetch selections across subscription switches', async () => {
  const { sync, web, config } = setup({ search: 'third-party-search', fetch: 'third-party-fetch' })
  await sync.migrate()
  assert.equal(config.webSearchFallbackProvider, 'third-party-search')
  assert.equal(config.webFetchFallbackProvider, 'third-party-fetch')
  Object.assign(web.value, { searchProvider: 'deepseek-official', fetchProvider: 'http' })
  await sync.remember()
  Object.assign(web.value, { searchProvider: 'codex-subscription-auto', fetchProvider: 'codex-subscription-fetch' })
  await sync.remember()
  assert.equal(sync.nativeSearch(), 'deepseek-official')
  assert.equal(config.webFetchFallbackProvider, 'http')
  Object.assign(web.value, { fetchProvider: 'codex-subscription-fetch-fallback' })
  await sync.remember()
  assert.equal(sync.nativeFetch(), 'http')
  assert.equal(config.webFetchFallbackProvider, 'http', 'the composite provider must never become its own fallback')
})

test('migrates an explicit fallback mode and preserves the previous native reader', async () => {
  const { sync, writes, config, web } = setup({ legacy: { searchProvider: 'dsh', fetchProvider: 'codex-fallback' }, fetch: 'http' })
  await sync.migrate()
  assert.deepEqual(writes, [{ fetchProvider: 'codex-subscription-fetch-fallback' }])
  assert.equal(config.webFetchFallbackProvider, 'http')
  assert.equal(sync.nativeFetch(), 'http')
  web.value.fetchProvider = 'custom-fetch'
  assert.equal(sync.nativeFetch(), 'custom-fetch')
})

test('first shared migration activates an existing new order instead of the stale legacy Codex choice', async () => {
  const { sync, writes, config, web } = setup({ fetch: 'http', legacy: { searchProvider: 'dsh', fetchProvider: 'codex', fetchProviderOrder: ['http'] } })
  await sync.migrate()
  assert.deepEqual(config.fetchProviderOrder, ['http'])
  assert.deepEqual(writes, [{ fetchProvider: 'codex-subscription-fetch-chain' }])
  assert.equal(sync.managed(), true)
  web.value.fetchProvider = 'deepseek-fetch-api'
  await sync.migrate()
  assert.equal(web.value.fetchProvider, 'deepseek-fetch-api', 'subsequent external shared choices remain authoritative')
})

test('native fallback lookup excludes both subscription providers and can use the host base', () => {
  const { sync, web, config } = setup({ fetch: 'codex-subscription-fetch-fallback' })
  config.webFetchFallbackProvider = 'codex-subscription-fetch'
  web.base.fetchProvider = 'http'
  assert.equal(sync.nativeFetch(), 'http')
  delete web.base.fetchProvider
  assert.equal(sync.nativeFetch(), undefined)
})
