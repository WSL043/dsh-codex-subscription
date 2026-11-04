import assert from 'node:assert/strict'
import test from 'node:test'

import {
  base64Bytes,
  firstOffloadCount,
  needsProactiveOffload,
  retainedImageSizes,
} from '../src/image-budget.js'

const LIMIT = 20 * 1024 * 1024
const imageMessage = (...sizes) => ({
  role: 'tool',
  content: sizes.map(bytes => ({ type: 'image', attachment: { bytes } })),
})
const offloadedMessage = bytes => ({ role: 'user', content: [{ type: 'image', offloaded: true, attachment: { bytes } }] })

test('base64Bytes inflates raw bytes the way the host adapter counts them', () => {
  assert.equal(base64Bytes(3), 4)
  assert.equal(base64Bytes(4), 8)
  assert.equal(base64Bytes(0), 0)
  // 20 MB of raw bytes cannot fit a 20 MB base64 bound once inflated.
  assert.ok(base64Bytes(LIMIT) > LIMIT)
})

test('firstOffloadCount only asks for the occurrences the budget actually needs', () => {
  const sizes = [10, 10, 10, 10]
  assert.equal(firstOffloadCount(sizes, 100), -1)
  assert.equal(firstOffloadCount(sizes, 40), -1)
  assert.equal(firstOffloadCount(sizes, 39), 1)
  assert.equal(firstOffloadCount(sizes, 30), 1)
  assert.equal(firstOffloadCount(sizes, 29), 2)
  assert.equal(firstOffloadCount(sizes, 1), 4)
})

test('firstOffloadCount reports every occurrence when only dropping all of them fits', () => {
  // Dropping both leaves an empty payload, which fits, so the count is exact.
  assert.equal(firstOffloadCount([10, 10], 1), 2)
  assert.equal(firstOffloadCount([], 10), -1)
})

test('firstOffloadCount ignores unusable limits and entries', () => {
  assert.equal(firstOffloadCount([5], undefined), -1)
  assert.equal(firstOffloadCount([5], -1), -1)
  assert.equal(firstOffloadCount([5], 4.5), -1)
  assert.equal(firstOffloadCount(null, 10), -1)
  // Sparse or malformed sizes contribute nothing rather than throwing.
  assert.equal(firstOffloadCount([undefined, 5, NaN], 4), 2)
})

test('retainedImageSizes follows request order and skips assistant output', () => {
  const sizes = retainedImageSizes([
    { role: 'system', content: [{ type: 'image', attachment: { bytes: 3 } }] },
    imageMessage(3),
    { role: 'assistant', content: [{ type: 'image', attachment: { bytes: 999 } }] },
    imageMessage(6, 9),
  ])
  assert.deepEqual(sizes, [4, 8, 12])
})

test('retainedImageSizes keeps offloaded occurrences in order without counting bytes', () => {
  const sizes = retainedImageSizes([offloadedMessage(300), imageMessage(3)])
  assert.deepEqual(sizes, [0, 4])
})

test('needsProactiveOffload matches the host bound for a realistic long session', () => {
  // Sixty-two 200 KB screenshots inflate to about 16 MB and still fit.
  const small = Array.from({ length: 62 }, () => imageMessage(200 * 1024))
  assert.equal(needsProactiveOffload(small, LIMIT).count, -1)
  // Seventy-six of them (about 19.8 MB) still fit; the seventy-seventh crosses.
  assert.equal(needsProactiveOffload(Array.from({ length: 76 }, () => imageMessage(200 * 1024)), LIMIT).count, -1)
  const over = Array.from({ length: 77 }, () => imageMessage(200 * 1024))
  assert.equal(needsProactiveOffload(over, LIMIT).count, 1)

  // Seventy 300 KB page renders cross it, so the oldest occurrences go first.
  const large = Array.from({ length: 70 }, () => imageMessage(300 * 1024))
  const { sizes, count } = needsProactiveOffload(large, LIMIT)
  assert.equal(sizes.length, 70)
  assert.ok(count > 0)
  const total = sizes.reduce((sum, size) => sum + size, 0)
  const kept = sizes.slice(count).reduce((sum, size) => sum + size, 0)
  assert.ok(kept <= LIMIT)
  assert.ok(kept + sizes[count - 1] > LIMIT, 'one fewer offload would still exceed the bound')
})

test('needsProactiveOffload leaves a fitting payload untouched', () => {
  assert.equal(needsProactiveOffload([imageMessage(1024)], LIMIT).count, -1)
  assert.equal(needsProactiveOffload([], LIMIT).count, -1)
})
