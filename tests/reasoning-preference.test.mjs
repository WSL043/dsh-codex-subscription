import test from 'node:test'
import assert from 'node:assert/strict'
import { PREFERENCE_FIELDS, normalizeReasoningCache } from '../src/preference-fields.js'
import { createPreferenceController } from '../src/preference-controller.js'
import { zh, en } from '../src/client-locales.js'

test('reasoning cache defaults on, preserves explicit off and never changes compaction or retry settings', async () => {
  assert.deepEqual(PREFERENCE_FIELDS.reasoningCache.choices, ['off', 'on', 'sol'])
  assert.equal(PREFERENCE_FIELDS.reasoningCache.default, 'on')
  assert.equal(normalizeReasoningCache(undefined), 'on')
  for (const value of [null, '', 'invalid']) assert.equal(normalizeReasoningCache(value), 'off')
  let value = { writable: true, compactionMode: 'cloud', retryPolicy: 'unlimited' }
  const rpc = { async call(_channel, method, patch) {
    if (method === 'preferences/update') value = { ...value, ...patch }
    return { ok: true, value }
  } }
  const controller = createPreferenceController(rpc)
  await controller.load()
  assert.equal(controller.getSnapshot().reasoningCache, 'on')
  await controller.set({ reasoningCache: 'off' })
  assert.equal(controller.getSnapshot().reasoningCache, 'off')
  await controller.load()
  assert.equal(controller.getSnapshot().reasoningCache, 'off', 'reload preserves the user choice')
  await controller.set({ reasoningCache: 'sol' })
  assert.equal(controller.getSnapshot().reasoningCache, 'on', 'legacy opt-ins keep working')
  await controller.set({ reasoningCache: 'on' })
  assert.equal(controller.getSnapshot().reasoningCache, 'on')
  assert.equal(controller.getSnapshot().compactionMode, 'cloud')
  assert.equal(controller.getSnapshot().retryPolicy, 'unlimited')
  controller.dispose()
  for (const locale of [zh, en]) for (const key of ['reasoningCache', 'reasoningCache_off', 'reasoningCache_on', 'reasoningCacheHint', 'reasoningCacheCloud', 'reasoningCacheRetry']) assert.equal(typeof locale[key], 'string')
})
