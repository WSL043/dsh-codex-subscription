import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const require = createRequire(import.meta.resolve('tsdown'))
const { rolldown } = await import(pathToFileURL(require.resolve('rolldown')).href)
const source = await readFile(new URL('../src/client-web-provider-settings.jsx', import.meta.url), 'utf8')
const bundle = await rolldown({ input: 'web-settings', transform: { jsx: { runtime: 'automatic' } }, plugins: [{
  name: 'shared-web-settings-fixture',
  resolveId(id, importer) { return importer ? { id, external: true } : '\0web-settings' },
  load() { return { code: source, moduleType: 'jsx' } },
}] })
let code
try { code = (await bundle.generate({ format: 'cjs' })).output[0].code }
finally { await bundle.close() }

function harness({ writable = true, base = {} } = {}) {
  const calls = []
  const form = {
    getSnapshot: () => ({ status: 'ready', writable, revision: 3, value: { searchProvider: 'deepseek-search-api', fetchProvider: 'http' }, base }),
    mutate: async (ops, revision) => { calls.push([JSON.parse(JSON.stringify(ops)), revision]); return true },
  }
  const external = {
    react: { useEffect() {}, useState: value => [value, () => {}], useSyncExternalStore: (_subscribe, get) => get() },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    './client-hint.jsx': { SettingsLabel() {} },
    './client-primitives.jsx': { IconChevronDownOutline14() {}, Menu() {} },
  }
  const module = { exports: {} }
  new vm.Script(code).runInNewContext({ module, exports: module.exports, require: id => external[id] })
  const view = module.exports.WebProviderSettings({ ctx: { get: () => ({ get: () => form }) }, t: key => key })
  return { calls, choice: view.props.children[0].props, view }
}

test('shared Web settings now render only search, leaving webpage order in its own section', () => {
  const h = harness()
  assert.equal(h.choice.kind, 'search')
  assert.equal(h.choice.title, 'searchTitle')
  assert.doesNotMatch(JSON.stringify(h.view), /fetchFallbackTarget|fetchFallbackHint|fetchTitle/u)
})

test('changing shared search persists only the search provider', async () => {
  const h = harness()
  await h.choice.change('searchProvider', 'codex-subscription')
  assert.deepEqual(h.calls, [[[{ op: 'set', path: ['searchProvider'], value: 'codex-subscription' }], 3]])
})

test('returning shared search to its base unsets the override without rewriting fetch selection', async () => {
  const h = harness({ base: { searchProvider: 'codex-subscription-auto' } })
  await h.choice.change('searchProvider', 'codex-subscription-auto')
  assert.deepEqual(h.calls, [[[{ op: 'unset', path: ['searchProvider'] }], 3]])
})

test('read-only shared search remains disabled', () => {
  assert.equal(harness({ writable: false }).choice.writable, false)
})
