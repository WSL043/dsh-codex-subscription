import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import { createClientFeature, createFeatureReadiness } from '../src/client-feature.js'
import { zh, en } from '../src/client-locales.js'

const require = createRequire(import.meta.resolve('tsdown'))
const { rolldown } = await import(pathToFileURL(require.resolve('rolldown')).href)
async function compileComponent(file) {
  const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8')
  const bundle = await rolldown({
    input: 'component', transform: { jsx: { runtime: 'automatic' } },
    plugins: [{ name: 'component-source',
      resolveId(id, importer) { return importer ? { id, external: true } : '\0component' },
      load() { return { code: source, moduleType: 'jsx' } },
    }],
  })
  try { return (await bundle.generate({ format: 'cjs' })).output[0].code }
  finally { await bundle.close() }
}
const code = await compileComponent('sketch-workspace.jsx')

const flush = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
const element = (type, props) => ({ type, props: props ?? {} })
const FeatureLoadStatus = () => null
function find(node, predicate) {
  if (Array.isArray(node)) { for (const child of node) { const value = find(child, predicate); if (value) return value } }
  else if (node && typeof node === 'object') { if (predicate(node)) return node; return find(node.props?.children, predicate) }
}
function moduleArrival() {
  let imports = 0, next = deferred()
  function Studio() {}
  const module = { SketchStudio: Studio, SKETCH_CSS: '/* synthetic */' }
  const feature = createClientFeature(() => { imports++; return next.promise })
  return { feature, module, Studio, get imports() { return imports }, arrive() { next.resolve(module) },
    fail() { next.reject(Error('synthetic chunk failure')) }, retry() { next = deferred() } }
}

// Synthetic hook host, using the actual compiled Workspace and readiness gate.
// This does not mount Canvas/IndexedDB and is not browser acceptance.
function workspace(arrival, { sessionId = 'fixture', window = {} } = {}) {
  const cells = [], pending = [], connections = [], document = { activeElement: null }
  let settings = { imageSketch: true, imageEditing: true, imageSketchAgent: true }, cursor = 0, dirty = false, tree, opener
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!cells[index]) cells[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [cells[index].value, value => {
        const next = typeof value === 'function' ? value(cells[index].value) : value
        if (!Object.is(next, cells[index].value)) { cells[index].value = next; dirty = true }
      }]
    },
    useRef(initial) { return cells[cursor++] ??= { current: initial } },
    useCallback(fn, deps) {
      const index = cursor++, old = cells[index]
      if (!old || deps.some((value, n) => !Object.is(value, old.deps[n]))) cells[index] = { fn, deps }
      return cells[index].fn
    },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot() },
    useEffect(run, deps) {
      const index = cursor++, old = cells[index]
      if (old && old.deps.length === deps.length && deps.every((value, n) => Object.is(value, old.deps[n]))) return
      cells[index] = { deps, run, cleanup: old?.cleanup }
      pending.push(() => { cells[index].cleanup?.(); cells[index].cleanup = run() })
    },
  }
  const dependencies = {
    react: hooks, 'react/jsx-runtime': { jsx: element, jsxs: element },
    './client-feature.js': { createClientFeature: () => arrival.feature, createFeatureReadiness },
    './client-feature-status.jsx': { FeatureLoadStatus },
    './sketch-agent-client.js': { connectSketchAgent(_rpc, id, execute) {
      const connection = { id, execute, active: true }; connections.push(connection)
      return () => { connection.active = false }
    } },
  }
  const exports = {}
  new vm.Script(code, { filename: 'sketch-workspace.jsx' }).runInNewContext({
    exports, module: { exports }, window, document, Error, require: id => dependencies[id],
  })
  const sessionState = { agentRun: { current: null }, marker: `state:${sessionId}` }
  const props = { sessionId, sessionState, rpc: {}, t: key => key,
    preference: { subscribe: () => () => {}, getSnapshot: () => settings },
    registerOpen(callback) { opener = callback; return () => { if (opener === callback) opener = undefined } },
  }
  const render = () => {
    let passes = 0
    do {
      assert.ok(passes++ < 20, 'workspace settled')
      cursor = 0; dirty = false; tree = exports.SketchWorkspace(props)
      while (pending.length) pending.shift()()
    } while (dirty)
    return tree
  }
  render()
  return { window, connections, sessionState, render, get tree() { return tree },
    get studio() { return find(tree, node => node.type === arrival.Studio)?.props },
    get api() { return window.dshSketchAgent },
    open(file) { opener('sketch', { focus() {} }, file); render() },
    enable(value) { settings = { ...settings, imageSketchAgent: value }; render() },
    replayEffects() {
      for (const cell of cells) if (cell?.run) cell.cleanup?.()
      for (const cell of cells) if (cell?.run) cell.cleanup = cell.run()
      render()
    },
    dispose() { for (const cell of cells) cell?.cleanup?.() },
  }
}
const observe = promise => promise.then(value => ({ value }), error => ({ error }))

