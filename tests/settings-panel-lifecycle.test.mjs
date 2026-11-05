import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import * as settingsContract from '../src/settings-contract.js'
import { PROJECT_URL, maskEmail, unwrap, validDate } from '../src/client-shared.js'
import { SIGN_IN_RENEW } from '../src/http-failure.js'

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
let fixtureCounter = 0
async function component(file, name, props, additions = {}, invoke = (fn, value) => fn(value)) {
  const fixtureId = `settings-fixture-${++fixtureCounter}`
  const cells = [], pending = [], window = new EventTarget(), document = new EventTarget()
  window.setInterval = (...args) => setInterval(...args)
  window.clearInterval = id => clearInterval(id)
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
    useEffect: effect, useLayoutEffect: effect, useId: () => fixtureId }
  const shared = { useAccountStatusSnapshot: () => ({ status: 'ready', account: { authenticated: true } }),
    usePreferenceSnapshot: () => ({}), uiLocale: () => 'en-US', fill: value => value, percent: String, windowLabel: String, validDate }
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

test('project action belongs only to this bundle and the native button opens its declared homepage', async () => {
  const t = key => key
  for (const subject of [undefined, { kind: 'item', id: 'other' }, { kind: 'row', pkg: { name: 'dsh-codex-subscription' } }, { kind: 'bundle', pkg: { name: 'other' } }]) {
    const host = await component('client-section.jsx', 'ProjectAction', { subject, t })
    assert.equal(host.tree, null)
    host.dispose()
  }
  const action = await component('client-section.jsx', 'ProjectAction', { subject: { kind: 'bundle', pkg: { name: 'dsh-codex-subscription' } }, t })
  assert.ok(action.tree)
  action.dispose()
  const host = await component('client-section.jsx', 'ProjectLink', { t }, { './client-shared.js': { PROJECT_URL } })
  try {
    const calls = []
    host.window.open = (...args) => calls.push(args)
    host.tree.props.onClick()
    assert.deepEqual(calls, [[PROJECT_URL, '_blank', 'noopener,noreferrer']])
  } finally { host.dispose() }
})

test('account changes re-mask email and signing out requires a separate confirmation', async () => {
  const calls = []
  const account = id => ({ authenticated: true, accounts: [{ id, active: true, email: `${id}@example.test` }] })
  const h = await component('client-account.jsx', 'AccountCard', {
    account: account('first'), t: key => key, setAccount() {}, onSignedOut() {},
    rpc: { async call(_channel, endpoint) { calls.push(endpoint); return { authenticated: false } } },
  }, {
    './client-shared.js': { maskEmail, notifyQuickQuota() {} },
    './client-account-quota.jsx': { useAccountQuotas: () => ({ entries: {} }) },
  })
  const email = () => {
    const item = nodes(h.tree, node => node.props.candidate?.email)[0]
    return item.type(item.props)
  }
  const click = label => { nodes(h.tree, node => node.props.children === label)[0].props.onClick(); h.render() }
  try {
    assert.notEqual(email().props.children, 'first@example.test')
    email().props.onClick(); h.render()
    assert.equal(email().props.children, 'first@example.test')
    h.render({ account: account('second') })
    assert.notEqual(email().props.children, 'second@example.test')
    click('logout'); assert.deepEqual(calls, [])
    click('removeCancel'); assert.deepEqual(calls, [])
    click('logout'); click('signOutConfirm')
    await flush(); h.render()
    assert.deepEqual(calls, ['logout'])
  } finally { h.dispose() }
})

test('quota reset cancellation sends no consume request and acceptance requires acknowledgement', async () => {
  const calls = []; let consumed = 0
  const h = await component('client-usage.jsx', 'ResetCreditControl', {
    credit: { ref: 'credit-ref' }, hasExhaustedQuota: true, onConsumed() { consumed++ }, t: key => key,
    rpc: { async call(_channel, endpoint) { calls.push(endpoint); return { ok: true, value: endpoint === 'reset-credit/prepare' ? { challengeId: 'challenge', readyAt: 0 } : { code: 'reset' } } } },
  }, { './client-shared.js': { unwrap, fill: value => value } })
  const button = label => nodes(h.tree, node => node.props.children === label)[0]
  try {
    button('resetUse').props.onClick(); await flush(); h.render()
    assert.equal(button('resetFinal').props.disabled, true)
    button('cancel').props.onClick(); h.render()
    assert.deepEqual(calls, ['reset-credit/prepare'])
    button('resetUse').props.onClick(); await flush(); h.render()
    nodes(h.tree, node => node.type === 'input' && node.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } }); h.render()
    assert.equal(button('resetFinal').props.disabled, false)
    button('resetFinal').props.onClick(); await flush(); h.render()
    assert.deepEqual(calls, ['reset-credit/prepare','reset-credit/prepare','reset-credit/consume'])
    assert.equal(consumed, 1)
  } finally { h.dispose() }
})

