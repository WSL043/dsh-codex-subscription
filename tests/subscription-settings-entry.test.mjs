import test from 'node:test'
import assert from 'node:assert/strict'
import { subscriptionSettingsOpener } from '../src/subscription-settings-entry.js'
import { registerClient } from './helpers/client-registration.mjs'

test('the complete client registers native slots on desktop and scoped hosts without duplicating host slots', async () => {
  for (const remote of [false, true]) {
    const host = registerClient(remote)
    const find = name => host.entries.find(entry => entry.options.name === name)
    const quota = find('conversation.input.right')
    assert.equal(quota.scope, 'root', 'quota and voice remain available before a session scope mounts')
    assert.equal(quota.options.inject('session-a').directory, remote ? host.stores.scoped : host.stores.root)
    assert.equal(find('conversation.input.model'), undefined, 'the native picker must retain its label contributions')
    const settings = find('settings.section')
    const oldSettings = settings.options.inject()
    const icon = find('settings.section.icon')
    assert.equal(icon.options.id, settings.options.id)
    const svg = icon.component({ size: 16 })
    assert.equal(svg.type, 'svg')
    assert.equal(svg.props.width, 16)
    assert.equal(svg.props.stroke, 'currentColor')
    const pluginEntry = find('plugins.bundle.config')
    assert.equal(pluginEntry.options.key, 'dsh-codex-subscription')
    const pluginSettings = pluginEntry.options.inject()
    for (const key of ['preference','rpc','accountStatus','diagnostics','defaultModel','t']) assert.equal(pluginSettings[key], oldSettings[key], key)
    assert.equal(pluginSettings.embedded, true)
    assert.equal(pluginSettings.rpc, quota.options.inject('session-a').rpc)
    const image = { id: 'original' }
    assert.equal(await find('conversation.chat.node').options.inject('session-a').loadImage(image), 'blob:native-image')
    assert.deepEqual(host.images, [{ sessionId: 'session-a', image }])
  }
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

test('an image extension at the same slot priority cannot block the client entry', async () => {
  const name = 'conversation.chat.message.images'
  const host = registerClient(false, { occupiedSlot: name, imageSettings: { imageViewer: true, imageEditing: true } })
  assert.equal(host.registry.entriesOfSlot(name)[0].component, host.otherRenderer)
  assert.throws(() => host.registry.register({ name, priority: -10 }, () => null), /already has a registration/u)
  assert.ok(host.entries.some(entry => entry.options.name === 'settings.section'))
  host.releaseOther()
  await Promise.resolve()
  assert.equal(host.registry.entriesOfSlot(name).length, 1)
  assert.notEqual(host.registry.entriesOfSlot(name)[0].component, host.otherRenderer)
})

test('hosts without plugin navigation do not advertise a broken shortcut', () => {
  for (const navigation of [undefined, {}, { openBundle: false }]) assert.equal(subscriptionSettingsOpener({ get: () => navigation }), undefined)
})
