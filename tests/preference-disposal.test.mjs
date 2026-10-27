import assert from 'node:assert/strict'
import test from 'node:test'
import { createPreferenceController } from '../src/preference-controller.js'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const ready = value => ({ ok: true, value: { writable: true, ...value } })

test('disposed preferences ignore stale UI actions without RPCs or subscriber notifications', async () => {
  const calls = []
  const controller = createPreferenceController({ call: async (_channel, method) => { calls.push(method); return ready({}) } })
  let notifications = 0
  controller.subscribe(() => notifications++)
  await controller.load()
  controller.dispose()
  controller.dispose()
  const snapshot = controller.getSnapshot(), before = notifications
  const unsubscribe = controller.subscribe(() => notifications++)
  await controller.load()
  assert.equal(await controller.refreshModels(), false)
  await controller.retry()
  await controller.set({ voiceCall: 'on' })
  unsubscribe()
  assert.deepEqual(calls, ['preferences/status'])
  assert.equal(controller.getSnapshot(), snapshot)
  assert.equal(notifications, before)
})

test('disposing preferences ignores outstanding status and catalog responses', async () => {
  const status = deferred(), catalog = deferred()
  const controller = createPreferenceController({ call: (_channel, method) => method === 'preferences/status' ? status.promise : catalog.promise })
  let notifications = 0
  controller.subscribe(() => notifications++)
  const load = controller.load(), refresh = controller.refreshModels()
  const before = notifications, snapshot = controller.getSnapshot()
  controller.dispose()
  status.resolve(ready({ voiceCall: 'on' }))
  catalog.resolve(ready({ availableModels: [{ id: 'late-model' }] }))
  await Promise.all([load, refresh])
  assert.equal(controller.getSnapshot(), snapshot)
  assert.equal(notifications, before)
})

test('a disposed pending write cannot publish its failure into the released UI', async () => {
  const update = deferred()
  const controller = createPreferenceController({ call: (_channel, method) => method === 'preferences/update' ? update.promise : Promise.resolve(ready({})) })
  await controller.load()
  let notifications = 0
  controller.subscribe(() => notifications++)
  const save = controller.set({ voiceCall: 'on' })
  const before = notifications, snapshot = controller.getSnapshot()
  controller.dispose()
  update.reject(new Error('late transport failure'))
  await save
  assert.equal(controller.getSnapshot(), snapshot)
  assert.equal(notifications, before)
})

test('a subscriber disposing during publication prevents later listeners and RPC dispatch', async () => {
  for (const action of ['load', 'refreshModels', 'set']) {
    const calls = []
    const controller = createPreferenceController({ call: async (_channel, method) => { calls.push(method); return ready({}) } })
    if (action === 'set') await controller.load()
    const before = calls.length
    controller.subscribe(() => controller.dispose())
    controller.subscribe(() => assert.fail('disposed listeners must not run'))
    await controller[action]({ voiceCall: 'on' })
    assert.equal(calls.length, before)
  }
})
