import assert from 'node:assert/strict'
import test from 'node:test'
import { createSessionPreferenceController } from '../src/client-session-preferences.js'
import { createPreferenceController } from '../src/preference-controller.js'
import { createSubscriptionRpcClient } from '../src/rpc-contract.js'

const result = (speedMode, outputVerbosity, writable = true) => ({ ok: true, value: { speedMode, outputVerbosity, writable } })
const flush = () => new Promise(resolve => setImmediate(resolve))
const noop = () => {}

test('follow-default is persisted as a distinct session choice (#278)', async () => {
  const { controller, calls } = fixture()
  controller.subscribe('following', noop)
  calls[0].resolve(result('standard', 'default'))
  await flush()
  const save = controller.set('following', { speedMode: 'default' })
  assert.deepEqual(calls[1].payload, { sessionId: 'following', speedMode: 'default' })
  calls[1].resolve(result('default', 'default'))
  assert.equal(await save, true)
  assert.equal(controller.getSnapshot('following').speedMode, 'default')
  controller.dispose()
})

function fixture() {
  const calls = []
  const rpc = createSubscriptionRpcClient({
    call: (channel, endpoint, payload, signal) => new Promise(resolve => { calls.push({ channel, endpoint, payload, signal, resolve }) }),
  })
  return { controller: createSessionPreferenceController(rpc), profile: createPreferenceController(rpc), calls }
}

test('only the requested session is read, with one request for multiple composer surfaces; stale reads cannot cross navigation', async () => {
  const { controller, calls } = fixture()
  const leaveA = controller.subscribe('session-a', noop)
  const leaveLabel = controller.subscribe('session-a', () => {})
  controller.subscribe(undefined, noop)
  assert.equal(calls.length, 1)
  assert.deepEqual([calls[0].channel, calls[0].endpoint, calls[0].payload], ['/api', 'codex-subscription/preferences/status', { sessionId: 'session-a' }])
  leaveLabel()
  assert.equal(calls[0].signal.aborted, false)
  leaveA()
  assert.equal(calls[0].signal.aborted, true)

  controller.subscribe('session-b', noop)
  calls[1].resolve(result('standard', 'high'))
  await flush()
  calls[0].resolve(result('fast', 'low'))
  await flush()
  assert.equal(controller.getSnapshot('session-a').status, 'loading')
  assert.equal(controller.getSnapshot('session-b').speedMode, 'standard')
  assert.equal(controller.getSnapshot('session-b').outputVerbosity, 'high')

  controller.subscribe('session-a', noop)
  assert.deepEqual(calls[2].payload, { sessionId: 'session-a' })
  calls[2].resolve(result('fast', 'low'))
  await flush()
  assert.equal(controller.getSnapshot('session-a').speedMode, 'fast')
  controller.dispose()
})