test('an unopened workspace keeps the lightweight Agent bridge without importing the editor', async () => {
  const arrival = moduleArrival(), h = workspace(arrival)
  try {
    await flush(); h.render()
    assert.equal(arrival.imports, 0)
    assert.equal(h.studio, undefined)
    assert.equal(h.connections.filter(value => value.active).length, 1)
    assert.equal(typeof h.api.execute, 'function')
  } finally { h.dispose() }
})

test('the first Agent command imports the editor and waits for its restored API', async () => {
  const arrival = moduleArrival(), h = workspace(arrival); let executed = 0
  try {
    const result = observe(h.api.execute({ action: 'inspect' }))
    await flush(); h.render(); assert.equal(arrival.imports, 1); assert.equal(executed, 0)
    arrival.arrive(); await flush(); h.render()
    assert.ok(h.studio.bridgeManaged)
    assert.equal(executed, 0, 'module arrival alone cannot execute before restoration')
    h.studio.onAgentReady({ execute() { executed++; h.studio.onOpen(); return 'READY' } })
    assert.equal((await result).value, 'READY'); h.render()
    assert.equal(executed, 1); assert.equal(h.studio.open, true)
  } finally { h.dispose() }
})

test('an old command waiting for a chunk cannot cross a disable and re-enable cycle', async () => {
  const arrival = moduleArrival(), h = workspace(arrival); let executed = 0
  try {
    const result = observe(h.api.execute({ action: 'inspect' })); await flush()
    h.enable(false); h.enable(true)
    arrival.arrive(); await flush(); h.render()
    h.studio.onAgentReady({ execute() { executed++; return 'fresh' } })
    assert.match((await result).error.message, /disconnected/)
    assert.equal(executed, 0)
    assert.equal(await h.api.execute({ action: 'inspect' }), 'fresh')
    assert.equal(executed, 1)
  } finally { h.dispose() }
})

test('disabling while the editor restores rejects old readiness waits', async () => {
  const arrival = moduleArrival(), h = workspace(arrival); let executed = 0
  try {
    const result = observe(h.api.execute({ action: 'inspect' }))
    arrival.arrive(); await flush(); h.render()
    h.enable(false); h.enable(true)
    h.studio.onAgentReady({ execute() { executed++; return 'fresh' } })
    assert.match((await result).error.message, /connection ended|disconnected/)
    assert.equal(executed, 0)
  } finally { h.dispose() }
})

test('restoration failure rejects the Agent command immediately and a successful retry restores readiness', async () => {
  const arrival = moduleArrival(), h = workspace(arrival); let executed = 0
  try {
    const result = observe(h.api.execute({ action: 'inspect' }))
    arrival.arrive(); await flush(); h.render()
    assert.equal(h.studio.open, true, 'first Agent activation exposes restoration and retry controls')
    const error = Object.assign(Error('synthetic restoration blocked'), { code: 'SKETCH_STORAGE_BLOCKED' })
    h.studio.onAgentError(error)
    assert.equal((await result).error, error)
    assert.equal((await observe(h.api.execute({ action: 'inspect' }))).error, error, 'known failure does not wait for a timeout')
    h.studio.onAgentReady({ execute() { executed++; return 'RECOVERED' } })
    assert.equal(await h.api.execute({ action: 'inspect' }), 'RECOVERED')
    assert.equal(executed, 1)
    h.studio.onClose(); h.render()
    assert.equal(await h.api.execute({ action: 'preview' }), 'RECOVERED')
    h.render(); assert.equal(h.studio.open, false, 'later commands do not force a closed editor open')
  } finally { h.dispose() }
})

test('unmounting while an Agent command loads prevents later execution', async () => {
  const arrival = moduleArrival(), h = workspace(arrival); let executed = 0
  const result = observe(h.api.execute({ action: 'inspect' })); await flush()
  h.dispose(); arrival.arrive(); await flush()
  assert.match((await result).error.message, /disconnected/)
  assert.equal(executed, 0)
  assert.equal(h.connections.filter(value => value.active).length, 0)
})

