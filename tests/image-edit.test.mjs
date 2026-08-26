import assert from 'node:assert/strict'
import test from 'node:test'
import { buildImageEditDraft, IMAGE_REFERENCE_ROLES } from '../src/image-edit.js'

const messages = {
  imageEditDefault: 'Edit this image.',
  imageRegionNotes: 'Region changes:',
  imageRoleSubjectPrompt: 'Use this image as the subject reference.',
  imageRoleStylePrompt: 'Use this image as the style reference.',
  imageRoleCompositionPrompt: 'Use this image as the composition reference.',
}
const translate = key => messages[key] ?? key

test('image roles stay bounded to the four user-facing editing modes', () => {
  assert.deepEqual(IMAGE_REFERENCE_ROLES.map(role => role.id), ['edit', 'subject', 'style', 'composition'])
})

test('direct editing preserves the concise default draft', () => {
  assert.equal(buildImageEditDraft({ translate }), 'Edit this image.')
})

test('reference roles add one explicit instruction before the user request', () => {
  assert.equal(buildImageEditDraft({
    prompt: 'Keep the lighting warm.',
    referenceRole: 'style',
    translate,
  }), 'Use this image as the style reference.\nKeep the lighting warm.')
})

test('numbered region notes preserve their visible pin numbers and skip empty notes', () => {
  assert.equal(buildImageEditDraft({
    prompt: 'Adjust the character.',
    annotations: [{ note: 'Make the eyes larger.' }, { note: '  ' }, { note: 'Remove the cup.' }],
    referenceRole: 'subject',
    translate,
  }), 'Use this image as the subject reference.\nAdjust the character.\n\nRegion changes:\n1. Make the eyes larger.\n3. Remove the cup.')
})

test('unknown persisted roles fail safe to direct editing', () => {
  assert.equal(buildImageEditDraft({ prompt: 'Increase contrast.', referenceRole: 'unknown', translate }), 'Increase contrast.')
})
