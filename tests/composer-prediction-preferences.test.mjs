import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import { PREFERENCE_FIELDS } from '../src/preference-fields.js'
import { zh, en } from '../src/client-locales.js'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'

test('input predictions default off and the existing settings RPC persists only explicit on/off choices', async () => {
  const rule = PREFERENCE_FIELDS.composerPredictions
  assert.equal(rule.default, 'off')
  assert.deepEqual(rule.choices, ['off', 'on'])
  let value = rule.default, writes = 0
  const handler = createSubscriptionRpcHandler({ preferences: {
    status: () => ({ composerPredictions: value, writable: true }),
    async update(patch) { writes++; value = patch.composerPredictions },
  } })
  const signal = new AbortController().signal
  for (const selected of ['on', 'off']) {
    assert.equal((await handler('preferences/update', { composerPredictions: selected }, signal)).ok, true)
    assert.equal((await handler('preferences/status', {}, signal)).value.composerPredictions, selected)
  }
  for (const invalid of [true, false, 'auto', null]) assert.equal((await handler('preferences/update', { composerPredictions: invalid }, signal)).ok, false)
  assert.equal(writes, 2)
  assert.equal(value, 'off')
})

async function renderPreference({ locale = en, componentFile = 'composer-prediction-preferences.jsx', componentName = 'ComposerPredictionPreference' } = {}) {
  const require = createRequire(import.meta.resolve('tsdown'))
  const { rolldown } = await import(pathToFileURL(require.resolve('rolldown')).href)
  const source = await readFile(new URL('../src/' + componentFile, import.meta.url), 'utf8') + "\nexport { SettingsLabel, Hint } from './client-hint.jsx'"
  const helpSource = await readFile(new URL('../src/client-hint.jsx', import.meta.url), 'utf8')
  const bundle = await rolldown({ input: 'preference', transform: { jsx: { runtime: 'automatic' } }, plugins: [{
    name: 'input-prediction-preference-fixture',
    resolveId(id, importer) { return !importer ? '\0preference' : id === './client-hint.jsx' ? '\0help' : { id, external: true } },
    load(id) { return { code: id === '\0help' ? helpSource : source, moduleType: 'jsx' } },
  }] })
  let code
  try { code = (await bundle.generate({ format: 'cjs' })).output[0].code }
  finally { await bundle.close() }
  let snapshot = { status: 'ready', writable: true, saving: false }
  const Switch = () => null, Tooltip = () => null, element = (type, props) => typeof type === 'function' && type !== Switch && type !== Tooltip ? type(props) : ({ type, props })
  const dependencies = {
    'react/jsx-runtime': { jsx: element, jsxs: element },
    './client-primitives.jsx': { Switch, Tooltip },
    './client-shared.js': { usePreferenceSnapshot: () => snapshot },
    './settings-contract.js': await import('../src/settings-contract.js'),
    './image-models.js': await import('../src/image-models.js'),
  }
  const module = { exports: {} }, patches = [], preference = { set: patch => patches.push(patch) }
  new vm.Script(code).runInNewContext({ module, exports: module.exports, require: id => dependencies[id] ?? new Proxy({}, { get: () => () => null }) })
  const render = patch => {
    snapshot = { ...snapshot, ...patch }
    const row = module.exports.ComposerPredictionPreference({ preference, t: key => locale[key] })
    const [help, hint] = row.props.children[0].props.children
    return { row, control: row.props.children.find(child => child.type === Switch), help, hint, label: help.props.children }
  }
  const renderTree = (patch, props = {}) => { snapshot = { ...snapshot, ...patch }; return module.exports[componentName]({ preference, t: key => locale[key], ...props }) }
  return { render, renderTree, patches, Switch, Tooltip, label: props => module.exports.SettingsLabel(props), hint: props => module.exports.Hint(props) }
}

