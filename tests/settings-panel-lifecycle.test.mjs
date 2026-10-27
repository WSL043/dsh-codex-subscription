import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'

// Compile the actual components in memory. The hook/clock host below exercises
// their effects and retained state, without pretending to be browser acceptance.
const require = createRequire(import.meta.resolve('tsdown'))
const { rolldown } = await import(pathToFileURL(require.resolve('rolldown')).href)
const compiled = new Map()
async function codeFor(file) {
  if (!compiled.has(file)) compiled.set(file, (async () => {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8')
    const bundle = await rolldown({
      input: 'component', transform: { jsx: { runtime: 'automatic' } },
      plugins: [{ name: 'component-fixture',
        resolveId(id, importer) { return importer ? { id, external: true } : '\0component' },
        load() { return { code: source, moduleType: 'jsx' } },
      }],
    })
    try { return (await bundle.generate({ format: 'cjs' })).output[0].code }
    finally { await bundle.close() }
  })())
  return compiled.get(file)
}
const flush = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(value => { resolve = value }); return { promise, resolve } }
const element = (type, props, key) => ({ type, props: props ?? {}, key })
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate))
  if (!tree || typeof tree !== 'object') return []
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)]
}
const named = name => Object.assign(() => null, { displayName: name })
async function component(file, name, props, additions = {}, invoke = (fn, value) => fn(value)) {
  const cells = [], pending = [], window = new EventTarget(), document = new EventTarget()
  document.visibilityState = 'visible'
  document.getElementById = () => ({ focus() {} })
  let cursor = 0, dirty = false, currentProps = props, tree
  const state = initial => {
    const index = cursor++
    if (!cells[index]) cells[index] = { value: typeof initial === 'function' ? initial() : initial }
    return [cells[index].value, value => {
      const next = typeof value === 'function' ? value(cells[index].value) : value
      if (!Object.is(next, cells[index].value)) { cells[index].value = next; dirty = true }
    }]
  }
  const effect = (run, deps) => {
    const index = cursor++, previous = cells[index]
    if (previous && deps && previous.deps?.length === deps.length && deps.every((value, n) => Object.is(value, previous.deps[n]))) return
    cells[index] = { deps, cleanup: previous?.cleanup }
    pending.push(() => { cells[index].cleanup?.(); cells[index].cleanup = run() })
  }
  const hooks = { useState: state, useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial } },
    useEffect: effect, useLayoutEffect: effect, useId: () => 'settings-fixture' }
  const shared = { useAccountStatusSnapshot: () => ({ status: 'ready', account: { authenticated: true } }),
    usePreferenceSnapshot: () => ({}), uiLocale: () => 'en-US', fill: value => value, percent: String, windowLabel: String }
  const dependencies = { react: hooks, 'react/jsx-runtime': { jsx: element, jsxs: element },
    './client-shared.js': shared, './rpc-contract.js': { CHANNEL: 'fixture' },
    './client-recovery.js': { recoveryCall: (rpc, endpoint, payload) => rpc.call('fixture', endpoint, payload) },
    ...additions }
  const module = { exports: {} }
  new vm.Script(await codeFor(file), { filename: file }).runInNewContext({
    module, exports: module.exports, console, window, document, Date,
    setTimeout: (...args) => setTimeout(...args), clearTimeout: id => clearTimeout(id),
    setInterval: (...args) => setInterval(...args), clearInterval: id => clearInterval(id),
    require: id => dependencies[id] ?? new Proxy({}, { get: (_target, key) => named(String(key)) }),
  })
  const render = (patch = {}) => {
    currentProps = { ...currentProps, ...patch }
    let passes = 0
    do {
      assert.ok(passes++ < 20, 'component settled')
      cursor = 0; dirty = false; tree = invoke(module.exports[name], currentProps)
      while (pending.length) pending.shift()()
    } while (dirty)
    return tree
  }
  render()
  return { render, get tree() { return tree }, get props() { return currentProps }, window, document,
    dispose() { for (const cell of cells) cell?.cleanup?.() } }
}

test('unused settings panels do not mount; visited panels and accessible targets survive navigation', async () => {
  const pages = Object.fromEntries(['CreatePage','FeatureOverview','ModelsPage','MorePage','QuotaSettingsCard','ToolsPage'].map(name => [name, named(name)]))
  const h = await component('client-section.jsx', 'CodexSection', {
    preference: { refreshModels() {} }, accountStatus: { load() {} }, t: key => key,
  }, { './client-pages.jsx': pages })
  try {
    const panel = name => nodes(h.tree, node => node.props.role === 'tabpanel' && node.props.id.endsWith(`-${name}`))[0]
    const tab = name => nodes(h.tree, node => node.props.role === 'tab' && node.props.id.endsWith(`-${name}-tab`))[0]
    assert.equal(nodes(h.tree, node => node.props.role === 'tabpanel').length, 5)
    assert.equal(panel('more').props.children, false)
    assert.equal(panel('tools').props.children, false)
    assert.equal(tab('more').props['aria-controls'], panel('more').props.id)
    nodes(h.tree, node => node.type === pages.FeatureOverview)[0].props.go('more'); h.render()
    assert.equal(panel('more').props.children.type, pages.MorePage)
    assert.equal(panel('more').props.children.props.active, true)
    tab('tools').props.onClick(); h.render()
    assert.equal(panel('more').props.children.type, pages.MorePage, 'same component stays mounted')
    assert.equal(panel('more').props.children.props.active, false)
    assert.equal(panel('tools').props.children.props.active, true)
    tab('more').props.onKeyDown({ key: 'Home', preventDefault() {} }); h.render()
    assert.equal(tab('start').props['aria-selected'], true)
    assert.equal(panel('tools').props.children.props.active, false)
  } finally { h.dispose() }
})

