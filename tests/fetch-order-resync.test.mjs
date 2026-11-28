import assert from 'node:assert/strict'
import test from 'node:test'
import { CODEX_FETCH_PROVIDER_ID } from '../src/codex-fetch.js'
import { FETCH_CHAIN_PROVIDER_ID, FETCH_ORDER_FIELD, FETCH_ORDER_RELOAD_REQUIRED } from '../src/fetch-order.js'
import { createFetchOrderSettings } from '../src/fetch-order-settings.js'
import { createPreferenceController } from '../src/preference-controller.js'
import { CHANNEL, unwrap } from '../src/rpc-contract.js'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'

const reloadMessage = 'Webpage reading settings may have changed or been partially saved. Reload and verify them before editing again.'
const privateActivation = 'private activation token=activation-secret'
const privateRestore = 'private restore profile=/secret/profile'

function deferred() {
  let resolve
  const promise = new Promise(accept => { resolve = accept })
  return { promise, resolve }
}

function setup({ saved = [CODEX_FETCH_PROVIDER_ID], selected = CODEX_FETCH_PROVIDER_ID, failActivation = false, failRestore = false } = {}) {
  const config = { fetchProvider: 'codex', webFetchFallbackProvider: 'http' }
  if (saved !== null) config[FETCH_ORDER_FIELD] = [...saved]
  const plugin = { ns: 'codex-subscription', revision: 1 }
  const web = { ns: 'web', revision: 1, value: { fetchProvider: selected }, base: { fetchProvider: 'http' } }
  const control = { failActivation, failRestore, failStatus: false, statusGate: undefined, activationGate: undefined }
  const activationEntered = deferred()
  const writes = []
  const calls = []
  const responses = []
  const failures = []
  let orderWritten = false
  const settings = {
    id: plugin.ns,
    get: () => config,
    async update(patch, revision) {
      assert.equal(revision, plugin.revision)
      writes.push({ entry: plugin.ns, patch: structuredClone(patch) })
      if (orderWritten && control.failRestore) throw new Error(privateRestore)
      Object.assign(config, structuredClone(patch))
      plugin.revision += 1
      orderWritten = true
    },
  }
  const forms = {
    writable: true,
    describe: () => [web, plugin],
    async update(namespace, patch, revision) {
      assert.equal(namespace, web.ns)
      assert.equal(revision, web.revision)
      writes.push({ entry: namespace, patch: structuredClone(patch) })
      activationEntered.resolve()
      if (control.activationGate) await control.activationGate.promise
      if (control.failActivation) throw new Error(privateActivation)
      Object.assign(web.value, structuredClone(patch))
      web.revision += 1
    },
    async mutate(namespace, operations, revision) {
      assert.equal(namespace, plugin.ns)
      assert.equal(revision, plugin.revision)
      assert.deepEqual(operations, [{ op: 'unset', path: [FETCH_ORDER_FIELD] }])
      writes.push({ entry: namespace, operations: structuredClone(operations) })
      if (control.failRestore) throw new Error(privateRestore)
      delete config[FETCH_ORDER_FIELD]
      plugin.revision += 1
    },
  }
  const codex = { id: CODEX_FETCH_PROVIDER_ID, title: 'Codex', available: () => true }
  const registry = new Map([
    [codex.id, codex],
    ['http', { id: 'http', title: 'HTTP', available: () => true }],
    ['deepseek-fetch-api', { id: 'deepseek-fetch-api', title: 'DeepSeek Fetch API', available: () => true }],
    [FETCH_CHAIN_PROVIDER_ID, { id: FETCH_CHAIN_PROVIDER_ID, available: () => true }],
  ])
  const fetchOrder = createFetchOrderSettings({
    settings, forms, registry, codex,
    configuredId: () => web.value.fetchProvider,
    managed: () => true,
    available: () => true,
  })
  const preferences = {
    status() {
      if (control.failStatus) throw new Error('private status connection secret')
      return { ...fetchOrder.status(), writable: true, webProvidersManagedByDsh: true, fetchRoutingAvailable: true }
    },
    async update(patch) {
      try { await fetchOrder.update(patch[FETCH_ORDER_FIELD]) }
      catch (error) { failures.push(error); throw error }
    },
  }
  const handler = createSubscriptionRpcHandler({ preferences })
  const signal = new AbortController().signal
  const rpc = {
    async call(channel, method, patch) {
      assert.equal(channel, CHANNEL)
      assert.ok(['preferences/status', 'preferences/update'].includes(method))
      calls.push({ method, patch: structuredClone(patch) })
      if (method === 'preferences/status' && control.statusGate) await control.statusGate.promise
      const response = await handler(method, patch, signal)
      responses.push({ method, response })
      return response
    },
  }
  const controller = createPreferenceController(rpc)
  return { controller, fetchOrder, config, web, plugin, control, activationEntered, writes, calls, responses, failures }
}

