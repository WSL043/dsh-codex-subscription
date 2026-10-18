import assert from 'node:assert/strict'
import test from 'node:test'
import { createSearchRouter } from '../src/search-router.js'

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
