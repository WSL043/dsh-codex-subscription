import assert from 'node:assert/strict'
import test from 'node:test'
import { createPreferenceController } from '../src/preference-controller.js'
import { CONTEXT_MODE_EXTENDED, CONTEXT_MODE_FIELD, CONTEXT_MODE_STANDARD } from '../src/settings-contract.js'

function harness({ fail = false } = {}) {
  let native = {
    status: 'ready',
    writable: true,
    value: {
      contextMode: CONTEXT_MODE_STANDARD,
      searchProvider: 'auto',
      quickQuotaMode: 'off',
      speedMode: 'standard',
      outputVerbosity: 'default',
    },
  }
  const listeners = new Set()
  let settle
  const scope = {
    getSnapshot: () => native,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(field, value) {
      return new Promise((resolve, reject) => {
        settle = () => {
          if (fail) {
            reject(new Error('write failed'))
            return
          }
          native = { ...native, value: { ...native.value, [field]: value } }
          for (const listener of listeners) listener()
          resolve()
        }
      })
    },
  }
  const rpc = { call: async () => ({ ok: true, value: native.value }) }
  return { controller: createPreferenceController(scope, rpc), settle: () => settle?.() }
}

test('preference save reflects the chosen value while keeping ready surfaces mounted', async () => {
  const { controller, settle } = harness()
  const pending = controller.set({ [CONTEXT_MODE_FIELD]: CONTEXT_MODE_EXTENDED })

  assert.equal(controller.getSnapshot().status, 'ready')
  assert.equal(controller.getSnapshot().contextMode, CONTEXT_MODE_EXTENDED)
  assert.equal(controller.getSnapshot().writable, false)
  assert.equal(controller.getSnapshot().saving, true)

  settle()
  await pending
  assert.equal(controller.getSnapshot().contextMode, CONTEXT_MODE_EXTENDED)
  assert.equal(controller.getSnapshot().writable, true)
  assert.equal(controller.getSnapshot().saving, false)
})

test('failed preference save rolls back the optimistic value and keeps retry state', async () => {
  const { controller, settle } = harness({ fail: true })
  const pending = controller.set({ [CONTEXT_MODE_FIELD]: CONTEXT_MODE_EXTENDED })

  assert.equal(controller.getSnapshot().contextMode, CONTEXT_MODE_EXTENDED)
  settle()
  await pending
  assert.equal(controller.getSnapshot().contextMode, CONTEXT_MODE_STANDARD)
  assert.equal(controller.getSnapshot().status, 'ready')
  assert.equal(controller.getSnapshot().error, true)
})

test('fallback preference save adopts the Host accepted value instead of the optimistic patch', async () => {
  let state = {
    status: 'loading',
    writable: false,
    value: undefined,
  }
  const accepted = {
    contextMode: CONTEXT_MODE_STANDARD,
    searchProvider: 'auto',
    quickQuotaMode: 'off',
    speedMode: 'standard',
    outputVerbosity: 'default',
    writable: true,
  }
  const rpc = {
    call: async (_channel, method) => method === 'preferences/status'
      ? { ok: true, value: accepted }
      : { ok: true, value: accepted },
  }
  const scope = {
    getSnapshot: () => state,
    subscribe: () => () => {},
    set: async () => {},
  }
  const controller = createPreferenceController(scope, rpc)
  await controller.load()
  assert.equal(controller.getSnapshot().contextMode, CONTEXT_MODE_STANDARD)

  await controller.set({ [CONTEXT_MODE_FIELD]: CONTEXT_MODE_EXTENDED })

  assert.equal(controller.getSnapshot().contextMode, CONTEXT_MODE_STANDARD)
  assert.equal(controller.getSnapshot().writable, true)
})
