import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CODEX_IMAGE_EDIT_URL,
  CODEX_IMAGE_GENERATION_URL,
  CODEX_IMAGE_TOOL_NAME,
  createCodexImageTool,
  decodeCodexPng,
  normalizeImageOptions,
} from '../src/codex-images.js'

test('GPT Image 2 options default safely and validate flexible output constraints', () => {
  assert.deepEqual(normalizeImageOptions({}), { quality: 'auto', background: 'auto', size: 'auto' })
  assert.deepEqual(normalizeImageOptions({ quality: 'high', background: 'transparent', size: '1536x1024' }), {
    quality: 'high', background: 'transparent', size: '1536x1024',
  })
  assert.throws(() => normalizeImageOptions({ quality: 'ultra' }), /quality/u)
  assert.throws(() => normalizeImageOptions({ background: 'blurred' }), /background/u)
  assert.throws(() => normalizeImageOptions({ size: '1000x1000' }), /valid GPT Image 2/u)
  assert.throws(() => normalizeImageOptions({ size: '3840x1024' }), /valid GPT Image 2/u)
})

const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const IMAGE_REF = Object.freeze({
  attachmentId: 'sha256:test-image',
  mediaType: 'image/png',
  bytes: 68,
  width: 1,
  height: 1,
  name: 'codex-generated.png',
})
const ORIGINAL_REF = Object.freeze({
  assetId: 'img_0123456789abcdef0123456789abcdef',
  mediaType: 'image/png', bytes: 68, width: 1, height: 1,
  name: 'codex-generated-original.png',
  sha256: 'fixture-sha256'.padEnd(64, '0'),
})
const execContext = (callId, signal = new AbortController().signal) => ({ callId, signal, agent: { id: 'session-image' } })

function fixture(overrides = {}) {
  const requests = []
  const saves = []
  const attachments = {
    imageLimits: {
      maxImageBytes: 10 * 1024 * 1024,
      maxMessageImageBytes: 10 * 1024 * 1024,
      mediaTypes: ['image/png'],
    },
    async saveImage(input) {
      saves.push(input)
      return IMAGE_REF
    },
    async readImage(ref) {
      assert.deepEqual(ref, IMAGE_REF)
      return { ref, data: Buffer.from(ONE_PIXEL_PNG, 'base64') }
    },
  }
  const tool = createCodexImageTool({
    attachments,
    originalImages: {
      async save(sessionId, data) {
        assert.equal(sessionId, 'session-image')
        assert.equal(data.byteLength, 68)
        return ORIGINAL_REF
      },
      async remove() {},
    },
    async getAuth() { return { auth: { apiKey: 'oauth-access-token' } } },
    async readCredential() { return { type: 'oauth', accountId: 'account-123' } },
    async fetch(url, init) {
      requests.push({ url, init })
      return new Response(JSON.stringify({
        created: 1,
        background: 'opaque',
        quality: 'medium',
        size: '1024x1024',
        data: [{ b64_json: ONE_PIXEL_PNG }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
    ...overrides,
  })
  return { attachments, requests, saves, tool }
}

test('image tool uses the Codex subscription endpoint and fixed safe defaults', async () => {
  const { requests, saves, tool } = fixture()
  const signal = new AbortController().signal

  const value = await tool.execute({ prompt: 'a small blue circle on white' }, execContext('call-7', signal))

  assert.equal(tool.name, CODEX_IMAGE_TOOL_NAME)
  assert.equal(requests.length, 1, 'generation is not blindly retried')
  assert.equal(requests[0].url, CODEX_IMAGE_GENERATION_URL)
  assert.equal(requests[0].init.method, 'POST')
  assert.equal(requests[0].init.redirect, 'error')
  assert.equal(requests[0].init.signal, signal)
  assert.equal(requests[0].init.headers.authorization, 'Bearer oauth-access-token')
  assert.equal(requests[0].init.headers['chatgpt-account-id'], 'account-123')
  assert.equal(requests[0].init.headers['x-codex-image-turn-id'], 'call-7')
  assert.equal('x-api-key' in requests[0].init.headers, false)
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    prompt: 'a small blue circle on white',
    background: 'auto',
    model: 'gpt-image-2',
    quality: 'auto',
    size: 'auto',
  })
  assert.equal(saves.length, 1)
  assert.equal(saves[0].mediaType, 'image/png')
  assert.equal(Buffer.from(saves[0].data).subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.deepEqual(value, {
    image: IMAGE_REF,
    original: ORIGINAL_REF,
    background: 'opaque',
    quality: 'medium',
    size: '1024x1024',
  })
})

test('image tool forwards an explicit valid size, quality, and background without hidden settings', async () => {
  const { requests, tool } = fixture()
  await tool.execute({ prompt: 'transparent product icon', size: '1536x1024', quality: 'high', background: 'transparent' }, execContext('call-options'))
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    prompt: 'transparent product icon',
    background: 'transparent',
    model: 'gpt-image-2',
    quality: 'high',
    size: '1536x1024',
  })
})

test('tool result contains a durable image block without base64 or credentials', () => {
  const { tool } = fixture()
  const content = tool.output.render({ prompt: 'secret prompt' }, {
    image: IMAGE_REF,
    original: ORIGINAL_REF,
    background: 'opaque',
    quality: 'medium',
    size: '1024x1024',
  })

  assert.deepEqual(content, [
    { type: 'text', text: 'Generated a 1024x1024 image.' },
    { type: 'image', attachment: IMAGE_REF },
  ])
  assert.doesNotMatch(JSON.stringify(content), /oauth-access-token|account-123|iVBOR/)
  assert.deepEqual(tool.output.presentationMeta({}, { image: IMAGE_REF, original: ORIGINAL_REF }), {
    kind: 'codex-subscription-image', schemaVersion: 1, original: ORIGINAL_REF,
  })
})

test('preview persistence failure removes the unpublished exact original', async () => {
  const removed = []
  const { tool } = fixture({
    attachments: {
      imageLimits: { maxImageBytes: 10 * 1024 * 1024, maxMessageImageBytes: 10 * 1024 * 1024, mediaTypes: ['image/png'] },
      async saveImage() { throw new Error('preview failed') },
    },
    originalImages: {
      async save() { return ORIGINAL_REF },
      async remove(ref) { removed.push(ref) },
    },
  })
  await assert.rejects(tool.execute({ prompt: 'rollback' }, execContext('call-rollback')), /preview failed/u)
  assert.deepEqual(removed, [ORIGINAL_REF])
})

test('image editing is opt-in and sends only explicitly selected durable references', async () => {
  const { requests, tool } = fixture()
  const signal = new AbortController().signal

  await tool.execute({
    prompt: 'keep the composition and make the circle red',
    referenceImages: [IMAGE_REF],
  }, execContext('call-edit', signal))

  assert.equal(requests[0].url, CODEX_IMAGE_EDIT_URL)
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    images: [{ image_url: `data:image/png;base64,${ONE_PIXEL_PNG}` }],
    prompt: 'keep the composition and make the circle red',
    background: 'auto',
    model: 'gpt-image-2',
    quality: 'auto',
    size: 'auto',
  })
})