test('navigation allows an in-flight write to finish only in its original session and leaves settings global', async () => {
  const { controller, profile, calls } = fixture()
  const leaveA = controller.subscribe('session-a', noop)
  calls[0].resolve(result('standard', 'default'))
  await flush()
  const previousA = controller.getSnapshot('session-a')
  const savingA = controller.set('session-a', { speedMode: 'fast', outputVerbosity: 'low' }, previousA)
  assert.equal(controller.getSnapshot('session-a').saving, true)
  assert.equal(await controller.set('session-a', { speedMode: 'ultrafast' }, previousA), undefined)
  assert.deepEqual([calls[1].endpoint, calls[1].payload], ['codex-subscription/preferences/update', { sessionId: 'session-a', speedMode: 'fast', outputVerbosity: 'low' }])

  leaveA()
  assert.equal(calls[1].signal.aborted, false, 'changing sessions does not discard an already submitted update')
  controller.subscribe('session-b', noop)
  calls[2].resolve(result('standard', 'default'))
  await flush()
  const readB = controller.getSnapshot('session-b')

  const loadingProfile = profile.load()
  assert.deepEqual(calls[3].payload, {})
  calls[3].resolve(result('standard', 'default'))
  await loadingProfile
  const savingProfile = profile.set({ speedMode: 'ultrafast', outputVerbosity: 'high' })
  assert.deepEqual(calls[4].payload, { speedMode: 'ultrafast', outputVerbosity: 'high' })
  calls[4].resolve(result('ultrafast', 'high'))
  assert.equal(await savingProfile, true)

  calls[1].resolve(result('fast', 'low'))
  assert.equal(await savingA, true)
  assert.equal(controller.getSnapshot('session-b'), readB)
  assert.equal(controller.getSnapshot('session-a').status, 'loading')
  assert.equal(profile.getSnapshot().speedMode, 'ultrafast')
  controller.subscribe('session-a', noop)
  assert.deepEqual(calls[5].payload, { sessionId: 'session-a' })
  calls[5].resolve(result('fast', 'low'))
  await flush()
  assert.equal(controller.getSnapshot('session-a').outputVerbosity, 'low')
  assert.equal(await controller.set('session-a', { outputVerbosity: 'medium' }, previousA), undefined, 'an old menu cannot overwrite the reloaded selection')
  assert.equal(calls.length, 6)
  controller.dispose()
  profile.dispose()
})

test('reconnection resyncs only live session reads and drops old responses; dispose cancels retained work', async () => {
  const { controller, calls } = fixture()
  let notified = 0
  const leaveA = controller.subscribe('session-a', noop)
  controller.subscribe('session-b', () => { notified += 1 })
  leaveA()
  controller.reload()
  assert.deepEqual(calls.map(call => call.payload.sessionId), ['session-a', 'session-b', 'session-b'])
  assert.equal(calls[1].signal.aborted, true)
  calls[2].resolve(result('ultrafast', 'medium', false))
  calls[1].resolve(result('fast', 'high'))
  await flush()
  assert.equal(controller.getSnapshot('session-b').speedMode, 'ultrafast')
  assert.equal(await controller.set('session-b', { outputVerbosity: 'low' }), undefined)
  controller.reload()
  controller.dispose()
  const before = notified
  assert.equal(calls[3].signal.aborted, true)
  calls[3].resolve(result('fast', 'high'))
  controller.subscribe('session-c', noop)
  await flush()
  assert.equal(notified, before)
  assert.equal(calls.length, 4)
})

test('failed, malformed and older global receipts never enable a session write', async () => {
  const { controller, calls } = fixture()
  controller.subscribe('session-a', noop)
  calls[0].resolve({ ok: true, value: { writable: true } })
  await flush()
  assert.equal(controller.getSnapshot('session-a').status, 'unavailable')
  assert.equal(await controller.set('session-a', { speedMode: 'fast' }), undefined)
  assert.equal(calls.length, 1)

  controller.reload()
  calls[1].resolve({ ok: true, value: { ...result('standard', 'default').value, availableModels: [], composerModelPicker: 'auto' } })
  await flush()
  assert.equal(controller.getSnapshot('session-a').status, 'unavailable')
  assert.equal(await controller.set('session-a', { speedMode: 'fast' }), undefined)
  assert.equal(calls.length, 2, 'a server that ignored sessionId cannot receive a composer write')

  controller.reload()
  calls[2].resolve(result('fast', 'medium'))
  await flush()
  assert.equal(await controller.set('session-a', { speedMode: 'standard', quickQuotaMode: 'off' }), undefined)
  const writing = controller.set('session-a', { outputVerbosity: 'high' })
  calls[3].resolve({ ok: false, error: { message: 'host rejected update' } })
  assert.equal(await writing, false)
  assert.equal(controller.getSnapshot('session-a').error, true)
  assert.equal(controller.getSnapshot('session-a').speedMode, 'fast')
  assert.equal(controller.getSnapshot('session-a').outputVerbosity, 'medium')
  controller.dispose()
})
