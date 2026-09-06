import assert from 'node:assert/strict'
import test from 'node:test'
import { createPreferenceController } from '../src/preference-controller.js'
import { CONTEXT_MODE_EXTENDED, CONTEXT_MODE_FIELD, CONTEXT_MODE_STANDARD } from '../src/settings-contract.js'

function harness({ fail = false, rpcCall } = {}) {
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
  const rpc = { call: rpcCall ?? (async () => ({ ok: true, value: native.value })) }
  return { controller: createPreferenceController(scope, rpc), settle: () => settle?.() }
}

const fallbackModels = [{ key: 'gpt-5.5', label: 'GPT-5.5', maximum: 1_000_000 }]
const astraModels = [...fallbackModels, { key: 'gpt-6-astra', label: 'GPT-6 Astra', maximum: 872_000 }]
const fallbackValue = {
  contextMode: CONTEXT_MODE_STANDARD,
  searchProvider: 'auto',
  quickQuotaMode: 'off',
  speedMode: 'standard',
  outputVerbosity: 'default',
  contextModels: fallbackModels,
  verbosityModels: ['gpt-5.5'],
  writable: true,
}

function deferredModelHarness() {
  const pendingModels = []
  const listeners = new Set()
  const scope = {
    getSnapshot: () => ({ status: 'loading', writable: false, value: undefined }),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set: async () => {},
  }
  const rpc = {
    call: async (_channel, method) => {
      if (method === 'preferences/status') return { ok: true, value: fallbackValue }
      if (method === 'preferences/models') {
        return new Promise((resolve, reject) => pendingModels.push({ resolve, reject }))
      }
      return { ok: true, value: fallbackValue }
    },
  }
  return { controller: createPreferenceController(scope, rpc), pendingModels, listeners }
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

test('deferred model refresh replaces the fallback directory with Astra', async () => {
  const { controller, pendingModels } = deferredModelHarness()
  await controller.load()
  assert.deepEqual(controller.getSnapshot().contextModels, fallbackModels)

  const refreshing = controller.refreshModels()
  pendingModels[0].resolve({ ok: true, value: { contextModels: astraModels, verbosityModels: ['gpt-5.5', 'gpt-6-astra'] } })
  assert.equal(await refreshing, true)
  assert.deepEqual(controller.getSnapshot().contextModels, astraModels)
  assert.deepEqual(controller.getSnapshot().verbosityModels, ['gpt-5.5', 'gpt-6-astra'])
  assert.equal(controller.getSnapshot().modelError, false)
})

test('model refresh reports failure and a later retry can recover the directory', async () => {
  const { controller, pendingModels } = deferredModelHarness()
  await controller.load()

  const failed = controller.refreshModels()
  pendingModels[0].reject(new Error('catalog unavailable'))
  assert.equal(await failed, false)
  assert.equal(controller.getSnapshot().modelError, true)

  const retried = controller.refreshModels()
  pendingModels[1].resolve({ ok: true, value: { contextModels: astraModels, verbosityModels: ['gpt-6-astra'] } })
  assert.equal(await retried, true)
  assert.equal(controller.getSnapshot().modelError, false)
  assert.deepEqual(controller.getSnapshot().contextModels, astraModels)
})

test('a no-op model refresh keeps the model arrays and emits no update', async () => {
  const { controller, pendingModels } = deferredModelHarness()
  await controller.load()
  let notifications = 0
  const unsubscribe = controller.subscribe(() => { notifications += 1 })

  const refreshing = controller.refreshModels()
  pendingModels[0].resolve({ ok: true, value: { contextModels: [...fallbackModels], verbosityModels: ['gpt-5.5'] } })
  assert.equal(await refreshing, false)
  assert.equal(notifications, 0)
  unsubscribe()
})

test('model metadata refresh does not interrupt a pending preference save', async () => {
  let resolveModels
  const { controller, settle } = harness({
    rpcCall: async (_channel, method) => method === 'preferences/models'
      ? new Promise(resolve => { resolveModels = resolve })
      : { ok: true, value: {} },
  })
  const saving = controller.set({ [CONTEXT_MODE_FIELD]: CONTEXT_MODE_EXTENDED })
  const refreshing = controller.refreshModels()
  resolveModels({ ok: true, value: { contextModels: astraModels, verbosityModels: ['gpt-6-astra'] } })
  await refreshing
  assert.equal(controller.getSnapshot().contextMode, CONTEXT_MODE_EXTENDED)
  assert.equal(controller.getSnapshot().saving, true)
  settle()
  await saving
  assert.equal(controller.getSnapshot().contextMode, CONTEXT_MODE_EXTENDED)
  assert.deepEqual(controller.getSnapshot().contextModels, astraModels)
})

test('a stale account model response cannot replace the newer directory', async () => {
  const { controller, pendingModels } = deferredModelHarness()
  await controller.load()

  const oldRefresh = controller.refreshModels()
  const newRefresh = controller.refreshModels()
  pendingModels[1].resolve({ ok: true, value: { contextModels: astraModels, verbosityModels: ['gpt-6-astra'] } })
  assert.equal(await newRefresh, true)
  pendingModels[0].resolve({ ok: true, value: { contextModels: fallbackModels, verbosityModels: ['gpt-5.5'] } })
  assert.equal(await oldRefresh, false)
  assert.deepEqual(controller.getSnapshot().contextModels, astraModels)
  assert.deepEqual(controller.getSnapshot().verbosityModels, ['gpt-6-astra'])
})