test('refreshing the reset cards leaves the current card mounted until its replacement arrives', async () => {
  const next = deferred()
  const credit = { ref: 'stable-card', name: 'Full reset' }
  let inspections = 0
  const h = await component('client-usage.jsx', 'ResetCreditList', {
    count: 1, refreshKey: 'first', t: key => key,
    rpc: { async call() {
      inspections++
      return inspections === 1 ? { ok: true, value: { credits: [credit] } } : next.promise
    } },
  }, { './client-shared.js': { unwrap } })
  const visibleRefs = () => nodes(h.tree, node => node.props.credit).map(node => node.key)
  try {
    await flush(); h.render()
    assert.deepEqual(visibleRefs(), [credit.ref])
    h.render({ refreshKey: 'next' })
    assert.deepEqual(visibleRefs(), [credit.ref])
    next.resolve({ ok: true, value: { credits: [credit] } })
    await flush(); h.render()
    assert.deepEqual(visibleRefs(), [credit.ref])
  } finally { h.dispose() }
})

test('zero-quota polling does not reload reset cards, but an explicit refresh still does', async () => {
  let quota = { usage: { fetchedAt: Date.now(), rateLimits: [{ id: 'codex', windows: [{ usedPercent: 100, remainingPercent: 0, windowSeconds: 18000 }] }], resetCredits: { availableCount: 1 } } }
  const refreshes = []
  const h = await component('client-usage.jsx', 'UsageCard', {
    rpc: {}, t: key => key, signedIn: true, resetKey: 0, preference: {},
  }, { './client-quota.jsx': { useQuotaUsage: () => ({ ...quota, refresh: async force => refreshes.push(force) }) } })
  const cards = () => nodes(h.tree, node => node.props.hasExhaustedQuota === true && node.props.count === 1)[0]
  try {
    const initial = cards().props.refreshKey
    for (let n = 0; n < 3; n++) {
      quota = { usage: { ...quota.usage, fetchedAt: quota.usage.fetchedAt + 5000 } }
      h.render()
      assert.equal(cards().props.refreshKey, initial)
    }
    nodes(h.tree, node => node.props.className === 'codexSubscriptionRefresh')[0].props.onClick()
    h.render()
    assert.notEqual(cards().props.refreshKey, initial)
    assert.deepEqual(refreshes, [true])
  } finally { h.dispose() }
})

test('catalog timeouts explain the failure while retaining an available directory', async () => {
  for (const source of ['unavailable', 'cached', 'online']) {
    const h = await component('client-preferences.jsx', 'ModelCatalogStatus', { t: key => key, preference: {} }, {
      './client-shared.js': { usePreferenceSnapshot: () => ({ modelError: 'timeout', catalogStatus: { source, refresh: 'failed' } }) },
    })
    try { assert.ok(nodes(h.tree, node => node.props.children === (source === 'unavailable' ? 'catalogTimeout' : 'catalogCachedTimeout')).length) }
    finally { h.dispose() }
  }
})

test('both settings entries keep independent HTML radio groups and the same selected preference', async () => {
  const additions = {
    './settings-contract.js': settingsContract,
    './client-shared.js': { usePreferenceSnapshot: () => ({ status: 'ready', writable: true, quickQuotaMode: settingsContract.QUICK_QUOTA_MODE_FORECAST }) },
  }
  const props = { preference: {}, t: key => key }
  const first = await component('client-preferences.jsx', 'QuickQuotaPreference', props, additions)
  const second = await component('client-preferences.jsx', 'QuickQuotaPreference', props, additions)
  const radios = host => nodes(host.tree, node => node.type === 'input' && node.props.type === 'radio')
  try {
    const firstName = radios(first)[0].props.name
    const secondName = radios(second)[0].props.name
    assert.notEqual(firstName, secondName)
    for (const host of [first, second]) {
      assert.equal(new Set(radios(host).map(node => node.props.name)).size, 1)
      assert.equal(radios(host).filter(node => node.props.checked).length, 1)
    }
    first.render(); second.render()
    assert.equal(radios(first)[0].props.name, firstName)
    assert.equal(radios(second)[0].props.name, secondName)
  } finally { first.dispose(); second.dispose() }
})

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

