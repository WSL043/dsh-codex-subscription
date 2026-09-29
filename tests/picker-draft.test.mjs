import assert from 'node:assert/strict'
import test from 'node:test'

import { draftStep, toggleModelId } from '../src/picker-draft.js'

test('toggling adds a hidden model and removes it again without touching the others', () => {
  assert.deepEqual(toggleModelId(['a'], 'b'), ['a', 'b'])
  assert.deepEqual(toggleModelId(['a', 'b'], 'a'), ['b'])
  const draft = ['a']
  toggleModelId(draft, 'b')
  assert.deepEqual(draft, ['a'], 'the previous draft is never mutated')
})

test('a draft follows the saved value until the user changes it', () => {
  assert.equal(draftStep({ dirty: false, writable: true, draft: [], saved: ['a'] }), 'adopt')
  assert.equal(draftStep({ dirty: false, writable: false, draft: [], saved: ['a'] }), 'adopt')
})

test('changes made during a save wait, then go out as one write', () => {
  assert.equal(draftStep({ dirty: true, writable: false, draft: ['a', 'b', 'c'], saved: ['a'] }), 'wait')
  assert.equal(draftStep({ dirty: true, writable: true, draft: ['a', 'b', 'c'], saved: ['a'] }), 'save')
})

test('a change that already matches the saved value sends nothing', () => {
  assert.equal(draftStep({ dirty: true, writable: true, draft: ['a'], saved: ['a'] }), 'settled')
})

test('toggling one model on and off again before it is sent sends nothing', () => {
  let draft = ['a']
  draft = toggleModelId(toggleModelId(draft, 'b'), 'b')
  assert.equal(draftStep({ dirty: true, writable: true, draft, saved: ['a'] }), 'settled')
})