function assertLocked(controller) {
  const snapshot = controller.getSnapshot()
  assert.equal(snapshot.fetchOrderNeedsReload, true)
  assert.equal(snapshot.writable, false)
  assert.equal(snapshot.saving, false)
  return snapshot
}

for (const saved of [[CODEX_FETCH_PROVIDER_ID], null]) {
  test(`activation and ${saved === null ? 'unset' : 'field'} rollback failure locks the real settings/RPC/controller chain`, async context => {
    const fixture = setup({ saved, failActivation: true, failRestore: true })
    const { controller, config, web, writes, responses, failures } = fixture
    context.after(() => controller.dispose())
    await controller.load()
    assert.deepEqual(controller.getSnapshot()[FETCH_ORDER_FIELD], [CODEX_FETCH_PROVIDER_ID])
    assert.equal(controller.getSnapshot().writable, true)
    const snapshots = []
    controller.subscribe(() => snapshots.push(controller.getSnapshot()))

    assert.notEqual(await controller.set({ [FETCH_ORDER_FIELD]: ['http'] }), true)

    assert.deepEqual(config[FETCH_ORDER_FIELD], ['http'], 'the failed rollback really leaves HTTP persisted')
    assert.equal(web.value.fetchProvider, CODEX_FETCH_PROVIDER_ID, 'activation did not switch the shared selector')
    assert.equal(writes.length, 3, 'plugin write, activation attempt, and rollback attempt all ran')
    assert.equal(failures[0].code, FETCH_ORDER_RELOAD_REQUIRED)
    assert.equal(responses.at(-1).response.ok, false)
    const snapshot = assertLocked(controller)
    assert.equal(snapshot.status, 'ready')
    assert.equal(snapshot.error, true, 'the previous Codex value must not look successfully saved')
    assert.equal(snapshot.hostReadOnly, false, 'the lock is distinct from host read-only settings')
    assert.ok(snapshots.some(value => value.saving && value[FETCH_ORDER_FIELD][0] === 'http'))
    assert.ok(snapshots.filter(value => !value.saving).every(value => value.error && value.fetchOrderNeedsReload && !value.writable))
  })
}

test('reload-required errors retain their public code through unwrap without leaking the private cause', async context => {
  const { controller, responses, failures } = setup({ failActivation: true, failRestore: true })
  context.after(() => controller.dispose())
  await controller.load()
  await controller.set({ [FETCH_ORDER_FIELD]: ['http'] })
  const response = responses.at(-1).response
  assert.equal(FETCH_ORDER_RELOAD_REQUIRED, 'fetch-order-reload-required')
  assert.equal(failures[0].cause.message, privateRestore, 'the fixture must exercise a genuinely private cause')
  assert.deepEqual(response, {
    ok: false,
    error: { code: FETCH_ORDER_RELOAD_REQUIRED, message: reloadMessage, details: { issues: [] } },
  })
  assert.doesNotMatch(JSON.stringify(response), /private|activation-secret|\/secret\/profile|cause|stack/)
  assert.throws(() => unwrap(response), error => {
    assert.ok(error instanceof Error)
    assert.equal(error.code, FETCH_ORDER_RELOAD_REQUIRED)
    assert.equal(error.message, reloadMessage)
    assert.equal(Object.hasOwn(error, 'cause'), false)
    assert.doesNotMatch(error.stack, /activation-secret|\/secret\/profile/)
    return true
  })
})

