import test from 'node:test'
import assert from 'node:assert/strict'
import { createSearchProviderSwitcher } from '../src/index.js'

function loaderWith(config) {
  const entry = {
    options: { id: 'web', config },
    updates: [],
    async update(options) {
      this.updates.push(options.config)
      this.options = { ...this.options, ...options }
    },
  }
  return { entry, loader: { entries: () => [entry] } }
}

test('selection rewrites the raw web config through the entry and keeps the DSH provider for later', async () => {
  const { entry, loader } = loaderWith({ searchProvider: 'deepseek-official', fetchProvider: 'http' })
  const switcher = createSearchProviderSwitcher(loader)
  await switcher.select('auto')
  assert.equal(entry.options.config.searchProvider, 'codex-subscription-auto')
  assert.equal(entry.options.config.fetchProvider, 'http')
  assert.equal(switcher.dshProviderId(), 'deepseek-official')
  await switcher.select('auto')
  assert.equal(entry.updates.length, 1, 'an unchanged selection writes nothing')
  await switcher.select('dsh')
  assert.equal(entry.options.config.searchProvider, 'deepseek-official')
})

test('restore puts the DSH provider back when the plugin goes away', async () => {
  const { entry, loader } = loaderWith({ searchProvider: 'deepseek-official', fetchProvider: 'http' })
  const switcher = createSearchProviderSwitcher(loader)
  await switcher.select('codex')
  assert.equal(entry.options.config.searchProvider, 'codex-subscription')
  await switcher.restore()
  assert.equal(entry.options.config.searchProvider, 'deepseek-official')
})
