import assert from 'node:assert/strict'
import test from 'node:test'

import { reconcileContextDrafts } from '../src/context-draft-state.js'

const row = key => ({ key })

test('catalog refresh keeps an unsaved draft when it adds Astra', () => {
  const rows = [row('gpt-5.6'), row('gpt-6-astra')]
  assert.deepEqual(
    reconcileContextDrafts({
      modelRows: rows,
      drafts: { 'gpt-5.6': '500000' },
      previousSavedValues: { 'gpt-5.6': '272000' },
      savedValues: { 'gpt-5.6': '272000', 'gpt-6-astra': '272000' },
    }),
    { 'gpt-5.6': '500000', 'gpt-6-astra': '272000' },
  )
})

test('saved value changes replace the old draft while unchanged rows survive', () => {
  assert.deepEqual(
    reconcileContextDrafts({
      modelRows: [row('gpt-5.6'), row('gpt-5.5')],
      drafts: { 'gpt-5.6': '500000', 'gpt-5.5': '600000' },
      previousSavedValues: { 'gpt-5.6': '272000', 'gpt-5.5': '272000' },
      savedValues: { 'gpt-5.6': '300000', 'gpt-5.5': '272000' },
    }),
    { 'gpt-5.6': '300000', 'gpt-5.5': '600000' },
  )
})

test('rows removed from the catalog are removed from the draft state', () => {
  assert.deepEqual(
    reconcileContextDrafts({
      modelRows: [row('gpt-5.6')],
      drafts: { 'gpt-5.6': '500000', 'gpt-5.5': '600000' },
      previousSavedValues: { 'gpt-5.6': '272000', 'gpt-5.5': '272000' },
      savedValues: { 'gpt-5.6': '272000' },
    }),
    { 'gpt-5.6': '500000' },
  )
})