test('locked set is inert and retry reads authoritative effective order instead of resubmitting the failed patch', async context => {
  const { controller, control, calls, writes, web, config, fetchOrder } = setup({ failActivation: true, failRestore: true })
  context.after(() => controller.dispose())
  await controller.load()
  await controller.set({ [FETCH_ORDER_FIELD]: ['http'] })
  const writeCount = writes.length
  const callCount = calls.length
  await controller.set({ [FETCH_ORDER_FIELD]: ['deepseek-fetch-api'] })
  assert.equal(calls.length, callCount)
  assert.equal(writes.length, writeCount)
  assertLocked(controller)

  web.value.fetchProvider = 'deepseek-fetch-api'
  web.revision += 1
  assert.deepEqual(config[FETCH_ORDER_FIELD], ['http'])
  assert.deepEqual(fetchOrder.order(), ['deepseek-fetch-api'], 'effective selection, not merely the persisted field, wins')
  control.statusGate = deferred()
  const retrying = controller.retry()
  assert.deepEqual(calls.at(-1), { method: 'preferences/status', patch: {} })
  assert.equal(controller.getSnapshot().status, 'loading')
  assertLocked(controller)
  await controller.set({ [FETCH_ORDER_FIELD]: [CODEX_FETCH_PROVIDER_ID] })
  assert.equal(calls.length, callCount + 1)
  assert.equal(writes.length, writeCount)
  control.statusGate.resolve()
  await retrying

  const snapshot = controller.getSnapshot()
  assert.equal(snapshot.status, 'ready')
  assert.deepEqual(snapshot[FETCH_ORDER_FIELD], ['deepseek-fetch-api'])
  assert.equal(snapshot.fetchOrderNeedsReload, false)
  assert.equal(snapshot.writable, true)
  assert.equal(snapshot.error, false)
  assert.equal(calls.filter(call => call.method === 'preferences/update').length, 1)
  assert.equal(writes.length, writeCount)
  control.failActivation = false
  control.failRestore = false
  assert.equal(await controller.set({ [FETCH_ORDER_FIELD]: ['deepseek-fetch-api', 'http'] }), true)
  assert.deepEqual(controller.getSnapshot()[FETCH_ORDER_FIELD], ['deepseek-fetch-api', 'http'])
  assert.equal(controller.getSnapshot().fetchOrderNeedsReload, false)
})

test('a failed resync stays locked until a later successful explicit load', async context => {
  const { controller, control, calls, writes } = setup({ failActivation: true, failRestore: true })
  context.after(() => controller.dispose())
  await controller.load()
  await controller.set({ [FETCH_ORDER_FIELD]: ['http'] })
  const writeCount = writes.length
  control.failStatus = true
  await controller.retry()
  assert.equal(controller.getSnapshot().status, 'unavailable')
  assertLocked(controller)
  const callCount = calls.length
  await controller.set({ [FETCH_ORDER_FIELD]: ['http'] })
  assert.equal(calls.length, callCount)
  await controller.retry()
  assert.equal(calls.at(-1).method, 'preferences/status')
  assertLocked(controller)
  assert.equal(writes.length, writeCount)
  assert.equal(calls.filter(call => call.method === 'preferences/update').length, 1)

  control.failStatus = false
  control.statusGate = deferred()
  const loading = controller.load()
  assertLocked(controller)
  control.statusGate.resolve()
  await loading
  assert.deepEqual(controller.getSnapshot()[FETCH_ORDER_FIELD], [CODEX_FETCH_PROVIDER_ID])
  assert.equal(controller.getSnapshot().fetchOrderNeedsReload, false)
  assert.equal(controller.getSnapshot().writable, true)
  assert.equal(writes.length, writeCount)
})

