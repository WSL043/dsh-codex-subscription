import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import * as fetchOrder from '../src/fetch-order.js'
import { en } from '../src/client-locales.js'

const require = createRequire(import.meta.resolve('tsdown'))
const { rolldown } = await import(pathToFileURL(require.resolve('rolldown')).href)
const codeByPath = new Map()
for (const path of ['client-fetch-order.jsx', 'client-web-provider-settings.jsx']) {
  const source = await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
  const bundle = await rolldown({ input: path, transform: { jsx: { runtime: 'automatic' } }, plugins: [{
    name: 'fetch-order-ui-fixture',
    resolveId(id, importer) { return importer ? { id, external: true } : '\0fixture' },
    load() { return { code: source, moduleType: 'jsx' } },
  }] })
  try { codeByPath.set(path, (await bundle.generate({ format: 'cjs' })).output[0].code) }
  finally { await bundle.close() }
}

const codex = 'codex-subscription-fetch'
const http = 'http'
const deepseek = 'deepseek-fetch-api'
const sources = [
  { id: codex, title: 'Codex', available: true },
  { id: http, title: 'HTTP', available: true },
  { id: deepseek, title: 'DeepSeek Fetch API', available: true },
]
const plain = value => JSON.parse(JSON.stringify(value))
const fill = (text, values) => Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), text)
function walk(view) {
  if (Array.isArray(view)) return view.flatMap(walk)
  if (!view || typeof view !== 'object') return []
  return [view, ...walk(view.props?.children)]
}

function harness({ order = [codex, http], catalog = sources, state = {}, deferred = false, fail = false } = {}) {
  let snapshot = { status: 'ready', writable: true, saving: false, fetchOrderAvailable: true, fetchProviderOrder: [...order], fetchSources: [...catalog], ...state }
  let view, cursor = 0, release
  const calls = [], effects = [], hooks = [], listeners = new Map(), cleanups = []
  let loads = 0, disposed = 0, sharedProvider = fetchOrder.FETCH_CHAIN_PROVIDER_ID
  const preference = {
    getSnapshot: () => snapshot,
    load: async () => { loads++ },
    set: async patch => {
      calls.push(plain(patch))
      snapshot = { ...snapshot, saving: true }
      if (deferred) await new Promise(resolve => { release = resolve })
      snapshot = { ...snapshot, saving: false, error: fail, ...(!fail ? plain(patch) : {}) }
      return !fail
    },
  }
  const ctx = {
    inject(_dependencies, callback) {
      callback({
        get: () => ({ $on: (event, listener) => { listeners.set(event, listener); return () => listeners.delete(event) } }),
        on: (event, listener) => { listeners.set(event, listener); return () => listeners.delete(event) },
        effect: callback => cleanups.push(callback()),
      })
      return { dispose() { disposed++; cleanups.splice(0).forEach(cleanup => cleanup?.()) } }
    },
  }
  const primitives = { IconChevronDownOutline14() {}, Menu() {}, Button() {} }
  const external = {
    react: {
      useState(initial) {
        const position = cursor++
        if (!(position in hooks)) hooks[position] = initial
        return [hooks[position], next => { hooks[position] = typeof next === 'function' ? next(hooks[position]) : next }]
      },
      useRef(initial) {
        const position = cursor++
        return hooks[position] ??= { current: initial }
      },
      useEffect(callback, dependencies) {
        const position = cursor++
        const previous = hooks[position]
        if (!previous || dependencies.some((value, index) => value !== previous.dependencies[index])) {
          effects.push(() => { previous?.cleanup?.(); hooks[position] = { dependencies, cleanup: callback() } })
        }
      },
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    './client-hint.jsx': { Hint() {}, SettingsLabel() {} },
    './client-primitives.jsx': primitives,
    './client-shared.js': { fill, usePreferenceSnapshot: () => snapshot },
    './client-web-provider-settings.jsx': { webProviderTitle: id => sources.find(source => source.id === id)?.title ?? id, useWebProviderForm: () => ({ value: { fetchProvider: sharedProvider } }) },
    './fetch-order.js': fetchOrder,
  }
  const module = { exports: {} }
  new vm.Script(codeByPath.get('client-fetch-order.jsx')).runInNewContext({ module, exports: module.exports, require: id => external[id] })
  const render = () => {
    cursor = 0
    view = module.exports.FetchOrderPreference({ preference, t: key => en[key], webSettingsContext: ctx })
    effects.splice(0).forEach(effect => effect())
    return view
  }
  render()
  return {
    calls, render,
    menus: () => walk(view).filter(node => node.type === primitives.Menu).map(node => node.props),
    buttons: () => walk(view).filter(node => node.type === primitives.Button).map(node => node.props),
    text: () => JSON.stringify(view),
    change: (index, id) => walk(view).filter(node => node.type === primitives.Menu)[index].props.onSelect(id),
    update(patch) { snapshot = { ...snapshot, ...patch }; render() },
    selectShared(id) { sharedProvider = id; render() },
    emit(event = 'web/providers-changed') { listeners.get(event)?.() },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()) },
    release: () => release?.(),
    get loads() { return loads }, get disposed() { return disposed }, get listeners() { return listeners.size },
  }
}