test('remote display polling pauses while hidden and returns without regenerating pairing', async t => {
  t.mock.timers.enable({ apis: ['setTimeout','setInterval','Date'], now: 1000 })
  const calls = []
  const rpc = { async call(_channel, endpoint) {
    calls.push(endpoint)
    return { ok: true, value: endpoint === 'remote/pair' ? { pairingCode: 'synthetic', expiresAt: 61000 } : endpoint === 'remote/clients' ? [] : { status: 'connected' } }
  } }
  const h = await component('client-remote-control.jsx', 'RemoteControlCard', { rpc, snapshot: { remoteControl: 'on' }, t: key => key, active: true })
  try {
    await flush(); h.render()
    assert.deepEqual(calls, ['remote/clients','remote/status'])
    nodes(h.tree, node => node.props.children === 'remotePair')[0].props.onClick()
    await flush(); h.render()
    const code = nodes(h.tree, node => node.type?.name === 'Qr')[0].props.value
    h.render({ active: false }); const before = calls.length
    t.mock.timers.tick(70000); await flush(); h.render()
    assert.equal(calls.length, before)
    h.render({ active: true }); await flush(); h.render()
    assert.equal(calls.length, before + 2)
    assert.equal(calls.filter(value => value === 'remote/pair').length, 1)
    assert.ok(code.endsWith('synthetic'))
    assert.equal(nodes(h.tree, node => node.props.children === 'remoteExpired').length, 1, 're-entry refreshes the clock immediately')
  } finally { h.dispose() }
})

test('a started runtime installation keeps its progress and finishes across hidden tabs', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let status = { phase: 'idle', available: true, installable: true, componentVersion: 'fixture' }, reads = 0, loads = 0
  const rpc = { async call(_channel, endpoint) {
    if (endpoint === 'runtime/install') status = { ...status, phase: 'installing' }
    else reads++
    return { ok: true, value: status }
  } }
  const h = await component('client-runtime-management.jsx', 'RuntimeManagement', { rpc, preference: { load() { loads++ } }, t: key => key, active: false })
  try {
    assert.equal(reads, 0)
    h.render({ active: true }); await flush(); h.render(); assert.equal(reads, 1)
    nodes(h.tree, node => node.props.children === 'runtimeInstall')[0].props.onClick()
    await flush(); h.render({ active: false })
    status = { ...status, phase: 'done', restartRequired: true }
    t.mock.timers.tick(1500); await flush(); h.render()
    assert.equal(reads, 2)
    assert.equal(loads, 1)
    assert.ok(nodes(h.tree, node => node.props.children === 'runtimeRestart').length)
  } finally { h.dispose() }
})

test('multi-account quota pauses outside its visible panel and merges refreshes without losing its snapshot', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  let calls = 0, gate
  const rpc = { async call() { calls++; return gate ? gate.promise : { accounts: [{ id: 'a', usage: { marker: calls } }] } } }
  const h = await component('client-account-quota.jsx', 'useAccountQuotas', { rpc, ids: ['a','b'], active: false },
    { './client-recovery.js': { recoveryCall: () => rpc.call() } }, (hook, value) => hook(value.rpc, value.ids, value.active))
  try {
    assert.equal(calls, 0)
    h.render({ active: true }); await flush(); h.render()
    assert.equal(calls, 1); assert.equal(h.tree.entries.a.usage.marker, 1)
    h.render({ active: false }); t.mock.timers.tick(180000); await flush(); h.render()
    assert.equal(calls, 1); assert.equal(h.tree.entries.a.usage.marker, 1)
    h.render({ active: true }); await flush(); h.render(); assert.equal(calls, 2)
    h.document.visibilityState = 'hidden'; h.document.dispatchEvent(new Event('visibilitychange'))
    t.mock.timers.tick(180000); h.window.dispatchEvent(new Event('codex-subscription:usage-loaded'))
    await flush(); h.render(); assert.equal(calls, 2); assert.equal(h.tree.entries.a.usage.marker, 2)
    gate = deferred()
    h.document.visibilityState = 'visible'; h.document.dispatchEvent(new Event('visibilitychange'))
    h.window.dispatchEvent(new Event('codex-subscription:usage-loaded'))
    await flush(); h.render(); assert.equal(calls, 3, 'visibility and quota events share the pending read')
    h.render({ active: false }); gate.resolve({ accounts: [{ id: 'a', usage: { marker: 3 } }] })
    await flush(); h.render(); assert.equal(h.tree.entries.a.usage.marker, 3)
  } finally { h.dispose() }
})

test('a late multi-account response cannot overwrite another account list', async () => {
  const first = deferred(); let calls = 0
  const rpc = { call() { return ++calls === 1 ? first.promise : Promise.resolve({ accounts: [{ id: 'c', usage: { marker: 2 } }] }) } }
  const h = await component('client-account-quota.jsx', 'useAccountQuotas', { rpc, ids: ['a','b'], active: true },
    { './client-recovery.js': { recoveryCall: () => rpc.call() } }, (hook, value) => hook(value.rpc, value.ids, value.active))
  try {
    h.render({ ids: ['c','d'] }); await flush(); h.render()
    assert.ok(h.tree.entries.c)
    first.resolve({ accounts: [{ id: 'a', usage: { marker: 1 } }] })
    await flush(); h.render()
    assert.ok(h.tree.entries.c); assert.equal(h.tree.entries.a, undefined)
  } finally { h.dispose() }
})