for (const target of ['order', 'shared selection']) {
  test(`a concurrent external ${target} edit also requires resync without overwriting the external choice`, async context => {
    const { controller, control, activationEntered, config, web, plugin, calls, writes } = setup({ failActivation: true })
    context.after(() => controller.dispose())
    await controller.load()
    control.activationGate = deferred()
    const saving = controller.set({ [FETCH_ORDER_FIELD]: ['http'] })
    await activationEntered.promise
    if (target === 'order') {
      config[FETCH_ORDER_FIELD] = ['deepseek-fetch-api']
      plugin.revision += 1
    } else {
      web.value.fetchProvider = 'deepseek-fetch-api'
      web.revision += 1
    }
    control.activationGate.resolve()
    await saving
    assert.equal(assertLocked(controller).error, true)
    if (target === 'order') {
      assert.deepEqual(config[FETCH_ORDER_FIELD], ['deepseek-fetch-api'])
      assert.equal(writes.length, 2, 'a newer external order must never be rolled back')
    } else {
      assert.equal(web.value.fetchProvider, 'deepseek-fetch-api')
      assert.deepEqual(config[FETCH_ORDER_FIELD], [CODEX_FETCH_PROVIDER_ID])
      assert.equal(writes.length, 3, 'even successful field rollback cannot undo the external selector conflict')
    }
    await controller.retry()
    assert.equal(calls.at(-1).method, 'preferences/status')
    assert.deepEqual(controller.getSnapshot()[FETCH_ORDER_FIELD], target === 'order' ? [CODEX_FETCH_PROVIDER_ID] : ['deepseek-fetch-api'])
    assert.equal(controller.getSnapshot().fetchOrderNeedsReload, false)
    assert.equal(controller.getSnapshot().writable, true)
    assert.equal(calls.filter(call => call.method === 'preferences/update').length, 1)
  })
}

for (const saved of [[CODEX_FETCH_PROVIDER_ID], null]) {
  test(`ordinary activation failure with successful ${saved === null ? 'unset' : 'field'} rollback remains retryable without a reload lock`, async context => {
    const { controller, control, config, web, calls, responses, failures } = setup({ saved, failActivation: true })
    context.after(() => controller.dispose())
    await controller.load()
    await controller.set({ [FETCH_ORDER_FIELD]: ['http'] })
    assert.deepEqual(config[FETCH_ORDER_FIELD], saved === null ? undefined : saved)
    assert.equal(web.value.fetchProvider, CODEX_FETCH_PROVIDER_ID)
    assert.equal(failures[0].code, undefined)
    assert.equal(responses.at(-1).response.error.code, 'internal')
    assert.equal(controller.getSnapshot().error, true)
    assert.equal(controller.getSnapshot().fetchOrderNeedsReload, false)
    assert.equal(controller.getSnapshot().writable, true)
    assert.deepEqual(controller.getSnapshot()[FETCH_ORDER_FIELD], [CODEX_FETCH_PROVIDER_ID])

    control.failActivation = false
    assert.equal(await controller.retry(), true)
    assert.deepEqual(calls.map(call => call.method), ['preferences/status', 'preferences/update', 'preferences/update'])
    assert.deepEqual(calls.at(-1).patch, { [FETCH_ORDER_FIELD]: ['http'] })
    assert.deepEqual(config[FETCH_ORDER_FIELD], ['http'])
    assert.equal(web.value.fetchProvider, FETCH_CHAIN_PROVIDER_ID)
    assert.deepEqual(controller.getSnapshot()[FETCH_ORDER_FIELD], ['http'])
    assert.equal(controller.getSnapshot().fetchOrderNeedsReload, false)
    assert.equal(controller.getSnapshot().writable, true)
    assert.equal(controller.getSnapshot().error, false)
  })
}

test('a successful ordinary reorder accepts the server receipt without a reload lock', async context => {
  const { controller, config, web, calls, writes, responses } = setup({ selected: FETCH_CHAIN_PROVIDER_ID, saved: [CODEX_FETCH_PROVIDER_ID, 'http'] })
  context.after(() => controller.dispose())
  await controller.load()
  assert.equal(await controller.set({ [FETCH_ORDER_FIELD]: ['http', CODEX_FETCH_PROVIDER_ID] }), true)
  assert.deepEqual(config[FETCH_ORDER_FIELD], ['http', CODEX_FETCH_PROVIDER_ID])
  assert.equal(web.value.fetchProvider, FETCH_CHAIN_PROVIDER_ID)
  assert.equal(writes.length, 1)
  assert.deepEqual(calls.map(call => call.method), ['preferences/status', 'preferences/update'])
  assert.equal(responses.at(-1).response.ok, true)
  const snapshot = controller.getSnapshot()
  assert.deepEqual(snapshot[FETCH_ORDER_FIELD], ['http', CODEX_FETCH_PROVIDER_ID])
  assert.equal(snapshot.status, 'ready')
  assert.equal(snapshot.fetchOrderNeedsReload, false)
  assert.equal(snapshot.writable, true)
  assert.equal(snapshot.saving, false)
  assert.equal(snapshot.error, false)
})