test('new generation never includes a previous image unless references are provided', async () => {
  let reads = 0
  const { requests, tool } = fixture({
    attachments: {
      imageLimits: { maxImageBytes: 10 * 1024 * 1024, maxMessageImageBytes: 10 * 1024 * 1024, mediaTypes: ['image/png'] },
      async saveImage() { return IMAGE_REF },
      async readImage() { reads += 1; throw new Error('must not read history') },
    },
  })
  await tool.execute({ prompt: 'a completely new landscape' }, execContext('call-new'))
  assert.equal(requests[0].url, CODEX_IMAGE_GENERATION_URL)
  assert.equal(reads, 0)
  assert.equal('images' in JSON.parse(requests[0].init.body), false)
})

test('malformed and oversized image payloads fail before attachment persistence', async () => {
  assert.throws(() => decodeCodexPng('not base64', 1024), /valid base64 PNG/)
  assert.throws(() => decodeCodexPng(Buffer.from('plain text').toString('base64'), 1024), /valid PNG/)
  assert.throws(() => decodeCodexPng(ONE_PIXEL_PNG, 16), /image size limit/)

  let saved = false
  const { tool } = fixture({
    attachments: {
      imageLimits: { maxImageBytes: 16, maxMessageImageBytes: 16, mediaTypes: ['image/png'] },
      async saveImage() { saved = true; throw new Error('should not save') },
    },
  })
  await assert.rejects(
    tool.execute({ prompt: 'oversized' }, { callId: 'call-8', signal: new AbortController().signal }),
    /image size limit/,
  )
  assert.equal(saved, false)
})

test('large valid base64 image responses decode without recursive-regexp stack overflow', () => {
  const bytes = Buffer.alloc(6_000_000)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes)
  const encoded = bytes.toString('base64')
  assert.equal(encoded.length, 8_000_000)
  assert.equal(decodeCodexPng(encoded, bytes.length).byteLength, bytes.length)

  assert.throws(() => decodeCodexPng(`${ONE_PIXEL_PNG.slice(0, 8)}=${ONE_PIXEL_PNG.slice(9)}`, 1024), /valid base64 PNG/)
  assert.throws(() => decodeCodexPng(`${ONE_PIXEL_PNG.slice(0, -1)}!`, 1024), /valid base64 PNG/)
})

test('missing subscription auth and provider errors are bounded', async () => {
  const { tool: missing } = fixture({
    async getAuth() { return undefined },
    async readCredential() { return undefined },
  })
  await assert.rejects(
    missing.execute({ prompt: 'x' }, { callId: 'call-9', signal: new AbortController().signal }),
    { message: 'ChatGPT subscription is not signed in' },
  )

  const { tool: failed } = fixture({
    async fetch() {
      return new Response(JSON.stringify({ error: { message: 'internal secret detail' } }), { status: 500 })
    },
  })
  await assert.rejects(
    failed.execute({ prompt: 'x' }, { callId: 'call-10', signal: new AbortController().signal }),
    { message: 'Codex image generation failed (HTTP 500)' },
  )
})