test('account rechecks retain the last result while pending but never report success after a failed check', async () => {
  let finish, fail = false
  const rpc = { call() { return new Promise(resolve => { finish = () => resolve({ accounts: [{ id: 'a', ...(fail ? { error: 'Could not read ChatGPT usage' } : { usage: { rateLimits: [] } }) }] }) }) } }
  const h = await component('client-account-quota.jsx', 'useAccountQuotas', { rpc, ids: ['a'], active: true },
    {}, (hook, value) => hook(value.rpc, value.ids, value.active))
  try {
    finish(); await flush(); h.render()
    assert.ok(h.tree.entries.a.usage)
    const refreshing = h.tree.refresh(); h.render()
    assert.ok(h.tree.entries.a.usage, 'refresh does not erase the previous reading')
    assert.equal(h.tree.busy, true)
    fail = true; finish(); await refreshing; h.render()
    assert.equal(h.tree.entries.a.usage, undefined)
    assert.equal(h.tree.entries.a.error, 'Could not read ChatGPT usage')
    assert.equal(h.tree.busy, false)
    const retry = h.tree.refresh(); h.render()
    assert.equal(h.tree.entries.a.error, 'Could not read ChatGPT usage', 'retry retains unknown instead of showing initial verification again')
    fail = false; finish(); await retry; h.render()
    assert.ok(h.tree.entries.a.usage)
    assert.equal(h.tree.entries.a.error, undefined)
  } finally { h.dispose() }
})

test('opening settings verifies a single saved account and displays the server result', async () => {
  const calls = []
  let entry = { id: 'a', error: SIGN_IN_RENEW }
  const rpc = { async call(_channel, endpoint, payload) {
    calls.push([endpoint, payload.force])
    return { accounts: [entry] }
  } }
  const h = await component('client-account-quota.jsx', 'useAccountQuotas', { rpc, ids: ['a'], active: false },
    {}, (hook, value) => hook(value.rpc, value.ids, value.active))
  const badge = await component('client-account-quota.jsx', 'AccountQuota', { showQuota: false, t: key => key },
    { './http-failure.js': { SIGN_IN_RENEW }, './client-shared.js': { accessFailureText: message => message } })
  const state = () => nodes(badge.tree, item => item.props['data-state'])[0].props['data-state']
  try {
    assert.deepEqual(calls, [])
    h.render({ active: true })
    badge.render({ entry: h.tree.entries.a, loading: h.tree.busy })
    assert.equal(state(), 'loading')
    await flush(); h.render()
    assert.deepEqual(calls, [['usage/accounts', true]])
    badge.render({ entry: h.tree.entries.a, loading: h.tree.busy })
    assert.equal(state(), 'disconnected')
    h.render({ active: false })
    entry = { id: 'a', usage: { rateLimits: [] } }
    h.render({ active: true }); await flush(); h.render()
    badge.render({ entry: h.tree.entries.a, loading: h.tree.busy })
    assert.equal(state(), 'connected')
    badge.render({ entry: { id: 'a', error: 'Could not read ChatGPT usage' } })
    assert.equal(state(), 'unknown')
  } finally { h.dispose(); badge.dispose() }
})

test('the expired account action starts browser renewal directly and keeps the device fallback on the same account', async () => {
  const calls = []
  const h = await component('client-account.jsx', 'AccountCard', {
    account: { authenticated: true, accounts: [{ id: 'expired', active: true }] },
    t: key => key, setAccount() {}, onSignedOut() {},
    rpc: { async call(_channel, endpoint, payload) {
      calls.push({ endpoint, ...payload })
      return { id: 'flow', phase: payload.method === 'browser' ? 'waiting_browser' : 'waiting_device' }
    } },
  }, {
    './http-failure.js': { SIGN_IN_RENEW },
    './client-account-quota.jsx': { useAccountQuotas: () => ({ entries: { expired: { error: SIGN_IN_RENEW } } }) },
  })
  const click = key => { nodes(h.tree, node => node.props.children === key)[0].props.onClick(); h.render() }
  try {
    click('renewAccount')
    await flush(); h.render()
    assert.deepEqual(calls, [{ endpoint: 'login/start', method: 'browser', openExternal: true, renewId: 'expired' }])
    click('deviceLogin')
    await flush(); h.render()
    assert.deepEqual(calls.at(-1), { endpoint: 'login/start', method: 'device_code', openExternal: true, renewId: 'expired' })
  } finally { h.dispose() }
})
