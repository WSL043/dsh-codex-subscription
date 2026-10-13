import assert from 'node:assert/strict'
import test from 'node:test'
import * as plugin from '../src/index.js'
import { createSettingsAdapter } from '../src/settings-adapter.js'
import { DISABLED_MODELS_FIELD, SPEED_MODE_FAST, SPEED_MODE_FIELD, SPEED_MODE_STANDARD } from '../src/settings-contract.js'

const { createSubscriptionRpcHandler } = plugin

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
