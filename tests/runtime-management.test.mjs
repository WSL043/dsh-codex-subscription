import test from 'node:test'
import assert from 'node:assert/strict'
import { createRuntimeManagement } from '../src/runtime-management.js'
import { createSubscriptionSubagent } from '../src/subagent-backend.js'

const tick = () => new Promise(resolve => setImmediate(resolve))

function fixture({ runtime = { installed: false, adapterInstalled: true }, available = true, owned = false, active = 0, change } = {}) {
  const calls = []
  const service = createRuntimeManagement({
    inspect: () => runtime,
    active: () => active,
    componentVersion: () => '0.2.2-rc.1',
    selectDsh: async () => calls.push('dsh'),
    cli: { inspect: () => ({ available, owned }), change: change ?? (async action => calls.push(action)) },
  })
  return { service, calls }
}

test('only prepares the dedicated CLI after DSH supplies the matching official adapter', async () => {
  const missing = fixture({ runtime: { installed: false } })
  assert.equal(missing.service.status().adapterInstalled, false)
  assert.equal(missing.service.status().installable, false)
  await assert.rejects(missing.service.start('install'), /unavailable/)
  assert.deepEqual(missing.calls, [])

  const { service, calls } = fixture()
  assert.equal(service.status().installable, true)
  await service.start('install')
  await tick()
  assert.deepEqual(calls, ['install'])
  assert.equal(service.status().restartRequired, true)
  await assert.rejects(service.start('remove'), /restart-required/)
})

test('removal only handles the owned CLI alias and switches away from it first', async () => {
  const officialOnly = fixture()
  assert.equal(officialOnly.service.status().removable, false)
  await assert.rejects(officialOnly.service.start('remove'), /unavailable/)
  assert.deepEqual(officialOnly.calls, [])

  const { service, calls } = fixture({ owned: true })
  await service.start('remove')
  await tick()
  assert.deepEqual(calls, ['dsh', 'remove'])
})

test('active tasks and an unmanaged profile prevent CLI changes', async () => {
  const busy = fixture({ active: 1 })
  await assert.rejects(busy.service.start('install'), /active-tasks/)
  const unmanaged = fixture({ available: false })
  await assert.rejects(unmanaged.service.start('install'), /unavailable/)
  await assert.rejects(unmanaged.service.start('arbitrary-package'), /invalid-action/)
  assert.deepEqual([...busy.calls, ...unmanaged.calls], [])
})

test('component maintenance prevents new subtasks and preparation before touching credentials', async () => {
  const instance = createSubscriptionSubagent({ maintenance: () => true, loadRuntime: () => assert.fail('must not load during maintenance') })
  await assert.rejects(instance.provider.start({}), /component is being changed/)
  await assert.rejects(instance.prepare(), /Restart DSH/)
  assert.equal(instance.activeCount(), 0)
})

test('preparing again revalidates an optional CLI removed after an earlier successful preparation', async () => {
  let installed = true
  const instance = createSubscriptionSubagent({ loadRuntime: async () => {
    if (!installed) throw Error('component removed')
    return {}
  } })
  await instance.prepare()
  installed = false
  await assert.rejects(instance.prepare(), /component removed/)
})

test('CLI installation serializes changes and can be cancelled before it applies', async () => {
  let entered
  const started = new Promise(resolve => { entered = resolve })
  const { service } = fixture({ change: (_action, signal) => new Promise((_resolve, reject) => {
    entered()
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }) })
  await service.start('install')
  await started
  await assert.rejects(service.start('install'), /busy/)
  assert.equal(service.blocked(), true)
  await service.cancel()
  assert.equal(service.status().phase, 'cancelled')
  assert.equal(service.blocked(), false)
})
