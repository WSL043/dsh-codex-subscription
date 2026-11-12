import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import * as settingsContract from '../src/settings-contract.js'
import { registerLegacyModelPicker, watchComposerModelPickerConflict } from '../src/client-model-picker-slot.js'
import { createPreferenceController } from '../src/preference-controller.js'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'
import { PROJECT_URL, maskEmail, unwrap, usageFailureText, validDate } from '../src/client-shared.js'
import { quotaReadingIsStale } from '../src/quota-forecast-view.js'
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
async function component(file, name, props, additions = {}, invoke = (fn, value) => fn(value), globals = {}) {
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
    useMemo: factory => factory(), useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useEffect: effect, useLayoutEffect: effect, useId: () => fixtureId }
  const shared = { useAccountStatusSnapshot: () => ({ status: 'ready', account: { authenticated: true } }),
    usePreferenceSnapshot: () => ({}), uiLocale: () => 'en-US', fill: value => value, percent: String, windowLabel: String, validDate }
  const dependencies = { react: hooks, 'react/jsx-runtime': { jsx: element, jsxs: element },
    './client-shared.js': shared, './rpc-contract.js': { CHANNEL: 'fixture' },
    './client-recovery.js': { recoveryCall: (rpc, endpoint, payload) => rpc.call('fixture', endpoint, payload) },
    ...additions }
  const module = { exports: {} }
  new vm.Script(await codeFor(file), { filename: file }).runInNewContext({
    module, exports: module.exports, console, window, document, Date, queueMicrotask,
    setTimeout: (...args) => setTimeout(...args), clearTimeout: id => clearTimeout(id),
    setInterval: (...args) => setInterval(...args), clearInterval: id => clearInterval(id),
    require: id => dependencies[id] ?? new Proxy({}, { get: (_target, key) => named(String(key)) }),
    ...globals,
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

test('auto preserves third-party pickers and restores the speed menu when they unload', async () => {
  const modelSlot = 'conversation.input.model', labelSlot = 'conversation.input.model.label'
  const core = new SlotCore()
  core.register({ name: 'root', children: { [modelSlot]: { kind: 'single', scope: 'session' } } }, named('composer'))
  const native = named('native'), legacy = named('legacy'), external = named('external'), badge = named('badge')
  core.register({ name: modelSlot, children: { [labelSlot]: { kind: 'single', scope: 'session', inline: true } } }, native)
  core.register({ name: labelSlot }, badge)
  let settings = {}
  const handler = createSubscriptionRpcHandler({ preferences: {
    status: () => ({ ...settings, writable: true }),
    update: async patch => { settings = { ...settings, ...patch } },
  } })
  const rpc = { call: (_channel, endpoint, payload) => handler(endpoint, payload, new AbortController().signal) }
  const preference = createPreferenceController(rpc)
  const winner = () => core.entriesOfSlot(modelSlot)[0].component
  const dispose = registerLegacyModelPicker({
    inject: (_key, install) => install(),
    entries: key => core.entries(key),
    subscribe: (key, callback) => core.subscribe(key, callback),
    register: (options, component) => core.register(options, component),
  }, preference, () => ({}), legacy)
  try {
    assert.equal(winner(), native, 'startup waits for the saved picker choice')
    await preference.load()
    assert.equal(preference.getSnapshot().composerModelPicker, 'auto')
    assert.equal(winner(), legacy)
    assert.equal(preference.getSnapshot().composerModelPickerActive, true)

    const unregisterExternal = core.register({ name: modelSlot, priority: -10 }, external)
    await flush()
    assert.equal(core.entries(modelSlot).length, 2)
    assert.equal(winner(), external)
    assert.equal(preference.getSnapshot().composerModelPickerActive, false)
    await preference.set({ composerModelPicker: 'legacy' })
    assert.equal(winner(), external)
    assert.equal(settings.composerModelPicker, 'legacy')
    unregisterExternal()
    await flush()
    assert.equal(winner(), legacy)
    await preference.set({ composerModelPicker: 'auto' })
    preference.setComposerModelPickerConflict(true)
    assert.equal(winner(), native, 'Claude Style can claim the visual seat without a slot entry')
    preference.setComposerModelPickerConflict(false)
    assert.equal(winner(), legacy)
    assert.equal(core.entriesOfSlot(labelSlot)[0].component, badge)
    await preference.load()
    assert.equal(winner(), legacy)
    await preference.set({ composerModelPicker: 'dsh' })
    assert.equal(winner(), native)
    assert.equal(core.entriesOfSlot(labelSlot)[0].component, badge)
  } finally { dispose(); preference.dispose() }
})

test('the subscription extends the rc.2 model menu without shadowing Team or a third-party picker', () => {
  const menu = 'conversation.input.model', options = menu + '.options'
  const core = new SlotCore()
  const native = named('native'), legacy = named('legacy'), extra = named('extra'), team = named('team'), external = named('external')
  core.register({ name: 'root', children: { [menu]: { kind: 'single', scope: 'session' } } }, named('composer'))
  core.register({ name: menu, children: {
    [menu + '.label']: { kind: 'single', scope: 'session', inline: true },
    [options]: { kind: 'list', scope: 'session' },
  } }, native)
  core.register({ name: options, id: 'agent-team' }, team)
  let state = { status: 'ready', composerModelPicker: 'auto' }, active, sync
  const preference = { getSnapshot: () => state, subscribe: fn => { sync = fn; return () => {} }, setComposerModelPickerActive: value => { active = value } }
  const dispose = registerLegacyModelPicker({
    inject: (_key, install) => install(),
    entries: key => core.entries(key),
    subscribe: (key, callback) => core.subscribe(key, callback),
    register: (config, component) => core.register(config, component),
  }, preference, () => ({}), legacy, extra)
  try {
    assert.equal(core.entriesOfSlot(menu)[0].component, native)
    assert.deepEqual(core.entriesOfSlot(options).map(entry => entry.component), [team, extra])
    assert.equal(active, true)
    const unregister = core.register({ name: menu, priority: -10 }, external)
    sync()
    assert.equal(core.entriesOfSlot(menu)[0].component, external)
    assert.deepEqual(core.entriesOfSlot(options).map(entry => entry.component), [team])
    unregister()
    state = { ...state, composerModelPicker: 'dsh' }
    sync()
    assert.equal(active, false)
    assert.deepEqual(core.entriesOfSlot(options).map(entry => entry.component), [team])
    state = { ...state, composerModelPicker: 'legacy' }
    sync()
    assert.equal(core.entriesOfSlot(menu)[0].component, native)
    assert.deepEqual(core.entriesOfSlot(options).map(entry => entry.component), [team, extra])
  } finally { dispose() }
})

test('the classic picker toggles supported speed inside the model menu and shows its bolt', async () => {
  const snapshot = { status: 'ready', writable: true, disabledModels: [], fastModels: ['gpt-6.1-sol'], ultrafastModels: [], verbosityModels: [], speedMode: 'standard', composerSpeedBadge: 'off' }
  const pref = { set: async patch => { Object.assign(snapshot, patch) } }
  const models = [{ id: 'gpt-6.1-sol', name: 'GPT-6.1-Sol' }]
  const state = { status: 'ready', groups: [{ id: 'openai-codex', models }], current: { provider: 'openai-codex', model: models[0].id }, failures: [], error: null }
  const props = { available: true, directory: { subscribe: () => () => {}, getSnapshot: () => state }, preference: pref, t: key => key, load() {} }
  const h = await component('client-model-select.jsx', 'CodexModelSelect', props, { './settings-contract.js': settingsContract, './client-shared.js': { usePreferenceSnapshot: () => snapshot } })
  const find = (className, label) => nodes(h.tree, node => node.props.className === className && (!label || nodes(node, item => item.props.children === label).length))[0]
  const trigger = () => find('codexModelSelectTrigger')
  const bolt = () => find('codexModelSelectBolt')
  const openSpeed = () => { trigger().props.onClick(); h.render(); find('codexModelSelectCell', 'speedTitle').props.onClick(); h.render() }
  try {
    assert.equal(bolt(), undefined)
    openSpeed()
    find('codexModelSelectOption', 'speedFast').props.onClick(); h.render()
    assert.equal(snapshot.speedMode, 'fast')
    assert.match(trigger().props['aria-label'], /speedFast/u)
    assert.ok(bolt())
    openSpeed()
    find('codexModelSelectOption', 'speedStandard').props.onClick(); h.render()
    assert.equal(snapshot.speedMode, 'standard')
    assert.equal(bolt(), undefined)
    snapshot.ultrafastModels = [models[0].id]
    openSpeed()
    find('codexModelSelectOption', 'speedUltrafast').props.onClick(); h.render()
    assert.equal(snapshot.speedMode, 'ultrafast')
    assert.ok(bolt())
    assert.match(trigger().props['aria-label'], /speedUltrafast/u)
    state.current = { provider: 'deepseek', model: 'v4' }
    h.render()
    assert.equal(bolt(), undefined)
    trigger().props.onClick(); h.render()
    assert.equal(find('codexModelSelectCell', 'speedTitle'), undefined)
  } finally { h.dispose() }
})

test('the host inventory tracks Claude Style enablement and ignores stale responses', async () => {
  const old = deferred()
  let rows = old.promise, refresh
  const updates = []
  const unwatch = watchComposerModelPickerConflict({ listPlugins: async () => ({ ok: true, value: await rows }) }, {
    $on(event, listener) { assert.equal(event, 'plugin-manager/changed'); refresh = listener; return () => { refresh = undefined } },
  }, value => updates.push(value))
  try {
    assert.deepEqual(updates, [true], 'wait for the initial inventory before claiming the seat')
    rows = [{ moduleName: 'dsh-claude-style', enabled: false }]
    await refresh()
    old.resolve([{ moduleName: 'dsh-claude-style', enabled: true }])
    await flush()
    assert.deepEqual(updates, [true, false])
    rows = [{ moduleName: 'dsh-claude-style', enabled: true }]
    await refresh()
    assert.deepEqual(updates, [true, false, true])
  } finally { unwatch() }
  assert.equal(refresh, undefined)
})

test('yielding the model menu hides its speed controls and preserves the saved speed', async () => {
  const snapshot = { status: 'ready', writable: true, composerModelPicker: 'auto', composerModelPickerActive: true, speedMode: 'fast', ultrafastModels: [] }
  const preference = { set: async patch => { Object.assign(snapshot, patch) } }
  const h = await component('client-pages.jsx', 'ModelsPage', { preference, t: key => key }, {
    './client-shared.js': { usePreferenceSnapshot: () => snapshot },
    './settings-contract.js': settingsContract,
  })
  const control = () => nodes(h.tree, node => node.props.field === 'composerModelPicker')[0]
  const speed = () => {
    const group = nodes(h.tree, node => node.props.role === 'group' && node.props['aria-label'] === 'legacyModelPicker')[0]
    const row = nodes(group, node => node.props.snapshot === snapshot && node.props.field === undefined)[0]
    return row && nodes(row.type(row.props), node => node.props.field === 'speedMode')[0]
  }
  try {
    assert.equal(speed().props.snapshot.speedMode, 'fast')
    assert.deepEqual([...control().props.values], ['auto', 'dsh', 'legacy'])
    snapshot.composerModelPickerActive = false
    h.render()
    assert.equal(speed(), undefined)
    assert.equal(snapshot.speedMode, 'fast')
    snapshot.composerModelPickerActive = true
    h.render()
    assert.equal(speed().props.snapshot.speedMode, 'fast')
  } finally { h.dispose() }
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

test('quota marks an old reading outside forecast mode and distinguishes refresh failures from sign-in expiry', async () => {
  const now = Date.now()
  const reading = { fetchedAt: now - 1000, rateLimits: [{ id: 'codex', windows: [{ remainingPercent: 77, windowSeconds: 604800, resetsAt: now / 1000 + 60 }] }] }
  let snapshot = { now, usage: reading }
  const h = await component('client-usage.jsx', 'UsageCard', {
    rpc: {}, t: key => key, signedIn: true, resetKey: 0, preference: {},
  }, {
    './client-quota.jsx': { useQuotaUsage: () => snapshot },
    './quota-forecast-view.js': { quotaReadingIsStale },
    './client-shared.js': { usePreferenceSnapshot: () => ({ quickQuotaMode: 'off' }), uiLocale: () => 'en-US', validDate, fill: value => value, percent: String, windowLabel: String, usageFailureText },
  })
  const label = () => nodes(h.tree, node => node.type === 'time' && node.props.className === 'codexSubscriptionFreshness')[0]?.props.children
  const alert = () => nodes(h.tree, node => node.props.role === 'alert')[0]?.props.children
  try {
    assert.equal(label(), 'usageUpdated')
    snapshot = { now: now + 61_000, usage: reading }; h.render()
    assert.equal(label(), 'usageLastKnown')
    assert.equal(alert(), undefined)
    snapshot = { now, usage: reading, error: 'Could not read ChatGPT usage' }; h.render()
    assert.equal(label(), 'usageLastKnown')
    assert.equal(alert(), 'usageRefreshFailed')
    snapshot = { now, usage: reading, error: SIGN_IN_RENEW }; h.render()
    assert.equal(label(), 'usageLastKnown')
    assert.equal(alert(), 'resetRenewLogin')
    snapshot = { now, error: 'Request timed out' }; h.render()
    assert.equal(label(), undefined)
    assert.equal(alert(), 'usageRefreshFailed')
    snapshot = { now, usage: reading }; h.render()
    assert.equal(label(), 'usageUpdated')
    assert.equal(alert(), undefined)
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
    preference: { load() {}, refreshModels() {} }, accountStatus: { load() {} }, t: key => key,
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

test('sticky settings backdrop uses browser-decoded colors, skips transparency and repaints on theme changes', async () => {
  // Pixel values are the browser boundary, not another CSS color parser.
  // Actual Chromium color decoding is covered by the recorded UI acceptance.
  const colors = new Map([
    ['transparent', [0, 0, 0, 0]],
    ['color(srgb 1 1 1 / 0.72)', [255, 255, 255, 184]],
    ['rgb(44, 44, 46)', [44, 44, 46, 255]],
  ])
  const outer = { background: 'rgb(44, 44, 46)', parentElement: null }
  const parent = { background: 'color(srgb 1 1 1 / 0.72)', parentElement: outer }
  const node = { style: {}, parentElement: parent }
  let paint, disconnected = false
  const context = { clearRect() {}, fillRect() {}, getImageData() { return { data: colors.get(this.fillStyle) } } }
  const h = await component('client-section.jsx', 'CodexSection', {
    preference: { load() {}, refreshModels() {} }, accountStatus: { load() {} }, t: key => key,
  }, {}, (fn, props) => {
    const tree = fn(props)
    nodes(tree, value => value.props.role === 'tablist')[0].props.ref.current = node
    return tree
  }, {
    document: { documentElement: {}, body: {}, createElement: () => ({ getContext: () => context }) },
    getComputedStyle: value => ({ backgroundColor: value.background }),
    MutationObserver: class {
      constructor(callback) { paint = callback }
      observe() {}
      disconnect() { disconnected = true }
    },
  })
  try {
    assert.equal(node.style.background, 'rgb(255, 255, 255)')
    parent.background = 'transparent'; paint()
    assert.equal(node.style.background, 'rgb(44, 44, 46)', 'transparent wrappers do not hide the host surface')
    outer.background = 'transparent'; paint()
    assert.equal(node.style.background, '', 'CSS theme fallback remains available without a painted ancestor')
  } finally { h.dispose() }
  assert.equal(disconnected, true)
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

test('the relay claiming a pairing code removes the QR and manual code and refreshes the phone list', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 })
  let claimed = false, failStatus = false, listCalls = 0, statusCalls = 0
  const rpc = { async call(_channel, endpoint, payload) {
    if (endpoint === 'remote/pair') return { ok: true, value: { pairingCode: 'fixture-qr', manualCode: 'ABCD-EFGH', expiresAt: 61000 } }
    if (endpoint === 'remote/clients') { listCalls++; return { ok: true, value: [] } }
    if (endpoint === 'remote/pair-status') {
      statusCalls++
      assert.equal(payload.pairingCode, 'fixture-qr')
      return failStatus ? { ok: false } : { ok: true, value: { claimed } }
    }
    return { ok: true, value: { status: 'connected' } }
  } }
  const h = await component('client-remote-control.jsx', 'RemoteControlCard', { rpc, snapshot: { remoteControl: 'on' }, t: key => key })
  const button = key => nodes(h.tree, node => node.props.children === key)[0]
  const codes = () => nodes(h.tree, node => node.type?.name === 'Qr' || node.props['aria-label'] === 'remoteManualCode')
  const poll = async () => { t.mock.timers.tick(5000); await flush(); h.render() }
  try {
    await flush(); h.render()
    button('remotePair').props.onClick()
    await flush(); h.render()
    assert.equal(codes().length, 2)
    await poll()
    assert.equal(codes().length, 2)
    failStatus = true
    await poll()
    assert.equal(codes().length, 2)

    failStatus = false; claimed = true
    const before = listCalls
    await poll()
    assert.equal(codes().length, 0)
    assert.ok(button('remotePair'))
    assert.equal(listCalls, before + 1)
    assert.equal(statusCalls, 3)
    await poll()
    assert.equal(statusCalls, 3)
  } finally { h.dispose() }
})

test('a started runtime installation keeps its progress and finishes across hidden tabs', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let status = { phase: 'idle', available: true, adapterInstalled: true, installable: true, componentVersion: 'fixture' }, reads = 0, loads = 0
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
