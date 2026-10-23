import assert from 'node:assert/strict'
import test from 'node:test'
import { createSearchRouter, gateSearchProvider } from '../src/search-router.js'

const provider = (id, answer) => ({ id, available: () => true, search: async () => ({ sources: [{ url: answer }], truncated: false }) })
const setup = (mode, configured = 'deepseek-search-api') => {
  const registry = new Map([['deepseek-search-api', provider('deepseek-search-api', 'api')], ['deepseek-official', provider('deepseek-official', 'official')]])
  const state = { mode, configured }
  const router = createSearchRouter({
    registry,
    configuredId: () => state.configured,
    mode: () => state.mode,
    providers: { codex: provider('codex-subscription', 'codex'), auto: provider('codex-subscription-auto', 'auto'), dsh: provider('codex-subscription-dsh', 'dsh') },
  })
  return { registry, router, state }
}
const answer = async (router, id) => (await router.get(id).search({ query: 'q' })).sources[0].url

test('the configured provider keeps its id and is answered by the mode, other providers are untouched', async () => {
  const { router, state } = setup('dsh')
  assert.equal(router.get('deepseek-search-api').id, 'deepseek-search-api')
  assert.equal(router.get('deepseek-search-api').available(), true)
  assert.equal(await answer(router, 'deepseek-search-api'), 'dsh')
  state.mode = 'codex'
  assert.equal(await answer(router, 'deepseek-search-api'), 'codex')
  state.mode = 'auto'
  assert.equal(await answer(router, 'deepseek-search-api'), 'auto')
  assert.equal(await answer(router, 'deepseek-official'), 'official')
  assert.equal(router.get('nothing'), undefined)
})

test('changing which provider DSH has configured moves the router with it; the registry itself stays as DSH built it', async () => {
  const { router, registry, state } = setup('codex')
  state.configured = 'deepseek-official'
  assert.equal(await answer(router, 'deepseek-official'), 'codex')
  assert.equal(await answer(router, 'deepseek-search-api'), 'api')
  assert.equal(registry.get('deepseek-search-api').id, 'deepseek-search-api')
  assert.equal(router.has('deepseek-official'), true)
  assert.equal(router.size, 2)
  router.set('extra', provider('extra', 'x'))
  assert.equal(registry.has('extra'), true, 'registrations pass through to the real registry')
  router.delete('extra')
  assert.equal(registry.has('extra'), false)
})

test('ids of this plugin and a registry that is not a Map are left alone', async () => {
  const { router, state } = setup('dsh', 'codex-subscription-auto')
  router.set('codex-subscription-auto', provider('codex-subscription-auto', 'own'))
  assert.equal(await answer(router, 'codex-subscription-auto'), 'own')
  assert.equal(state.configured, 'codex-subscription-auto')
  assert.equal(createSearchRouter({ registry: {}, configuredId: () => 'x', mode: () => 'dsh', providers: {} }), undefined)
})

test('cached provider handles follow model/setting changes and retain the selected route for Codex', async () => {
  let otherModels = 'off', model = 'custom-model'
  const selected = gateSearchProvider(provider('codex-subscription', 'codex'), {
    allowed: () => otherModels !== 'off' || model === 'openai-codex',
    resolveDshProvider: () => provider('native-dsh', 'native'),
  })
  assert.equal((await selected.search({ query: 'q' })).sources[0].url, 'native')
  model = 'openai-codex'
  assert.equal((await selected.search({ query: 'q' })).sources[0].url, 'codex')
  model = 'custom-model'
  otherModels = 'on'
  assert.equal((await selected.search({ query: 'q' })).sources[0].url, 'codex')
})

test('a gated search fails without recursion when the native provider is absent or points back to the plugin', async () => {
  for (const fallback of [undefined, provider('codex-subscription-dsh', 'wrong')]) {
    const selected = gateSearchProvider(provider('codex-subscription', 'codex'), { allowed: () => false, resolveDshProvider: () => fallback })
    assert.equal(selected.available(), false)
    await assert.rejects(selected.search({ query: 'q' }), error => error.code === 'WEB_PROVIDER_UNAVAILABLE')
  }
})