test('numbered rows offer atomic sources; the first has no Stop and the append row has no used sources', () => {
  const fixture = harness({ catalog: [...sources, { id: fetchOrder.FETCH_CHAIN_PROVIDER_ID, available: true }] })
  const menus = fixture.menus()
  assert.equal(menus.length, 3)
  assert.deepEqual(plain(menus[0].items.map(item => item.id)), [codex, http, deepseek])
  assert.deepEqual(plain(menus[1].items.map(item => item.id)), [codex, http, deepseek, fetchOrder.FETCH_STOP])
  assert.deepEqual(plain(menus[2].items.map(item => item.id)), [deepseek, fetchOrder.FETCH_STOP])
  assert.equal(menus[0].anchor.props['aria-label'], 'Source 1: Codex')
  assert.match(menus[0].items.find(item => item.id === http).description, /position 2/u)
  assert.match(fixture.text(), /unlisted sources are never used/u)
  assert.match(fixture.text(), /permission denial ends the entire chain/u)
})

test('using all sources removes the append row; an empty order starts with a first-source choice', async () => {
  assert.equal(harness({ order: [codex, http, deepseek] }).menus().length, 3)
  const fixture = harness({ order: [] })
  assert.equal(fixture.menus().length, 1)
  assert.equal(fixture.menus()[0].selectedId, undefined)
  assert.ok(fixture.menus()[0].items.every(item => item.id !== fetchOrder.FETCH_STOP))
  await fixture.change(0, http)
  assert.deepEqual(fixture.calls, [{ fetchProviderOrder: [http] }])
})

for (const [name, order, index, selected, expected] of [
  ['swaps existing sources', [codex, http, deepseek], 0, deepseek, [deepseek, http, codex]],
  ['replaces with an unused source', [codex, http], 0, deepseek, [deepseek, http]],
  ['truncates the old tail at Stop', [codex, http, deepseek], 1, fetchOrder.FETCH_STOP, [codex]],
  ['appends only an unused source', [codex, http], 2, deepseek, [codex, http, deepseek]],
]) {
  test(`${name} with exactly one whole-order preference.set`, async () => {
    const fixture = harness({ order })
    const original = order.slice()
    await fixture.change(index, selected)
    assert.deepEqual(fixture.calls, [{ fetchProviderOrder: expected }])
    assert.deepEqual(order, original)
  })
}

test('no-ops, Stop in the first row and attempts to swap from the append row never save', async () => {
  const fixture = harness()
  await fixture.change(0, codex)
  await fixture.change(0, fetchOrder.FETCH_STOP)
  await fixture.change(2, fetchOrder.FETCH_STOP)
  await fixture.change(2, http)
  assert.deepEqual(fixture.calls, [])
})

