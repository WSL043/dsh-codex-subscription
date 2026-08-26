import assert from 'node:assert/strict'
import test from 'node:test'
import { buildImageEditDraft } from '../src/image-edit.js'

const messages = {
  imageEditDefault: 'Edit this image.',
  imageRegionNotes: 'Region changes:',
}
const translate = key => messages[key] ?? key

test('direct editing preserves the concise default draft', () => {
  assert.equal(buildImageEditDraft({ translate }), 'Edit this image.')
})

test('numbered region notes preserve their visible pin numbers and skip empty notes', () => {
  assert.equal(buildImageEditDraft({
    prompt: 'Adjust the character.',
    annotations: [{ note: 'Make the eyes larger.' }, { note: '  ' }, { note: 'Remove the cup.' }],
    translate,
  }), 'Adjust the character.\n\nRegion changes:\n1. Make the eyes larger.\n3. Remove the cup.')
})
