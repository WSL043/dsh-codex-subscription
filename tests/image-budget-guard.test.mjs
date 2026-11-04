import assert from 'node:assert/strict'
import test from 'node:test'

import { createImageBudgetGuard, REQUEST_IMAGE_BYTES, selectOldestImages } from '../src/image-budget-guard.js'

const message = (seq, ...bytes) => ({
  seq,
  role: 'tool',
  content: bytes.map(value => value === 'off'
    ? { type: 'image', offloaded: true, attachment: { bytes: 1024 } }
    : { type: 'image', attachment: { bytes: value } }),
})
const LIMIT = 20 * 1024 * 1024
/** Raw bytes that inflate to just over `limit`. */
const perImage = Math.ceil((LIMIT / 77) / 4) * 3
const fitting = count => Array.from({ length: count }, (_, index) => message(index + 1, perImage))

test('selectOldestImages returns nothing for unusable counts', () => {
  assert.deepEqual(selectOldestImages(fitting(3), 0), [])
  assert.deepEqual(selectOldestImages(fitting(3), -1), [])
  assert.deepEqual(selectOldestImages(fitting(3), 1.5), [])
  assert.deepEqual(selectOldestImages(null, 2), [])
})

test('selectOldestImages orders oldest input messages first and skips assistant output', () => {
  const messages = [
    { seq: 1, role: 'system', content: [{ type: 'image', attachment: { bytes: perImage } }] },
    message(2, perImage),
    { seq: 3, role: 'assistant', content: [{ type: 'image', attachment: { bytes: perImage } }] },
    message(4, perImage, perImage),
  ]
  assert.deepEqual(selectOldestImages(messages, 2), [
    { seq: 2, imageIndexes: [0] },
    { seq: 4, imageIndexes: [0] },
  ])
})

test('selectOldestImages counts previously offloaded occurrences in the index space', () => {
  const messages = [message(1, 'off', perImage, perImage)]
  assert.deepEqual(selectOldestImages(messages, 1), [{ seq: 1, imageIndexes: [1] }])
})

test('selectOldestImages refuses to answer when the count cannot be met', () => {
  assert.deepEqual(selectOldestImages(fitting(2), 3), [])
})

test('guard stays inert when the payload already fits', () => {
  let calls = 0
  const guard = createImageBudgetGuard({
    limit: LIMIT,
    messagesOf: () => fitting(2),
    offload: () => { calls += 1; return true },
  })
  assert.equal(guard.run(), false)
  assert.equal(calls, 0)
})

test('guard records one offload decision and reports only the first pressure point', () => {
  const offloads = []
  const notes = []
  const guard = createImageBudgetGuard({
    limit: LIMIT,
    messagesOf: () => fitting(77),
    offload: targets => { offloads.push(targets); return true },
    diagnostic: (area, message) => notes.push([area, message]),
  })
  assert.equal(guard.run(), true)
  assert.deepEqual(offloads, [[{ seq: 1, imageIndexes: [0] }]])
  assert.equal(notes.length, 1)
  assert.equal(notes[0][0], 'image')
  // A second turn of the same backlog does not repeat the note.
  assert.equal(guard.run(), true)
  assert.equal(notes.length, 1)
  assert.equal(offloads.length, 2)
})

test('guard survives a failing reader or writer without blocking the request', () => {
  const throws = createImageBudgetGuard({ limit: LIMIT, messagesOf: () => { throw new Error('nope') }, offload: () => true })
  assert.equal(throws.run(), false)
  const failing = createImageBudgetGuard({ limit: LIMIT, messagesOf: () => fitting(77), offload: () => { throw new Error('nope') } })
  assert.equal(failing.run(), false)
  const refusing = createImageBudgetGuard({ limit: LIMIT, messagesOf: () => fitting(77), offload: () => false })
  assert.equal(refusing.run(), false)
})

test('guard is a no-op when the provider profile bound is unusable', () => {
  for (const limit of [0, -1, 1.5, Number.NaN]) {
    const guard = createImageBudgetGuard({ limit, messagesOf: () => fitting(77), offload: () => true })
    assert.equal(guard.run(), false)
  }
  // An omitted bound falls back to the provider profile value rather than disabling.
  const fallback = createImageBudgetGuard({ messagesOf: () => fitting(77), offload: () => true })
  assert.equal(fallback.run(), true)
})

test('default bound matches the provider profile value', () => {
  assert.equal(REQUEST_IMAGE_BYTES, 20 * 1024 * 1024)
})

test('wrapImageBudgetAdapter runs the guard once per prepared call', async () => {
  const { wrapImageBudgetAdapter } = await import('../src/image-budget-guard.js')
  let runs = 0
  const guard = { run: () => { runs += 1; return false } }
  const adapter = {
    async prepareCall() { return { model: { id: 'm' }, stream: () => {} } },
    async resolveModel() { return { id: 'm' } },
    stream() {},
  }
  const wrapped = wrapImageBudgetAdapter(adapter, guard)
  await wrapped.prepareCall('openai-codex', 'gpt-6.1-sol', undefined)
  assert.equal(runs, 1)
})

test('wrapImageBudgetAdapter returns the adapter untouched without a guard', async () => {
  const { wrapImageBudgetAdapter } = await import('../src/image-budget-guard.js')
  const adapter = { stream: () => {} }
  assert.equal(wrapImageBudgetAdapter(adapter, undefined), adapter)
  assert.equal(wrapImageBudgetAdapter(adapter, {}), adapter)
})