test('native providers without custom titles keep readable reader names (#280)', () => {
  const fixture = harness({ order: [http, deepseek, codex], catalog: sources.map(source => ({ ...source, title: source.id })) })
  assert.deepEqual(fixture.menus().map(menu => menu.anchor.props.children[0].props.children), ['HTTP', 'DeepSeek Fetch API', 'Codex'])
})

test('reordering keeps price information and third-party registered descriptions in the tooltip (#280)', () => {
  const fixture = harness({ order: [codex, deepseek] })
  const choice = fixture.menus()[0].items.find(item => item.id === deepseek)
  assert.match(choice.description, /swap/iu)
  assert.match(choice.description, /CNY 5/)
  const custom = harness({ order: [http], catalog: [...sources, { id: 'custom-reader', title: 'Custom', available: true, description: 'Uses the host account quota' }] })
  assert.equal(custom.menus()[1].items.find(item => item.id === 'custom-reader').description, 'Uses the host account quota')
})

test('empty catalogs have a clear empty state and retain missing selections', () => {
  const empty = harness({ order: [], catalog: [] })
  assert.equal(empty.menus().length, 0)
  assert.match(empty.text(), /No webpage reading sources are registered/u)
  const missing = harness({ order: ['removed', http], catalog: [] })
  assert.equal(missing.menus().length, 2)
  assert.equal(missing.menus()[0].items[0].label, 'removed (missing)')
  assert.equal(missing.menus()[0].items[0].disabled, true)
  assert.match(missing.text(), /position is retained/u)
  assert.deepEqual(missing.calls, [])
})

test('unavailable selections are retained and disabled, but can be corrected to an available source', async () => {
  const fixture = harness({ order: ['removed', http], catalog: sources.map(source => source.id === http ? { ...source, available: false } : source) })
  assert.equal(fixture.menus()[1].selectedId, http)
  assert.equal(fixture.menus()[1].items.find(item => item.id === http).disabled, true)
  assert.match(fixture.text(), /HTTP \(unavailable\)/u)
  await fixture.change(0, codex)
  assert.deepEqual(fixture.calls, [{ fetchProviderOrder: [codex, http] }])
})

test('an uncertain save clearly requires a reload and provides a refresh action instead of a generic failure', async () => {
  const fixture = harness({ state: { writable: true, error: true, fetchOrderNeedsReload: true } })
  assert.match(fixture.text(), /partially completed save/u)
  assert.doesNotMatch(fixture.text(), /Settings were not saved|DSH has not enabled/u)
  assert.ok(fixture.menus().every(menu => menu.anchor.props.disabled))
  const refresh = fixture.buttons().find(button => button.children === 'Refresh')
  assert.ok(refresh)
  assert.equal(refresh.disabled, false)
  refresh.onClick()
  assert.equal(fixture.loads, 1)
  await fixture.change(0, deepseek)
  assert.deepEqual(fixture.calls, [])
})

test('external shared Web selections refresh the effective order rather than leaving stale rows', () => {
  const fixture = harness({ state: { webProvidersManagedByDsh: true } })
  fixture.selectShared(http)
  assert.equal(fixture.loads, 1)
  fixture.selectShared(http)
  assert.equal(fixture.loads, 1)
  assert.deepEqual(fixture.calls, [])
})

test('external reader edits refresh from the host settings event even while its shared selector stays the chain (#280)', () => {
  const fixture = harness({ state: { webProvidersManagedByDsh: true } })
  fixture.emit('settings/document-updated')
  assert.equal(fixture.loads, 1)
  assert.deepEqual(fixture.calls, [], 'the invalidation reads state instead of replaying a stale row edit')
  fixture.unmount()
  fixture.emit('settings/document-updated')
  assert.equal(fixture.loads, 1)
  assert.equal(fixture.listeners, 0)
})

