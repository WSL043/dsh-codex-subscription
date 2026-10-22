import test from 'node:test'
import assert from 'node:assert/strict'
import { PREFERENCE_FIELDS } from '../src/preference-fields.js'
import { createPreferenceController } from '../src/preference-controller.js'
import { zh, en } from '../src/client-locales.js'

test('reasoning cache is explicit opt-in, roundtrips preferences and never changes compaction or retry settings', async () => {
  assert.deepEqual(PREFERENCE_FIELDS.reasoningCache.choices, ['off', 'sol'])
  assert.equal(PREFERENCE_FIELDS.reasoningCache.default, 'off')
  let value = { writable: true, compactionMode: 'cloud', retryPolicy: 'unlimited' }
  const rpc = { async call(_channel, method, patch) {
    if (method === 'preferences/update') value = { ...value, ...patch }
    return { ok: true, value }
  } }
  const controller = createPreferenceController(rpc)
  await controller.load()
  assert.equal(controller.getSnapshot().reasoningCache, 'off')
  await controller.set({ reasoningCache: 'sol' })
  assert.equal(controller.getSnapshot().reasoningCache, 'sol')
  assert.equal(controller.getSnapshot().compactionMode, 'cloud')
  assert.equal(controller.getSnapshot().retryPolicy, 'unlimited')
  controller.dispose()
  for (const locale of [zh, en]) for (const key of ['reasoningCache', 'reasoningCache_off', 'reasoningCache_sol', 'reasoningCacheHint', 'reasoningCacheCloud', 'reasoningCacheRetry']) assert.equal(typeof locale[key], 'string')
})
