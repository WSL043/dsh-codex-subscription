import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'

import { decodeImagePresentation, decodeOriginalImageRef, inheritedOriginalImageRef, originalImageRefsEqual, ORIGINAL_IMAGE_CHUNK_BYTES } from '../src/image-original-contract.js'
import { OriginalImageStore, pngDimensions } from '../src/image-original-store.js'

const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))

async function withStore(run) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-original-'))
  try { return await run(new OriginalImageStore(root)) } finally { await rm(root, { recursive: true, force: true }) }
}

test('original store preserves exact PNG bytes and isolates them by session', async () => withStore(async store => {
  const ref = await store.save('session-a', PNG)
  assert.deepEqual(pngDimensions(PNG), { width: 1, height: 1 })
  assert.equal(decodeOriginalImageRef(ref)?.assetId, ref.assetId)
  assert.equal(decodeImagePresentation({ kind: 'codex-subscription-image', schemaVersion: 1, original: ref })?.original.assetId, ref.assetId)
  const stored = await store.read('session-a', ref.assetId)
  assert.deepEqual(stored?.data, PNG)
  assert.equal(await store.read('session-b', ref.assetId), undefined)
  assert.equal(await store.read('session-a', '../original'), undefined)
  const document = await readFile(join(store.directory(ref.assetId), 'metadata.json'), 'utf8')
  assert.doesNotMatch(document, /oauth|account|prompt|token/iu)
}))

test('fork access requires an exact original reference in the inherited event prefix', async () => withStore(async store => {
  const ref = await store.save('session-parent', PNG)
  const presentation = { kind: 'codex-subscription-image', schemaVersion: 1, original: ref }
  const child = {
    header: { parentSession: 'session-parent', seedLength: 2 },
    events: [
      { seq: 0, type: 'user/message', data: {} },
      { seq: 1, type: 'tool/result', data: { meta: presentation } },
      { seq: 2, type: 'tool/result', data: { meta: presentation } },
    ],
  }
  const inherited = inheritedOriginalImageRef(child, ref.assetId)
  assert.equal(originalImageRefsEqual(inherited, ref), true)
  assert.deepEqual((await store.read('session-child', ref.assetId, inherited))?.data, PNG)
  assert.equal(await store.read('session-child', ref.assetId, { ...ref, sha256: '0'.repeat(64) }), undefined)
  assert.equal(inheritedOriginalImageRef({ ...child, header: { parentSession: 'session-parent', seedLength: 1 } }, ref.assetId), undefined)
  assert.equal(inheritedOriginalImageRef({ header: {}, events: child.events }, ref.assetId), undefined)
}))

test('real DSH forks inherit only original references present before their fork boundary', async () => withStore(async store => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  try {
    const parent = ctx.sessions.create(SessionId('image-parent'))
    const early = ctx.sessions.fork(parent, undefined, SessionId('image-early'))
    const ref = await store.save(parent.id, PNG)
    parent.append('tool/result', {
      turn: 0,
      step: 0,
      message: createToolResultMessage({
        callId: 'image-call',
        isError: false,
        content: [{ type: 'text', text: 'Generated image' }],
      }),
      meta: { kind: 'codex-subscription-image', schemaVersion: 1, original: ref },
    }, { surfaceOp: 'append' })
    const child = ctx.sessions.fork(parent, undefined, SessionId('image-child'))
    const grandchild = ctx.sessions.fork(child, undefined, SessionId('image-grandchild'))

    assert.equal(inheritedOriginalImageRef(early, ref.assetId), undefined)
    for (const fork of [child, grandchild]) {
      const inherited = inheritedOriginalImageRef(fork, ref.assetId)
      assert.equal(originalImageRefsEqual(inherited, ref), true)
      assert.deepEqual((await store.read(fork.id, ref.assetId, inherited))?.data, PNG)
    }
  } finally {
    await ctx.fiber.dispose()
  }
}))

test('original chunks are ordered, bounded, and repeat the authoritative reference', async () => withStore(async store => {
  const data = new Uint8Array(ORIGINAL_IMAGE_CHUNK_BYTES + PNG.byteLength)
  data.set(PNG)
  // Keep one valid PNG while padding after IEND; exact bytes still round-trip.
  const ref = await store.save('session-chunks', data)
  const first = await store.chunk('session-chunks', ref.assetId, 0)
  const second = await store.chunk('session-chunks', ref.assetId, ORIGINAL_IMAGE_CHUNK_BYTES)
  assert.equal(Buffer.from(first.encoded, 'base64').byteLength, ORIGINAL_IMAGE_CHUNK_BYTES)
  assert.equal(first.done, false)
  assert.equal(second.done, true)
  assert.deepEqual(second.ref, ref)
  assert.equal(await store.chunk('session-chunks', ref.assetId, 1), undefined)
}))

test('corrupt or over-permissive original assets fail closed', async () => withStore(async store => {
  const ref = await store.save('session-corrupt', PNG)
  const original = join(store.directory(ref.assetId), 'original')
  await writeFile(original, Buffer.from('corrupt'))
  assert.equal(await store.read('session-corrupt', ref.assetId), undefined)

  if (process.platform !== 'win32') {
    const next = await store.save('session-mode', PNG)
    await chmod(join(store.directory(next.assetId), 'original'), 0o644)
    assert.equal(await store.read('session-mode', next.assetId), undefined)
  }
}))
