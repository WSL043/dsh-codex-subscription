import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { readOriginalImage } from '../src/original-image-download.js'
import { ORIGINAL_IMAGE_CHUNK_BYTES } from '../src/image-original-contract.js'

function fixture(data = Buffer.from('exact original image bytes'), change = value => value) {
  const original = {
    assetId: `img_${'a'.repeat(32)}`, mediaType: 'image/png', bytes: data.length,
    width: 32, height: 16, name: 'original.png',
    sha256: createHash('sha256').update(data).digest('hex'),
  }
  const calls = []
  const rpc = { async call(channel, method, request) {
    calls.push(request)
    assert.equal(channel, '/codex-subscription')
    assert.equal(method, 'image/original/chunk')
    assert.equal(request.sessionId, 'session-1')
    assert.equal(request.assetId, original.assetId)
    const end = Math.min(data.length, request.offset + ORIGINAL_IMAGE_CHUNK_BYTES)
    return { ok: true, value: change({
      ref: { ...original }, offset: request.offset,
      encoded: data.subarray(request.offset, end).toString('base64'), done: end === data.length,
    }) }
  } }
  return { original, rpc, calls }
}

test('downloads exact bytes across chunk boundaries and preserves session routing', async () => {
  const data = Buffer.alloc(ORIGINAL_IMAGE_CHUNK_BYTES + 31, 0xa5)
  const { original, rpc, calls } = fixture(data)
  const result = await readOriginalImage(rpc, 'session-1', original)
  assert.deepEqual(result, new Uint8Array(data))
  assert.deepEqual(calls.map(call => call.offset), [0, ORIGINAL_IMAGE_CHUNK_BYTES])
})

test('rejects invalid original size before allocating or requesting data', async () => {
  const { original, rpc, calls } = fixture()
  for (const bytes of [0, -1, 48 * 1024 * 1024 + 1, Infinity]) {
    await assert.rejects(readOriginalImage(rpc, 'session-1', { ...original, bytes }), /Invalid original image reference/)
  }
  assert.equal(calls.length, 0)
})

test('download cancellation stops subsequent chunks and progress counts verified bytes', async () => {
  const { original, rpc, calls } = fixture(Buffer.alloc(ORIGINAL_IMAGE_CHUNK_BYTES + 31, 7))
  const controller = new AbortController()
  const progress = []
  await assert.rejects(readOriginalImage(rpc, 'session-1', original, { signal: controller.signal, onProgress: value => { progress.push(value); controller.abort() } }), { name: 'AbortError' })
  assert.equal(calls.length, 1)
  assert.deepEqual(progress, [{ loaded: ORIGINAL_IMAGE_CHUNK_BYTES, total: original.bytes }])
  await assert.rejects(readOriginalImage(rpc, 'session-1', original, { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(calls.length, 1)
})

test('rejects changed metadata, reordered chunks, truncation, overflow and corrupt content', async () => {
  const cases = [
    [chunk => ({ ...chunk, ref: { ...chunk.ref, assetId: `img_${'b'.repeat(32)}` } }), /metadata changed/],
    [chunk => ({ ...chunk, ref: { ...chunk.ref, sha256: '0'.repeat(64) } }), /metadata changed/],
    [chunk => ({ ...chunk, ref: { ...chunk.ref, name: 'other.png' } }), /metadata changed/],
    [chunk => ({ ...chunk, offset: 1 }), /metadata changed/],
    [chunk => ({ ...chunk, done: 'true' }), /metadata changed/],
    [chunk => ({ ...chunk, encoded: '!' }), /Invalid original image chunk/],
    [chunk => ({ ...chunk, encoded: Buffer.from('short').toString('base64') }), /incomplete/],
    [chunk => ({ ...chunk, encoded: Buffer.alloc(40).toString('base64') }), /incomplete/],
    [chunk => ({ ...chunk, encoded: Buffer.alloc(chunk.ref.bytes).toString('base64') }), /integrity check failed/],
  ]
  for (const [change, error] of cases) {
    const { original, rpc } = fixture(undefined, change)
    await assert.rejects(readOriginalImage(rpc, 'session-1', original), error)
  }
})

test('fails on an RPC error without restarting the download', async () => {
  const { original } = fixture()
  let calls = 0
  await assert.rejects(readOriginalImage({ async call() {
    calls++
    return { ok: false, error: { message: 'Original image is unavailable' } }
  } }, 'session-1', original), /Original image is unavailable/)
  assert.equal(calls, 1)
})
