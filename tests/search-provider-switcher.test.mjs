import test from 'node:test'
import assert from 'node:assert/strict'
import { createSearchProviderSwitcher } from '../src/index.js'
import { CODEX_AUTO_SEARCH_PROVIDER_ID, CODEX_SEARCH_PROVIDER_ID, createCodexAutoSearchProvider } from '../src/codex-search.js'
import { DSH_ACCOUNT_SEARCH_PROVIDER_ID, createDshAccountSearchProvider } from '../src/deepseek-account-search.js'

// Mirrors the real loader: the entry keeps the raw config, the running fiber holds resolved volatile
// references and its update() takes a raw config.
function loaderWith(raw) {
  const updates = []
  const entry = {
    options: { id: 'web', config: raw },
    fiber: {
      config: Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, { get: () => value }])),
      async update(config, noSave) {
        for (const value of Object.values(config)) assert.equal(typeof value, 'string', 'raw config only')
        updates.push({ config, noSave })
        this.config = Object.fromEntries(Object.entries(config).map(([key, value]) => [key, { get: () => value }]))
      },
    },
  }
  return { entry, updates, loader: { entries: () => [entry] } }
}

test('selection restarts the web fiber with a raw config and leaves the saved settings alone', async () => {
  const { entry, updates, loader } = loaderWith({ searchProvider: 'deepseek-official', fetchProvider: 'http' })
  const switcher = createSearchProviderSwitcher(loader)
  await switcher.select('auto')
  assert.deepEqual(updates, [{ config: { searchProvider: 'codex-subscription-auto', fetchProvider: 'http' }, noSave: true }])
  assert.equal(switcher.current(), 'codex-subscription-auto')
  assert.equal(entry.options.config.searchProvider, 'deepseek-official')
  assert.equal(switcher.dshProviderId(), 'deepseek-official')
  await switcher.select('auto')
  assert.equal(updates.length, 1, 'an unchanged selection writes nothing')
  await switcher.select('codex')
  assert.equal(switcher.current(), 'codex-subscription')
})

test('the DSH selection goes through the account wrapper', async () => {
  const { loader } = loaderWith({ searchProvider: 'deepseek-official', fetchProvider: 'http' })
  const switcher = createSearchProviderSwitcher(loader)
  await switcher.select('dsh')
  assert.equal(switcher.current(), 'codex-subscription-dsh')
})

test('a missing web runtime is reported', async () => {
  const switcher = createSearchProviderSwitcher({ entries: () => [] })
  await assert.rejects(switcher.select('auto'), /unavailable/)
})

const subscriptionProviderIds = [CODEX_SEARCH_PROVIDER_ID, CODEX_AUTO_SEARCH_PROVIDER_ID, DSH_ACCOUNT_SEARCH_PROVIDER_ID]

for (const searchProvider of subscriptionProviderIds) {
  test(`a saved ${searchProvider} is never used as the DSH fallback`, () => {
    const { loader } = loaderWith({ searchProvider, fetchProvider: 'http' })
    const switcher = createSearchProviderSwitcher(loader)
    assert.equal(switcher.dshProviderId(), 'deepseek-official')
    assert.equal(switcher.current(), searchProvider, 'the configured selection remains unchanged')
  })
}

for (const searchProvider of ['deepseek-official', 'deepseek-search-api', 'custom-search']) {
  test(`the original DSH provider ${searchProvider} is preserved`, () => {
    const { loader } = loaderWith({ searchProvider })
    assert.equal(createSearchProviderSwitcher(loader).dshProviderId(), searchProvider)
  })
}

for (const searchProvider of [undefined, '']) {
  test(`an ${searchProvider === undefined ? 'omitted' : 'empty'} DSH provider uses the default`, () => {
    const { loader } = loaderWith({ searchProvider })
    assert.equal(createSearchProviderSwitcher(loader).dshProviderId(), 'deepseek-official')
  })
}

for (const modelProvider of ['opencode-go', 'kimi-coding', undefined, 'openai-codex']) {
  test(`saved auto search reaches DSH without recursion for ${modelProvider ?? 'missing model context'}`, async () => {
    const { loader } = loaderWith({ searchProvider: CODEX_AUTO_SEARCH_PROVIDER_ID })
    const switcher = createSearchProviderSwitcher(loader)
    // Fail before invoking the recursive route when run against the unfixed implementation.
    assert.equal(switcher.dshProviderId(), 'deepseek-official')
    let dshCalls = 0
    let codexCalls = 0
    const expected = { sources: [{ url: 'https://example.com' }], truncated: false }
    const registry = new Map([['deepseek-official', {
      id: 'deepseek-official',
      available: () => true,
      async search() { dshCalls++; return expected },
    }]])
    const codex = {
      id: CODEX_SEARCH_PROVIDER_ID,
      available: () => true,
      async search() {
        codexCalls++
        throw Object.assign(new Error('Simulated missing subscription credentials'), { code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
      },
    }
    const dsh = createDshAccountSearchProvider({ resolveDshProvider: () => registry.get(switcher.dshProviderId()) })
    const auto = createCodexAutoSearchProvider({ codex, resolveModelProvider: () => modelProvider, resolveDshProvider: () => dsh })
    for (const provider of [codex, dsh, auto]) registry.set(provider.id, provider)
    assert.equal(await auto.search({ query: 'q' }), expected)
    assert.equal(dshCalls, 1)
    assert.equal(codexCalls, modelProvider === 'openai-codex' ? 1 : 0)
  })
}
