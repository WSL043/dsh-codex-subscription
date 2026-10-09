import assert from 'node:assert/strict'
import test from 'node:test'
import { createPreferenceController } from '../src/preference-controller.js'
import { AUTO_QUOTA_RETRY_FIELD, CONTEXT_MODE_EXTENDED, CONTEXT_MODE_FIELD, CONTEXT_MODE_STANDARD, DISABLED_MODELS_FIELD } from '../src/settings-contract.js'

function harness({ fail = false, extra = () => ({}), models } = {}) {
  let value = {
    contextMode: CONTEXT_MODE_STANDARD,
    searchProvider: 'auto',
    quickQuotaMode: 'off',
    speedMode: 'standard',
    outputVerbosity: 'default',
  }
  let settle
  const status = () => ({ ok: true, value: { ...value, ...extra(), writable: true } })
  const rpc = {
    async call(_channel, method, patch) {
      if (method === 'preferences/models') return models()
      if (method !== 'preferences/update') return status()
      return new Promise((resolve, reject) => {
        settle = () => {
          if (fail) return reject(new Error('write failed'))
          value = { ...value, ...patch }
          resolve(status())
        }
      })
    },
  }
  const controller = createPreferenceController(rpc)
  return { controller, ready: () => controller.load(), settle: () => settle?.() }
}

const fallbackModels = [{ key: 'gpt-5.5', label: 'GPT-5.5', maximum: 1_000_000 }]

test('missing Codex runtime leaves ordinary preferences and the DSH backend usable', async () => {
  let installed = false
  const { controller } = harness({ extra: () => ({ subagentBackendAvailable: true, subagentRuntimeInstalled: installed }) })
  await controller.load()
  assert.equal(controller.getSnapshot().subagentRuntimeInstalled, false)
  assert.equal(controller.getSnapshot().subagentBackend, 'dsh')
  assert.equal(controller.getSnapshot().writable, true)
  installed = true
  await controller.load()
  assert.equal(controller.getSnapshot().subagentRuntimeInstalled, true)
  controller.dispose()
})
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
  const rpc = {
    call: async (_channel, method) => {
      if (method === 'preferences/status') return { ok: true, value: fallbackValue }
      if (method === 'preferences/models') {
        return new Promise((resolve, reject) => pendingModels.push({ resolve, reject }))
      }
      return { ok: true, value: fallbackValue }
    },
  }
  return { controller: createPreferenceController(rpc), pendingModels }
}

test('automatic quota retry defaults off and persists an explicit enable', async () => {
  const { controller, ready, settle } = harness()
  await ready()
  assert.equal(controller.getSnapshot().autoQuotaRetry, false)

  const pending = controller.set({ [AUTO_QUOTA_RETRY_FIELD]: true })
  assert.equal(controller.getSnapshot().autoQuotaRetry, true)
  settle()
  await pending
  assert.equal(controller.getSnapshot().autoQuotaRetry, true)
})

test('the full model list stays visible while a disabled choice is saved', async () => {
  const availableModels = [{ id: 'gpt-5.5', name: 'GPT-5.5' }, { id: 'gpt-6-astra', name: 'GPT-6 Astra' }]
  const { controller, ready, settle } = harness({ extra: () => ({ availableModels }) })
  await ready()
  assert.deepEqual(controller.getSnapshot().availableModels, availableModels)
  const saving = controller.set({ [DISABLED_MODELS_FIELD]: ['gpt-5.5'] })
  assert.deepEqual(controller.getSnapshot().disabledModels, ['gpt-5.5'])
  assert.deepEqual(controller.getSnapshot().availableModels, availableModels)
  settle()
  await saving
  assert.deepEqual(controller.getSnapshot().disabledModels, ['gpt-5.5'])
})

test('preference save reflects the chosen value while keeping ready surfaces mounted', async () => {
  const { controller, ready, settle } = harness()
  await ready()
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
  const { controller, ready, settle } = harness({ fail: true })
  await ready()
  const pending = controller.set({ [CONTEXT_MODE_FIELD]: CONTEXT_MODE_EXTENDED })

  assert.equal(controller.getSnapshot().contextMode, CONTEXT_MODE_EXTENDED)
  settle()
  await pending
  assert.equal(controller.getSnapshot().contextMode, CONTEXT_MODE_STANDARD)
  assert.equal(controller.getSnapshot().status, 'ready')
  assert.equal(controller.getSnapshot().error, true)
})

test('preference save adopts the Host accepted value instead of the optimistic patch', async () => {
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
  const controller = createPreferenceController(rpc)
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

test('a no-op model refresh keeps the model arrays and reports loading transitions', async () => {
  const { controller, pendingModels } = deferredModelHarness()
  await controller.load()
  let notifications = 0
  const unsubscribe = controller.subscribe(() => { notifications += 1 })

  const refreshing = controller.refreshModels()
  assert.equal(controller.getSnapshot().modelsLoading, true)
  pendingModels[0].resolve({ ok: true, value: { contextModels: [...fallbackModels], verbosityModels: ['gpt-5.5'] } })
  assert.equal(await refreshing, false)
  assert.equal(notifications, 2)
  assert.equal(controller.getSnapshot().modelsLoading, false)
  unsubscribe()
})

test('model metadata refresh does not interrupt a pending preference save', async () => {
  let resolveModels
  const { controller, ready, settle } = harness({ models: () => new Promise(resolve => { resolveModels = resolve }) })
  await ready()
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