test('catalog additions stay candidates rather than silently extending the saved order', () => {
  const fixture = harness({ order: [codex], catalog: [sources[0]] })
  assert.equal(fixture.menus().length, 1)
  fixture.update({ fetchSources: [...sources, { id: 'extension-reader', title: 'Extension reader', available: true }] })
  assert.equal(fixture.menus().length, 2)
  assert.equal(fixture.menus()[1].selectedId, fetchOrder.FETCH_STOP)
  assert.ok(fixture.menus()[1].items.some(item => item.label === 'Extension reader'))
  assert.deepEqual(fixture.calls, [])
})

for (const state of [{ writable: false }, { saving: true }, { fetchOrderAvailable: false }, { status: 'loading' }, { status: 'unavailable' }]) {
  test(`readonly, saving and unsupported states block changes: ${JSON.stringify(state)}`, async () => {
    const fixture = harness({ state })
    assert.ok(fixture.menus().every(menu => menu.anchor.props.disabled))
    await fixture.change(0, deepseek)
    assert.deepEqual(fixture.calls, [])
  })
}

test('in-flight saves block repeated selections and defer provider refresh until completion', async () => {
  const fixture = harness({ deferred: true })
  const pending = fixture.change(0, deepseek)
  fixture.render()
  assert.ok(fixture.menus().every(menu => menu.anchor.props.disabled))
  assert.match(fixture.text(), /Saving settings/u)
  await fixture.change(1, codex)
  fixture.emit(); fixture.emit('connection/reset'); fixture.emit('settings/document-updated')
  assert.equal(fixture.loads, 0)
  fixture.release(); await pending
  assert.equal(fixture.calls.length, 1)
  assert.equal(fixture.loads, 1)
  fixture.render()
  assert.equal(fixture.menus()[0].selectedId, deepseek)
  fixture.unmount()
  assert.equal(fixture.disposed, 1)
  assert.equal(fixture.listeners, 0)
})

test('external saves also defer directory refresh, while failed saves retain the original order and error', async () => {
  const external = harness({ state: { saving: true } })
  external.emit()
  assert.equal(external.loads, 0)
  external.update({ saving: false })
  assert.equal(external.loads, 1)
  const failed = harness({ deferred: true, fail: true })
  const pending = failed.change(0, deepseek)
  failed.emit()
  failed.release(); await pending
  failed.render()
  assert.equal(failed.menus()[0].selectedId, codex)
  assert.equal(failed.loads, 0)
  assert.match(failed.text(), /The setting was not saved/u)
  assert.ok(walk(failed.render()).some(node => node.props?.role === 'alert'))
})

test('shared Web settings expose only search and keep the native search mutation contract', async () => {
  const mutations = []
  const form = {
    getSnapshot: () => ({ status: 'ready', writable: true, revision: 7, value: { searchProvider: 'codex-subscription' }, base: {} }),
    mutate: async (...args) => { mutations.push(plain(args)); return true },
  }
  const external = {
    react: { useEffect() {}, useState: initial => [initial, () => {}], useSyncExternalStore: (_subscribe, get) => get() },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    './client-hint.jsx': { SettingsLabel() {} },
    './client-primitives.jsx': { IconChevronDownOutline14() {}, Menu() {} },
  }
  const module = { exports: {} }
  new vm.Script(codeByPath.get('client-web-provider-settings.jsx')).runInNewContext({ module, exports: module.exports, require: id => external[id] })
  const view = module.exports.WebProviderSettings({ ctx: { get: () => ({ get: () => form }) }, t: key => en[key] })
  const choices = walk(view).filter(node => node.props?.kind)
  assert.equal(choices.length, 1)
  assert.equal(choices[0].props.kind, 'search')
  await choices[0].props.change('searchProvider', 'deepseek-search-api')
  assert.deepEqual(mutations, [[[{ op: 'set', path: ['searchProvider'], value: 'deepseek-search-api' }], 7]])
  assert.doesNotMatch(JSON.stringify(view), /fetchFallback|fetchProvider|webFetchFallbackProvider/u)
})
