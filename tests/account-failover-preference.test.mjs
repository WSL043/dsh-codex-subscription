import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'

import { en, zh } from '../src/client-locales.js'
import { ACCOUNT_FAILOVER_FIELD } from '../src/settings-contract.js'

// The switch lives in the same settings rows as the quota-retry switch, so it is
// rendered through the same host primitives the real settings page uses.
async function renderFailover({ locale = en } = {}) {
  const require = createRequire(import.meta.resolve('tsdown'))
  const { rolldown } = await import(pathToFileURL(require.resolve('rolldown')).href)
  const source = await readFile(new URL('../src/client-preferences.jsx', import.meta.url), 'utf8')
  const bundle = await rolldown({ input: 'preference', transform: { jsx: { runtime: 'automatic' } }, plugins: [{
    name: 'account-failover-preference-fixture',
    resolveId(id, importer) { return !importer ? '\0preference' : { id, external: true } },
    load(id) { return { code: source, moduleType: 'jsx' } },
  }] })
  let code
  try { code = (await bundle.generate({ format: 'cjs' })).output[0].code }
  finally { await bundle.close() }
  let snapshot = { status: 'ready', writable: true, saving: false, accountFailover: true }
  const Switch = () => null
  const element = (type, props) => typeof type === 'function' && type !== Switch ? type(props) : ({ type, props })
  const dependencies = {
    'react/jsx-runtime': { jsx: element, jsxs: element },
    './client-primitives.jsx': { Button: () => null, Switch, Input: () => null, Menu: () => null },
    './client-hint.jsx': {
      Hint: props => ({ type: 'Hint', props }),
      SettingsLabel: props => ({ type: 'SettingsLabel', props }),
    },
    './client-shared.js': { usePreferenceSnapshot: () => snapshot, fill: value => value },
    './settings-contract.js': await import('../src/settings-contract.js'),
    './capability-preferences.jsx': { CapabilityPreferences: () => null },
    './default-model-preferences.jsx': { DefaultModelPreference: () => null },
    './client-runtime-management.jsx': { RuntimeManagement: () => null },
    './client-remote-control.jsx': { RemoteControlCard: () => null },
    './client-voice-call.jsx': { VoiceCallCard: () => null },
    './image-models.js': await import('../src/image-models.js'),
    './context-draft-state.js': { reconcileContextDrafts: value => value },
    './picker-draft.js': { draftStep: () => undefined, toggleModelId: () => undefined },
  }
  const module = { exports: {} }, patches = [], preference = { set: patch => patches.push(patch) }
  new vm.Script(code).runInNewContext({ module, exports: module.exports, require: id => dependencies[id] ?? new Proxy({}, { get: () => () => null }) })
  const render = (patch = {}) => {
    snapshot = { ...snapshot, ...patch }
    return module.exports.AccountFailoverPreference({ preference, t: key => locale[key] })
  }
  return { render, patches, Switch }
}

test('the account-failover row is a host switch that writes the accountFailover field', async () => {
  const fixture = await renderFailover()
  const row = fixture.render()
  const [copy, control] = row.props.children
  assert.equal(control.type, fixture.Switch)
  assert.equal(control.props.checked, true, 'saved enabled preference')
  assert.equal(control.props.disabled, false)
  assert.match(copy.props.children[0].props.description, /two or more ChatGPT accounts/u)
  // Turning it off must write the documented field, not a local flag.
  control.props.onChange(false)
  // The bundle runs in its own realm, so compare the payload structurally.
  assert.equal(JSON.stringify(fixture.patches), JSON.stringify([{ [ACCOUNT_FAILOVER_FIELD]: false }]))
})

test('the row reports the single-account case and stays read-only when settings cannot be written', async () => {
  const fixture = await renderFailover()
  const off = fixture.render({ accountFailover: false })
  assert.equal(off.props.children[1].props.checked, false)
  assert.equal(off.props.children[0].props.children[1].props.children, en.state_accountFailover_off)
  assert.equal(fixture.render({ accountFailover: true }).props.children[0].props.children[1].props.children, en.state_accountFailover_on)
  assert.equal(fixture.render({ writable: false }).props.children[1].props.disabled, true)
  assert.equal(fixture.render({ status: 'loading' }).props.children[0].props.children[1], null, 'no state hint before the settings load')
})

test('both locales describe the switch without promising uninterrupted service', async () => {
  for (const [locale, words, expectation] of [
    ['zh', zh, /两个以上 ChatGPT 账号/u],
    ['en', en, /two or more ChatGPT accounts/u],
  ]) {
    const fixture = await renderFailover({ locale: words })
    const row = fixture.render()
    assert.match(row.props.children[0].props.children[0].props.description, expectation, locale)
    assert.equal(row.props.children[1].props.label, words.accountFailover)
    // The hint explains the escalation rule rather than claiming there is no interruption.
    assert.doesNotMatch(words.accountFailoverHint, /无缝|不中断|guaranteed|seamless/iu)
    assert.match(words[`state_accountFailover_${'on'}`], /./u)
    assert.match(words[`state_accountFailover_${'off'}`], /./u)
  }
})
