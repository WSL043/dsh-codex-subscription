import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import { PREFERENCE_FIELDS } from '../src/preference-fields.js'
import { zh, en } from '../src/client-locales.js'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'
import { testGroup } from '../scripts/test-groups.mjs'

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

async function renderPreference({ tooltip = true, locale = en } = {}) {
  const require = createRequire(import.meta.resolve('tsdown'))
  const { rolldown } = await import(pathToFileURL(require.resolve('rolldown')).href)
  const source = await readFile(new URL('../src/composer-prediction-preferences.jsx', import.meta.url), 'utf8')
  const bundle = await rolldown({ input: 'preference', transform: { jsx: { runtime: 'automatic' } }, plugins: [{
    name: 'input-prediction-preference-fixture',
    resolveId(id, importer) { return importer ? { id, external: true } : '\0preference' },
    load() { return { code: source, moduleType: 'jsx' } },
  }] })
  let code
  try { code = (await bundle.generate({ format: 'cjs' })).output[0].code }
  finally { await bundle.close() }
  let snapshot = { status: 'ready', writable: true, saving: false }
  const Switch = () => null, Tooltip = tooltip ? () => null : undefined, element = (type, props) => ({ type, props })
  const dependencies = {
    'react/jsx-runtime': { jsx: element, jsxs: element },
    './client-primitives.js': { Switch, Tooltip },
    './client-shared.js': { usePreferenceSnapshot: () => snapshot },
  }
  const module = { exports: {} }, patches = [], preference = { set: patch => patches.push(patch) }
  new vm.Script(code).runInNewContext({ module, exports: module.exports, require: id => dependencies[id] })
  const render = patch => {
    snapshot = { ...snapshot, ...patch }
    const row = module.exports.ComposerPredictionPreference({ preference, t: key => locale[key] })
    const [help, hint] = row.props.children[0].props.children
    return { row, control: row.props.children.find(child => child.type === Switch), help, hint, label: Tooltip ? help.props.children : help }
  }
  return { render, patches }
}

test('the compact prediction row uses the host switch and a keyboard-accessible host tooltip', async () => {
  const fixture = await renderPreference()
  const { row, control, help, hint, label } = fixture.render({})
  assert.equal(row.props.className, 'codexSubscriptionPreference')
  assert.equal(control.props.label, 'Input predictions')
  assert.equal(control.props.checked, false)
  assert.equal(control.props.disabled, false)
  assert.equal(hint.props.children, en.composerPredictionsShortHint)
  assert.equal(help.props.label, en.composerPredictionsHint)
  assert.equal(help.props.portal, true)
  assert.equal(help.props.openOnClick, true)
  assert.equal(help.props.maxWidth, 360)
  assert.equal(label.type, 'span')
  assert.equal(label.props.tabIndex, 0)
  assert.equal(label.props.title, undefined, 'avoid duplicate native and host tooltip bubbles')
  assert.equal(label.props.children, en.composerPredictions)
  control.props.onChange(true)
  fixture.render({ composerPredictions: 'on' }).control.props.onChange(false)
  assert.deepEqual(fixture.patches.map(patch => ({ ...patch })), [{ composerPredictions: 'on' }, { composerPredictions: 'off' }])
})

test('old hosts retain the full explanation through a focusable title and accessible description', async () => {
  const fixture = await renderPreference({ tooltip: false, locale: zh })
  const { label, hint } = fixture.render({})
  assert.equal(label.type, 'span')
  assert.equal(label.props.tabIndex, 0)
  assert.equal(label.props.title, zh.composerPredictionsHint)
  assert.equal(label.props['aria-description'], zh.composerPredictionsHint)
  assert.equal(hint.props.children, 'Tab 填入草稿')
})

test('the input prediction switch respects loading, read-only and pending-save settings states', async () => {
  const fixture = await renderPreference()
  for (const state of [{ status: 'loading', writable: true }, { status: 'ready', writable: false }, { writable: true, saving: true }]) assert.equal(fixture.render(state).control.props.disabled, true)
  assert.equal(fixture.render({ status: 'ready', writable: true, saving: false, composerPredictions: 'on' }).control.props.checked, true)
})

test('both languages explain draft-only acceptance and unconfirmed quota exemption', () => {
  assert.equal(zh.composerPredictions, '输入预测')
  assert.equal(en.composerPredictions, 'Input predictions')
  assert.equal(zh.composerPredictionsShortHint, 'Tab 填入草稿')
  assert.equal(en.composerPredictionsShortHint, 'Tab fills draft')
  assert.match(zh.composerPredictionsHint, /支持的 Codex 模型.*完成.*草稿为空/)
  assert.match(en.composerPredictionsHint, /Supported Codex models.*completed turn.*draft is empty/)
  assert.match(zh.composerPredictionsHint, /Tab.*草稿.*不会自动发送/)
  assert.match(zh.composerPredictionsHint, /额外预测请求.*尚未确认/)
  assert.match(en.composerPredictionsHint, /Tab.*draft without sending/)
  assert.match(en.composerPredictionsHint, /additional prediction requests.*unconfirmed/)
})

test('the compiled preference rendering suite belongs to the delivery group with build dependencies', () => {
  assert.equal(testGroup('tests/composer-prediction-preferences.test.mjs'), 'delivery')
})
