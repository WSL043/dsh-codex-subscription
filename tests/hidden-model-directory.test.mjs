import assert from 'node:assert/strict'
import test from 'node:test'
import { createHiddenModelDirectory, visibleModels } from '../src/hidden-model-directory.js'

const models = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase() }))
const idsOf = list => list.map(model => model.id)

test('hidden models leave the directory and stale ids are ignored', () => {
  assert.deepEqual(idsOf(visibleModels(models, { disabled: () => ['b', 'd', 'gone'] })), ['a', 'c'])
  assert.equal(visibleModels(models, { disabled: () => [] }), models)
  assert.equal(visibleModels(models, { disabled: () => ['gone'] }).length, 4)
})

test('a hidden model that a session, the default or an own setting still uses stays listed', () => {
  const kept = visibleModels(models, { disabled: () => ['b', 'c', 'd'], pinned: () => ['c', 'unknown'] })
  assert.deepEqual(idsOf(kept), ['a', 'c'])
})

test('the directory is never emptied: the default model, else the first, stays', () => {
  const all = { disabled: () => ['a', 'b', 'c', 'd'] }
  assert.deepEqual(idsOf(visibleModels(models, { ...all, fallback: () => 'c' })), ['c'])
  assert.deepEqual(idsOf(visibleModels(models, { ...all, fallback: () => 'missing' })), ['a'])
  assert.deepEqual(visibleModels([], all), [])
})

function harness({ disabled = [], pinned = [] } = {}) {
  const state = { disabled, pinned, emits: 0, resolved: [] }
  const adapter = {
    listModels: async provider => provider === 'openai-codex' ? models : [{ id: 'other' }],
    resolveModel: async (provider, model) => { state.resolved.push(model); return { id: model } },
    stream: options => options.model,
  }
  const directory = createHiddenModelDirectory({
    provider: 'openai-codex',
    disabled: () => state.disabled,
    pinned: () => { if (state.pinnedThrows) throw new Error('boom'); return state.pinned },
    emit: () => { state.emits += 1 },
  })
  return { state, directory, adapter: directory.wrap(adapter) }
}

test('only the listing is filtered; routing a hidden model still resolves from the full catalog', async () => {
  const { adapter, state } = harness({ disabled: ['b'] })
  assert.deepEqual(idsOf(await adapter.listModels('openai-codex')), ['a', 'c', 'd'])
  assert.deepEqual(await adapter.listModels('another'), [{ id: 'other' }])
  assert.deepEqual(await adapter.resolveModel('openai-codex', 'b'), { id: 'b' })
  assert.equal(adapter.stream({ model: 'b' }), 'b')
  assert.deepEqual(state.resolved, ['b'])
})

test('a failing session read does not hide or break the list', async () => {
  const { adapter, state } = harness({ disabled: ['b'] })
  state.pinnedThrows = true
  assert.deepEqual(idsOf(await adapter.listModels('openai-codex')), ['a', 'c', 'd'])
})

test('changing the hidden list asks the host to reload its directory, other writes do not', () => {
  const { directory, state } = harness()
  assert.equal(directory.settingsChanged(['b'], []), true)
  assert.equal(directory.settingsChanged(['b', 'c'], ['c', 'b']), false)
  assert.equal(directory.settingsChanged([], ['b']), true)
  assert.equal(state.emits, 2)
})

test('a pinned change that alters the listed set emits; an unchanged one does not', async () => {
  const { adapter, directory, state } = harness({ disabled: ['b'] })
  assert.equal(directory.dependenciesChanged(), false)
  await adapter.listModels('openai-codex')
  assert.equal(directory.dependenciesChanged(), false)
  state.pinned = ['b']
  assert.equal(directory.dependenciesChanged(), true)
  assert.equal(state.emits, 1)
  await adapter.listModels('openai-codex')
  assert.equal(directory.dependenciesChanged(), false)
  state.pinned = []
  assert.equal(directory.dependenciesChanged(), true)
})