test('the compact prediction row separates the switch state from keyboard-accessible help', async () => {
  const fixture = await renderPreference()
  const { row, control, help, hint, label } = fixture.render({})
  assert.equal(control.props.label, 'Input predictions')
  assert.equal(control.props.checked, false)
  assert.equal(control.props.disabled, false)
  assert.equal(hint.props.children, en.state_predictions_off)
  assert.equal(help.props.label, en.composerPredictionsHint)
  assert.match(help.props.label, /GPT-6 Astra, GPT-6\.1 Sol, GPT-6\.1 Terra/u)
  assert.equal(help.props.openOnClick, true)
  assert.equal(label.props.tabIndex, 0)
  assert.equal(label.props.title, undefined, 'avoid duplicate tooltip bubbles')
  assert.equal(label.props.children[0], en.composerPredictions)
  assert.equal(label.props.children[2].type, 'small')
  assert.equal(label.props.children[2].props.children, 'Beta')
  control.props.onChange(true)
  const enabled = fixture.render({ composerPredictions: 'on' })
  assert.equal(enabled.hint.props.children, en.state_predictions_on)
  assert.equal(enabled.help.props.label, help.props.label, 'detailed help stays independent of on/off state')
  enabled.control.props.onChange(false)
  assert.deepEqual(fixture.patches.map(patch => ({ ...patch })), [{ composerPredictions: 'on' }, { composerPredictions: 'off' }])
})

test('translated prediction help keeps the same focusable target and current state', async () => {
  const fixture = await renderPreference({ locale: zh })
  const { help, label, hint } = fixture.render({})
  assert.equal(label.props.tabIndex, 0)
  assert.equal(help.props.label, zh.composerPredictionsHint)
  assert.equal(hint.props.children, zh.state_predictions_off)
})

test('the input prediction switch respects loading, read-only and pending-save settings states', async () => {
  const fixture = await renderPreference()
  for (const state of [{ status: 'loading', writable: true }, { status: 'ready', writable: false }, { writable: true, saving: true }]) assert.equal(fixture.render(state).control.props.disabled, true)
  assert.equal(fixture.render({ status: 'ready', writable: true, saving: false, composerPredictions: 'on' }).control.props.checked, true)
})

test('shared help leaves empty labels unfocusable and preserves native disclosure semantics', async () => {
  const fixture = await renderPreference()
  const plain = fixture.label({ children: 'Title', description: '   ' })
  assert.equal(plain.type, 'span')
  assert.equal(plain.props.tabIndex, undefined)
  assert.equal(plain.props.title, undefined)
  const help = fixture.label({ children: 'Runtime management', description: 'Details', as: 'summary', className: '', openOnClick: false })
  assert.equal(help.props.openOnClick, false, 'clicking a native disclosure must keep its original action')
  assert.equal(help.props.children.type, 'summary')
  assert.equal(help.props.children.props.className, undefined, 'headings retain their original host styling')
  assert.equal(help.props.children.props.tabIndex, 0)
})

const descendants = node => {
  if (node == null || typeof node !== 'object') return []
  const children = node.props?.children
  return [node, ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap(descendants)]
}
const inlineText = (node, tooltip) => {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node !== 'object') return String(node)
  if (node.type === tooltip) return ''
  const children = node.props?.children
  return (Array.isArray(children) ? children.flat(Infinity) : [children]).map(child => inlineText(child, tooltip)).join(' ')
}

