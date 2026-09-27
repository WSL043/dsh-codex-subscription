import assert from 'node:assert/strict'
import test from 'node:test'

import { compatibleAttachmentService, normalizeRequestImageTarget } from '../src/attachment-request-compat.js'

const ref = { attachmentId: 'sha256:' + 'a'.repeat(64), width: 4000, height: 2000 }
const legacyTarget = { maxPixels: 4_194_304, maxBytes: 1_048_576 }

const incompatibleTarget = (field = 'width') => Object.assign(
  new Error(`Image request ${field} must be a positive integer.`),
  { code: 'INVALID_ATTACHMENT_REF' },
)

test('request target projection preserves aspect ratio and never enlarges', () => {
  assert.deepEqual(normalizeRequestImageTarget(ref, legacyTarget), {
    width: 2896,
    height: 1448,
    maxBytes: 1_048_576,
  })
  assert.deepEqual(normalizeRequestImageTarget({ width: 2000, height: 4000 }, legacyTarget), {
    width: 1448,
    height: 2896,
    maxBytes: 1_048_576,
  })
  assert.deepEqual(normalizeRequestImageTarget({ width: 640, height: 480 }, legacyTarget), {
    width: 640,
    height: 480,
    maxBytes: 1_048_576,
  })
})

test('coherent legacy attachment stores receive their policy unchanged once', async () => {
  const calls = []
  const attachments = {
    async readImageRequest(...args) { calls.push(args); return { kind: 'legacy' } },
  }
  const signal = new AbortController().signal
  const service = compatibleAttachmentService(attachments)
  assert.deepEqual(await service.readImageRequest(ref, legacyTarget, signal), { kind: 'legacy' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1], legacyTarget)
  assert.equal(calls[0][2], signal)
  assert.equal(compatibleAttachmentService(attachments), service)
})

test('mixed old adapter and current store retries with concrete dimensions', async () => {
  const calls = []
  const attachments = {
    async readImageRequest(_ref, target, signal) {
      calls.push({ target, signal })
      if (target.width === undefined) throw incompatibleTarget()
      return { kind: 'current', target }
    },
  }
  const signal = new AbortController().signal
  const result = await compatibleAttachmentService(attachments).readImageRequest(ref, legacyTarget, signal)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].target, legacyTarget)
  assert.equal(calls[0].signal, signal)
  assert.deepEqual(calls[1].target, { width: 2896, height: 1448, maxBytes: 1_048_576 })
  assert.equal(calls[1].signal, signal)
  assert.deepEqual(result, { kind: 'current', target: calls[1].target })
})

test('current targets and unrelated failures are never retried', async () => {
  const current = { width: 100, height: 50, maxBytes: 1000 }
  for (const { target, error } of [
    { target: current, error: incompatibleTarget() },
    { target: legacyTarget, error: Object.assign(new Error('Other invalid reference'), { code: 'INVALID_ATTACHMENT_REF' }) },
    { target: { maxPixels: 100, maxBytes: 0 }, error: incompatibleTarget() },
    { target: legacyTarget, error: new Error('network failed') },
  ]) {
    let calls = 0
    const attachments = { async readImageRequest() { calls += 1; throw error } }
    await assert.rejects(compatibleAttachmentService(attachments).readImageRequest(ref, target), candidate => candidate === error)
    assert.equal(calls, 1)
  }
})

test('aborted requests do not retry and delegated methods retain their receiver', async () => {
  const controller = new AbortController()
  let calls = 0
  const attachments = {
    marker: 42,
    value() { return this.marker },
    async readImageRequest() {
      calls += 1
      controller.abort()
      throw incompatibleTarget('height')
    },
  }
  const service = compatibleAttachmentService(attachments)
  assert.equal(service.value(), 42)
  await assert.rejects(service.readImageRequest(ref, legacyTarget, controller.signal), /height/)
  assert.equal(calls, 1)
})
