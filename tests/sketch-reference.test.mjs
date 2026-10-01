import assert from 'node:assert/strict'
import test from 'node:test'

import { createSketchAgentTool } from '../src/sketch-agent-tool.js'
import { createSketchCommandSession } from '../src/sketch-commands.js'

const DIGEST = 'a'.repeat(64)
const REF = { attachmentId: `sha256:${DIGEST}`, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'niang.png' }
const messages = [{ content: [{ type: 'image', attachment: REF }] }]
const attachments = bytes => ({ imageLimits: { mediaTypes: ['image/png'], maxImageBytes: 1e7, maxMessageImageBytes: 1e7 }, readImage: async ref => ({ ref, data: new Uint8Array(bytes) }) })
const exec = { agent: { id: 's1' }, signal: undefined }

test('reference reads the attached image from the session and sends it to the board as a data URL', async () => {
  const sent = []
  const tool = createSketchAgentTool({ request: async (id, request) => { sent.push([id, request]); return { ok: true } } }, attachments(4), () => messages)
  await tool.execute({ action: 'reference', runId: 'run-1', documentId: 'd', revision: 3, requestId: 'r1', attachmentId: DIGEST }, exec)
  assert.equal(sent[0][0], 's1')
  assert.equal(sent[0][1].name, 'niang.png')
  assert.equal(sent[0][1].attachmentId, undefined)
  assert.match(sent[0][1].image, /^data:image\/png;base64,AAAAAA==$/)
})

test('an unknown attachment and an oversized image are refused with what to do', async () => {
  const bridge = { request: async () => ({}) }
  await assert.rejects(createSketchAgentTool(bridge, attachments(4), () => [])
    .execute({ action: 'reference', runId: 'r', documentId: 'd', attachmentId: DIGEST }, exec), /cannot be found in the current session/)
  await assert.rejects(createSketchAgentTool(bridge, attachments(1_500_000), () => messages)
    .execute({ action: 'reference', runId: 'r', documentId: 'd', attachmentId: DIGEST }, exec), /pictures button/)
})

test('the board adds the reference through its adapter and bumps nothing else', async () => {
  const added = []
  const adapter = { available: () => true, busy: () => false, snapshot: () => ({ documentId: 'd', revision: 4 }), addReference: async (image, name) => added.push([image.slice(0, 23), name]) }
  const session = createSketchCommandSession(adapter)
  const request = { action: 'reference', documentId: 'd', revision: 4, requestId: 'r1', image: 'data:image/webp;base64,AAAA', name: 'ref.webp' }
  await session(request)
  assert.deepEqual(added, [['data:image/webp;base64,', 'ref.webp']])
  await session(request)
  assert.equal(added.length, 1, 'an exact retry is answered from the first result')
  await assert.rejects(session({ ...request, requestId: 'r2', image: 'data:text/html;base64,AAAA' }), /PNG, JPEG or WebP/)
  await assert.rejects(session({ ...request, requestId: 'r3', revision: 1 }), /inspect again/)
})