test('creative switches show current state inline while detailed help stays in the tooltip', async () => {
  const fixture = await renderPreference({ componentFile: 'client-pages.jsx', componentName: 'CreatePage', locale: zh })
  const base = { status: 'ready', writable: true, imageGeneration: true, imageEditing: true, imageShortcut: true, imageViewer: true, imageAnnotations: true, imageSketch: true, imageSketchAgent: true, imageModel: 'gpt-image-2', imageQuality: 'auto' }
  for (const [field, state, title] of [['imageGeneration','imageGeneration','imageGenerationRow'],['imageEditing','imageEditing','imageEditingRow'],['imageShortcut','imageShortcut','imageShortcutRow'],['imageViewer','imageViewer','imageViewerRow'],['imageSketch','sketchBoard','featureSketchTitle'],['imageSketchAgent','sketchAgent','sketchAgentRow']]) {
    for (const enabled of [true, false]) {
      const tree = fixture.renderTree({ ...base, [field]: enabled, ...(field === 'imageViewer' ? { imageAnnotations: enabled } : {}) })
      const row = descendants(tree).find(node => node.type === 'div' && node.props.className === 'codexSubscriptionPreference' && descendants(node).some(child => child.type === fixture.Switch && child.props.label === zh[title]))
      assert.ok(row, title)
      const text = inlineText(row, fixture.Tooltip)
      assert.ok(text.includes(zh['state_'+state+'_'+(enabled ? 'on' : 'off')]), title+' has its actual state outside the tooltip')
      const help = descendants(row).find(node => node.type === fixture.Tooltip)
      assert.equal(help.props.label, zh[state+'RowHint'])
      assert.ok(!text.includes(zh[state+'RowHint']), 'long detailed help is not expanded inline')
    }
  }
  const imageToolsOff = fixture.renderTree({ ...base, imageGeneration: false, imageEditing: false, imageSketch: true })
  assert.ok(inlineText(imageToolsOff, fixture.Tooltip).includes(zh.featureSketchNeedsImages), 'conditional capability guidance remains visible even with a saved-on board')
  const blocked = fixture.renderTree({ ...base, imageSketch: false, imageSketchAgent: true })
  const text = inlineText(blocked, fixture.Tooltip)
  assert.ok(text.includes(zh.sketchAgentNeedsBoard))
  assert.ok(!text.includes(zh.state_sketchAgent_on), 'a stored on flag must not claim availability while blocked')
})

test('reasoning cache uses the common switch and keeps a blocked saved choice reversible', async () => {
  const fixture = await renderPreference({ componentFile: 'client-preferences.jsx', componentName: 'ReasoningCachePreference' })
  const base = { status: 'ready', writable: true, saving: false, compactionMode: 'dsh', retryPolicy: 'normal', reasoningCache: 'on' }
  let tree = fixture.renderTree(base), control = descendants(tree).find(node => node.type === fixture.Switch)
  assert.equal(control.props.checked, true)
  assert.equal(control.props.disabled, false)
  assert.ok(inlineText(tree, fixture.Tooltip).includes(en.state_reasoningCache_on))
  control.props.onChange(false)
  assert.deepEqual({ ...fixture.patches.at(-1) }, { reasoningCache: 'off' })
  tree = fixture.renderTree({ ...base, reasoningCache: 'off' })
  assert.ok(inlineText(tree, fixture.Tooltip).includes(en.state_reasoningCache_off))
  tree = fixture.renderTree({ ...base, compactionMode: 'cloud' })
  control = descendants(tree).find(node => node.type === fixture.Switch)
  assert.equal(control.props.checked, true)
  assert.equal(control.props.disabled, false, 'the user can turn off a saved on choice even while blocked')
  assert.ok(inlineText(tree, fixture.Tooltip).includes(en.reasoningCacheCloud))
  assert.ok(!inlineText(tree, fixture.Tooltip).includes(en.state_reasoningCache_on))
  tree = fixture.renderTree({ reasoningCache: 'off' })
  assert.equal(descendants(tree).find(node => node.type === fixture.Switch).props.disabled, true)
  tree = fixture.renderTree({ ...base, status: 'loading' })
  assert.ok(!inlineText(tree, fixture.Tooltip).includes(en.state_reasoningCache_on), 'loading does not invent a current state')
})

test('cloud compaction uses the same switch while preserving native dsh/cloud settings', async () => {
  const fixture = await renderPreference({ componentFile: 'client-preferences.jsx', componentName: 'CompactionPreference' })
  const base = { status: 'ready', writable: true, saving: false, compactionMode: 'dsh' }
  for (const enabled of [false, true]) {
    const tree = fixture.renderTree({ ...base, compactionMode: enabled ? 'cloud' : 'dsh' })
    const control = descendants(tree).find(node => node.type === fixture.Switch)
    assert.equal(control.props.checked, enabled)
    assert.ok(inlineText(tree, fixture.Tooltip).includes(en['state_compaction_'+(enabled?'on':'off')]))
    control.props.onChange(!enabled)
    assert.deepEqual({ ...fixture.patches.at(-1) }, { compactionMode: enabled ? 'dsh' : 'cloud' })
  }
})
