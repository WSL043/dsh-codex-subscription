import assert from 'node:assert/strict'
import test from 'node:test'
import { en, zh } from '../src/client-locales.js'
import { CONNECTOR_MODES } from '../src/settings-contract.js'

test('every connector mode has translated labels and state descriptions', () => {
  for (const dictionary of [zh, en]) for (const mode of CONNECTOR_MODES) {
    assert.ok(dictionary[`connectors_${mode}`]?.trim(), `missing label for ${mode}`)
    assert.ok(dictionary[`connectorsMode_${mode}`]?.trim(), `missing state for ${mode}`)
  }
})

test('Chinese and English cover the same keys with nonempty translations', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const key of Object.keys(en)) {
    assert.ok(zh[key].trim(), `empty zh translation: ${key}`)
    assert.ok(en[key].trim(), `empty en translation: ${key}`)
  }
})
