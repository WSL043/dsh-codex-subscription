import test from 'node:test'
import assert from 'node:assert/strict'
import { createClientHealth, inspectElement, inspectSlot, quotaHealth, diagnosticFindings } from '../src/client-health.js'

function element() {
  const node = { isConnected: true, parentElement: null,
    getBoundingClientRect: () => ({ left: 20, top: 20, right: 60, bottom: 40, width: 40, height: 20 }),
    contains: target => target === node,
  }
  node.ownerDocument = { defaultView: { innerWidth: 800, innerHeight: 600,
    getComputedStyle: target => target.style ?? { display: 'block', visibility: 'visible', opacity: '1' },
  }, elementFromPoint: () => node }
  return node
}

test('findings require evidence rather than treating untested features as healthy or broken', () => {
  assert.deepEqual(diagnosticFindings({}), [])
  assert.deepEqual(diagnosticFindings({ version: '1', client: { version: '2', integrations: [{ modelSelector: { state: 'shadowed' } }] }, configuration: { writable: false } }), ['version-mismatch', 'settings-readonly', 'model-shadowed'])
  assert.deepEqual(diagnosticFindings({ client: { quota: [{ presentation: 'covered-at-center' }] } }), [])
})

test('display inspection distinguishes hidden ancestors, absent layout and legitimate overlays', () => {
  const node = element()
  assert.equal(inspectElement(node), 'visible')
  node.ownerDocument.elementFromPoint = () => ({ privateText: 'do not export' })
  assert.equal(inspectElement(node), 'covered-at-center')
  node.parentElement = { style: { display: 'none' } }
  assert.equal(inspectElement(node), 'hidden')
  node.parentElement = null
  node.getBoundingClientRect = () => ({ width: 0, height: 0 })
  assert.equal(inspectElement(node), 'zero-size')
  node.isConnected = false
  assert.equal(inspectElement(node), 'missing')
})

test('disabled and inapplicable controls are not reported as broken', () => {
  const input = { preferencesReady: true, enabled: true, subscriptionModel: true, request: 'ready', element: element() }
  assert.deepEqual(quotaHealth(input), { state: 'ready', presentation: 'visible' })
  assert.deepEqual(quotaHealth({ ...input, enabled: false }), { state: 'disabled' })
  assert.deepEqual(quotaHealth({ ...input, subscriptionModel: false }), { state: 'other-provider' })
  assert.deepEqual(quotaHealth({ ...input, request: 'no-matching-quota' }), { state: 'no-matching-quota' })
})

test('slot shadowing requires host election evidence; older hosts remain unknown', () => {
  const component = () => {}, own = { component }, foreign = { component: () => {} }
  const slots = { entries: () => [foreign, own], entriesOfSlot: () => [foreign] }
  assert.equal(inspectSlot(slots, 'model', component).state, 'shadowed')
  delete slots.entriesOfSlot
  assert.equal(inspectSlot(slots, 'model', component).selection, 'unknown')
  assert.equal(inspectSlot({}, 'model', component).state, 'unsupported')
})

test('unmount removes observations, inspection exceptions remain explicit, no element data exported', () => {
  const health = createClientHealth(), node = element()
  node.textContent = 'secret-account@example.com'
  const stop = health.observe(() => quotaHealth({ preferencesReady: true, enabled: true, subscriptionModel: true, request: 'ready', element: node }))
  assert.doesNotMatch(JSON.stringify(health.snapshot()), /secret|example|textContent/)
  stop()
  assert.equal(health.snapshot().quota.length, 0)
  health.observe(() => { throw Error('private') })
  assert.deepEqual(health.snapshot().quota, [{ state: 'inspection-unavailable' }])
})
