import test from 'node:test'
import assert from 'node:assert/strict'
import { IMAGE_FEATURE_DEFAULTS } from '../src/image-features.js'
import { imageGroupValue, imageGroupPatch } from '../src/image-setting-groups.js'

test('grouped settings preserve legacy partial preferences until explicitly changed', () => {
  const saved = { ...IMAGE_FEATURE_DEFAULTS, imageEditing: false, imageSketch: false }
  const original = structuredClone(saved)
  assert.equal(imageGroupValue(saved, 'imageCapability'), 'mixed')
  assert.equal(imageGroupValue(saved, 'imageEntryPoints'), 'mixed')
  assert.equal(imageGroupValue(saved, 'imageBrowsing'), 'on')
  assert.deepEqual(saved, original)
})

test('hiding creative entry points does not disable execution or image browsing', () => {
  const next = { ...IMAGE_FEATURE_DEFAULTS, ...imageGroupPatch('imageEntryPoints', false) }
  assert.equal(imageGroupValue(next, 'imageEntryPoints'), 'off')
  assert.equal(imageGroupValue(next, 'imageCapability'), 'on')
  assert.equal(imageGroupValue(next, 'imageBrowsing'), 'on')
  assert.deepEqual(imageGroupPatch('imageCapability', false), { imageGeneration: false, imageEditing: false })
})
