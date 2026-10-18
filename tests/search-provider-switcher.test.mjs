import test from 'node:test'
import assert from 'node:assert/strict'
import { createSearchProviderSwitcher } from '../src/index.js'

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
