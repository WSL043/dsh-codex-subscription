import test from 'node:test'
import assert from 'node:assert/strict'
import { PREFERENCE_FIELDS, normalizeDefaultReasoningEffort } from '../src/preference-fields.js'
import { DEFAULT_REASONING_EFFORT_FIELD, DEFAULT_REASONING_EFFORTS, DEFAULT_REASONING_EFFORT } from '../src/settings-contract.js'
import { createPreferenceController } from '../src/preference-controller.js'
import { zh, en } from '../src/client-locales.js'

test('the default reasoning effort is opt-in and keeps the account catalog in charge by default', () => {
  const rule = PREFERENCE_FIELDS[DEFAULT_REASONING_EFFORT_FIELD]
  assert.equal(DEFAULT_REASONING_EFFORT, 'auto')
  assert.deepEqual(rule.choices, [...DEFAULT_REASONING_EFFORTS])
  assert.deepEqual(rule.choices, ['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
  assert.equal(rule.default, 'auto')
  assert.equal(rule.error, 'Invalid default reasoning effort preference')
  // 'auto' and anything unusable leaves the profile without a provider default, so the
  // adapter keeps reporting each model's own catalog default instead.
  for (const value of [undefined, null, '', 'auto', 'AUTO', 'ultra', 'none', 7, {}]) {
    assert.equal(normalizeDefaultReasoningEffort(value), undefined)
  }
  for (const value of ['low', 'medium', 'high', 'xhigh', 'max']) {
    assert.equal(normalizeDefaultReasoningEffort(value), value)
  }
})

test('the preference round-trips through the settings controller and survives a reload', async () => {
  let value = { writable: true, outputVerbosity: 'high' }
  const rpc = { async call(_channel, method, patch) {
    if (method === 'preferences/update') value = { ...value, ...patch }
    return { ok: true, value }
  } }
  const controller = createPreferenceController(rpc)
  await controller.load()
  assert.equal(controller.getSnapshot().defaultReasoningEffort, 'auto', 'an unwritten setting reports the catalog default')
  await controller.set({ defaultReasoningEffort: 'xhigh' })
  assert.equal(controller.getSnapshot().defaultReasoningEffort, 'xhigh')
  await controller.load()
  assert.equal(controller.getSnapshot().defaultReasoningEffort, 'xhigh', 'reload preserves the choice')
  assert.equal(controller.getSnapshot().outputVerbosity, 'high', 'unrelated preferences are untouched')
  await controller.set({ defaultReasoningEffort: 'auto' })
  assert.equal(controller.getSnapshot().defaultReasoningEffort, 'auto')
  controller.dispose()
})

test('both interface languages label the new control and every level', () => {
  const keys = [
    'defaultReasoningEffortTitle', 'defaultReasoningEffortHint',
    ...DEFAULT_REASONING_EFFORTS.map(level => `reasoningEffort_${level}`),
  ]
  for (const locale of [zh, en]) {
    for (const key of keys) assert.equal(typeof locale[key], 'string', `missing ${key}`)
  }
})
