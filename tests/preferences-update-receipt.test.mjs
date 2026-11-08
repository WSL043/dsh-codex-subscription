import assert from 'node:assert/strict'
import test from 'node:test'
import * as plugin from '../src/index.js'
import { createSettingsAdapter } from '../src/settings-adapter.js'
import { createSubscriptionPreferencesTool } from '../src/subscription-preferences-tool.js'
import { DISABLED_MODELS_FIELD, SPEED_MODE_FAST, SPEED_MODE_FIELD, SPEED_MODE_STANDARD } from '../src/settings-contract.js'

const { createSubscriptionRpcHandler } = plugin

test('agent and settings UI share response preferences, and only an approved safe patch is written', async () => {
  const settings = { outputVerbosity: 'default', reasoningSummary: 'auto', connectors: 'off', writable: true }
  const writes = []
  const handler = createSubscriptionRpcHandler({ preferences: {
    status: () => ({ ...settings }),
    update: async patch => { writes.push(patch); Object.assign(settings, patch) },
  } })
  const exec = { agent: {}, callId: 'preferences-call', signal: new AbortController().signal }
  const approvals = []
  let decision = 'rejected'
  const tool = createSubscriptionPreferencesTool(handler, () => ({
    request: async request => { approvals.push(request); return decision },
  }))

  const ui = await handler('preferences/update', { outputVerbosity: 'low' }, exec.signal)
  assert.equal(ui.ok, true)
  assert.deepEqual(await tool.execute({ action: 'read' }, exec), { outputVerbosity: 'low', reasoningSummary: 'auto', writable: true })
  await assert.rejects(tool.execute({ action: 'update', connectors: 'write' }, exec), /Invalid/)
  await assert.rejects(tool.execute({ action: 'update', outputVerbosity: 'bad' }, exec), /invalid/i)
  assert.equal(approvals.length, 0)
  await assert.rejects(tool.execute({ action: 'update', reasoningSummary: 'concise' }, exec), /did not approve/)
  assert.equal(writes.length, 1)

  decision = 'allowed-once'
  assert.deepEqual(await tool.execute({ action: 'update', reasoningSummary: 'concise' }, exec),
    { outputVerbosity: 'low', reasoningSummary: 'concise', writable: true })
  assert.deepEqual(writes, [{ outputVerbosity: 'low' }, { reasoningSummary: 'concise' }])
  assert.equal(approvals[1].callId, exec.callId)
  assert.equal((await handler('preferences/status', {}, exec.signal)).value.reasoningSummary, 'concise')
})

test('preferences/update answers with the persisted state even while the fiber still sees the pre-write snapshot', async () => {
  // Real hosts swap the fiber's config to a new object on a volatile write, so the
  // in-flight fiber keeps reading the apply-time snapshot: the write has landed in
  // the profile patch while status() still reports the old values (issue #160).
  const persisted = { [DISABLED_MODELS_FIELD]: ['model-a'] }
  const staleSnapshot = { [DISABLED_MODELS_FIELD]: [], [SPEED_MODE_FIELD]: SPEED_MODE_STANDARD }
  const updates = []
  const preferences = {
    status: () => ({ ...staleSnapshot, writable: true }),
    update: async patch => {
      updates.push(patch)
      Object.assign(persisted, patch)
    },
  }
  const handler = createSubscriptionRpcHandler({ preferences })
  const signal = new AbortController().signal

  const before = await handler('preferences/status', {}, signal)
  assert.equal(before.ok, true)
  assert.deepEqual(before.value[DISABLED_MODELS_FIELD], [])

  const response = await handler('preferences/update', { [DISABLED_MODELS_FIELD]: ['model-a'] }, signal)
  assert.equal(response.ok, true)
  assert.deepEqual(response.value[DISABLED_MODELS_FIELD], ['model-a'], 'the receipt must carry the just-written value')
  assert.equal(response.value[SPEED_MODE_FIELD], SPEED_MODE_STANDARD, 'untouched fields still come from status()')
  assert.deepEqual(updates, [{ [DISABLED_MODELS_FIELD]: ['model-a'] }])
})

test('the settings adapter prefers the fiber live config over the apply-time snapshot', () => {
  const applied = []
  const snapshot = { [SPEED_MODE_FIELD]: SPEED_MODE_STANDARD }
  const live = { [SPEED_MODE_FIELD]: SPEED_MODE_STANDARD }
  const ctx = {
    fiber: { entry: { options: { id: 'codex-subscription' } }, config: live },
    settings: {
      configure() { return () => {} },
      async update(id, patch) { applied.push({ id, patch }) },
    },
    on() { return () => {} },
    effect(fn) { disposers.push(fn); return () => {} },
  }
  const disposers = []
  const adapter = createSettingsAdapter(ctx, snapshot)

  assert.equal(adapter.get()[SPEED_MODE_FIELD], SPEED_MODE_STANDARD)
  live[SPEED_MODE_FIELD] = SPEED_MODE_FAST
  assert.equal(adapter.get()[SPEED_MODE_FIELD], SPEED_MODE_FAST, 'in-place volatile updates are visible')
  ctx.fiber.config = { [SPEED_MODE_FIELD]: 'ultrafast' }
  assert.equal(adapter.get()[SPEED_MODE_FIELD], 'ultrafast', 'a swapped fiber config wins over the snapshot')
  ctx.fiber.config = undefined
  assert.equal(adapter.get()[SPEED_MODE_FIELD], SPEED_MODE_STANDARD, 'hosts without a live config fall back to the snapshot')
})

test('a write the running settings never pick up is reported instead of looking applied', async () => {
  const { settlesLive } = await import('../src/subscription-rpc.js')
  const patch = { [DISABLED_MODELS_FIELD]: ['b', 'a'] }
  let live = { [DISABLED_MODELS_FIELD]: [] }
  const slow = { status: () => live }
  setTimeout(() => { live = { [DISABLED_MODELS_FIELD]: ['a', 'b'] } }, 120)
  assert.equal(await settlesLive(slow, patch, undefined, { attempts: 8, delayMs: 40 }), true, 'a late host swap still counts, and list order does not matter')
  const stuck = { status: () => ({ [DISABLED_MODELS_FIELD]: [] }) }
  assert.equal(await settlesLive(stuck, patch, undefined, { attempts: 3, delayMs: 5 }), false)

  const handler = createSubscriptionRpcHandler({ preferences: { status: () => ({ [DISABLED_MODELS_FIELD]: [], writable: true }), update: async () => {} } })
  const response = await handler('preferences/update', { [DISABLED_MODELS_FIELD]: ['a'] }, new AbortController().signal)
  assert.equal(response.ok, true)
  assert.deepEqual(response.value[DISABLED_MODELS_FIELD], ['a'], 'the receipt still carries what was written')
  assert.equal(response.value.liveSynced, false, 'and says the running settings did not take it')
})