test('manual opens share one import, retry a failed chunk and preserve a closed editor', async () => {
  const arrival = moduleArrival(), h = workspace(arrival)
  try {
    const file = { name: 'synthetic.png' }
    h.open(file); h.open(file); await flush(); h.render()
    assert.equal(arrival.imports, 1)
    arrival.fail(); await flush(); h.render()
    const retry = find(h.tree, node => node.type === FeatureLoadStatus && node.props.failed)
    assert.ok(retry)
    assert.equal(retry.props.compact, true)
    arrival.retry(); retry.props.onRetry(); await flush()
    assert.equal(arrival.imports, 2)
    arrival.arrive(); await flush(); h.render()
    assert.equal(h.studio.open, true); assert.equal(h.studio.incoming.file, file)
    const originalState = h.studio.sessionState
    h.studio.onClose(); h.render()
    assert.equal(h.studio.open, false); assert.equal(h.studio.sessionState, originalState)
    h.open(); await flush(); h.render()
    assert.equal(h.studio.open, true); assert.equal(arrival.imports, 2)
  } finally { h.dispose() }
})

test('StrictMode-style effect replay keeps one bridge and invalidates the old request scope', async () => {
  const arrival = moduleArrival(), h = workspace(arrival); let executed = 0
  try {
    const result = observe(h.api.execute({ action: 'inspect' })); await flush()
    h.replayEffects()
    assert.equal(h.connections.filter(value => value.active).length, 1)
    arrival.arrive(); await flush(); h.render()
    h.studio.onAgentReady({ execute() { executed++; return 'fresh' } })
    assert.match((await result).error.message, /disconnected/)
    assert.equal(executed, 0)
    assert.equal(await h.api.execute({ action: 'inspect' }), 'fresh')
  } finally { h.dispose() }
})

test('two sessions share module arrival but never each other\'s editor readiness', async () => {
  const arrival = moduleArrival(), window = {}, a = workspace(arrival, { sessionId: 'a', window }), apiA = a.api
  const b = workspace(arrival, { sessionId: 'b', window }), apiB = b.api
  try {
    const resultA = observe(apiA.execute({ action: 'inspect' })), resultB = observe(apiB.execute({ action: 'inspect' }))
    await flush(); assert.equal(arrival.imports, 1)
    arrival.arrive(); await flush(); a.render(); b.render()
    a.studio.onAgentReady({ execute: () => 'a' }); b.studio.onAgentReady({ execute: () => 'b' })
    assert.equal((await resultA).value, 'a'); assert.equal((await resultB).value, 'b')
    assert.notEqual(a.studio.sessionState, b.studio.sessionState)
    a.dispose(); assert.equal(window.dshSketchAgent, apiB)
  } finally { b.dispose(); a.dispose() }
})

test('feature failures use native button and tooltip without expanding the compact composer control', async () => {
  const nativeButton = () => null, nativeTooltip = () => null, icon = () => null
  const dependencies = { 'react/jsx-runtime': { jsx: element, jsxs: element },
    './client-primitives.js': { Button: nativeButton, Tooltip: nativeTooltip },
    '@heroicons/react/24/outline': { ArrowPathIcon: icon } }
  const exports = {}
  new vm.Script(await compileComponent('client-feature-status.jsx')).runInNewContext({
    exports, module: { exports }, require: id => dependencies[id],
  })
  for (const locale of [zh, en]) {
    let retried = 0
    const props = { failed: true, compact: true, onRetry: () => { retried++ }, t: key => locale[key] }
    const tree = exports.FeatureLoadStatus(props)
    const tooltip = find(tree, node => node.type === nativeTooltip)
    const button = find(tree, node => node.type === nativeButton)
    assert.equal(tooltip.props.label, locale.featureLoadFailed)
    assert.equal(button.props['aria-label'], locale.featureLoadFailed)
    assert.equal(button.props.variant, 'ghost'); assert.equal(button.props.size, 'sm')
    assert.equal(button.props.children, null, 'compact control exposes explanatory text only through its accessible tooltip')
    assert.equal(find(tree, node => node.type === 'button'), undefined, 'no unstyled native HTML button')
    button.props.onClick(); assert.equal(retried, 1)
    const loading = exports.FeatureLoadStatus({ ...props, failed: false })
    assert.equal(find(loading, node => node.type === nativeButton).props.disabled, true)
    const notice = exports.FeatureLoadStatus({ ...props, compact: false })
    assert.equal(find(notice, node => node.type === nativeButton).props.children, locale.featureRetry)
  }
})
