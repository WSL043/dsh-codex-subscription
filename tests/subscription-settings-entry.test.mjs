import test from 'node:test'
import assert from 'node:assert/strict'
import { registerSubscriptionSettings, subscriptionSettingsOpener } from '../src/subscription-settings-entry.js'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'

test('both settings entries share every controller and render one component with host-specific chrome', () => {
  const entries = [], surfaces = []
  const shared = { t: key => key, preference: {}, rpc: {}, accountStatus: {}, diagnostics: {}, defaultModel: {} }
  const Section = () => {}
  const ProjectAction = () => {}
  const ctx = { slots: {
    inject(name, ready) { surfaces.push(name); ready() },
    register(entry, component) { entries.push({ entry, component }) },
  } }
  registerSubscriptionSettings(ctx, shared, Section, ProjectAction)
  assert.deepEqual(surfaces, ['settings.section', 'plugins.bundle.config', 'plugins.detail.actions'])
  assert.equal(entries[0].entry.id, 'codex-subscription')
  assert.equal(entries[1].entry.key, 'dsh-codex-subscription')
  assert.equal(entries[0].entry.label(), 'nav')
  assert.equal(entries[0].component, entries[1].component)
  assert.equal(entries[0].entry.inject(), shared)
  const embedded = entries[1].entry.inject()
  for (const key of Object.keys(shared)) assert.equal(embedded[key], shared[key], key)
  assert.equal(embedded.embedded, true)
  assert.equal(shared.embedded, undefined)
  assert.equal(entries[2].component, ProjectAction)
  assert.deepEqual(entries[2].entry.inject(), { t: shared.t })
})

test('both registrations satisfy the actual DSH list/keyed slot contract', () => {
  const core = new SlotCore()
  core.register({ name: 'root', children: {
    'settings.section': { kind: 'list', scope: 'root' },
    'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
    'plugins.detail.actions': { kind: 'list', scope: 'root' },
  } }, () => null)
  const ctx = { slots: {
    inject(name, ready) { if (core.spec(name)) ready() },
    register: (entry, component) => core.register(entry, component),
  } }
  registerSubscriptionSettings(ctx, { t: key => key }, () => null, () => null)
  assert.equal(core.entries('settings.section').length, 1)
  assert.equal(core.entries('plugins.bundle.config')[0].options.key, 'dsh-codex-subscription')
  assert.equal(core.entries('plugins.detail.actions')[0].options.id, 'codex-subscription-project')
})

test('quota shortcut uses the host public navigation without touching the active session', () => {
  const opened = []
  const navigation = { openBundle(name) { assert.equal(this, navigation); opened.push(name) } }
  const ctx = { get(name) { assert.equal(name, 'pluginNavigation'); return navigation } }
  const open = subscriptionSettingsOpener(ctx)
  assert.deepEqual(opened, [])
  open()
  assert.deepEqual(opened, ['dsh-codex-subscription'])
})

test('hosts without plugin navigation do not advertise a broken shortcut', () => {
  for (const navigation of [undefined, {}, { openBundle: false }]) assert.equal(subscriptionSettingsOpener({ get: () => navigation }), undefined)
})
