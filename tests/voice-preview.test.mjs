import assert from 'node:assert/strict'
import test from 'node:test'
import { createVoicePreview } from '../src/voice-preview.js'

const catalog = { selected: 'orbit', voices: [
  { voice: 'orbit', name: 'Spruce', preview_url: 'https://persistent.oaistatic.com/voice/previews/orbit.en.m4a', description: 'Calm and affirming', accent: 'American English' },
  { voice: 'x', name: 'Evil', preview_url: 'https://example.com/evil.m4a' },
] }
const make = (extra = {}) => {
  const calls = []
  const fetch = async (url, init) => {
    calls.push(String(url))
    if (String(url).endsWith('/settings/voices')) return { ok: true, status: 200, json: async () => catalog }
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, ...extra }
  }
  return { calls, preview: createVoicePreview({ fetch, credentials: async () => ({ access: 'a', accountId: 'b' }), userAgent: 'x/1' }) }
}

test('a voice has a sample from ChatGPT\'s own catalog, as a playable data URL', async () => {
  const { preview, calls } = make()
  const result = await preview.preview('spruce')
  assert.equal(result.name, 'Spruce')
  assert.equal(result.description, 'Calm and affirming')
  assert.equal(result.audio, `data:audio/mp4;base64,${Buffer.from([1, 2, 3]).toString('base64')}`)
  await preview.preview('spruce')
  assert.equal(calls.filter(url => url.endsWith('/settings/voices')).length, 1, 'the catalog is read once for a while')
})

test('only clips from OpenAI\'s static host and well-formed voice names are used', async () => {
  const { preview } = make()
  assert.equal(await preview.preview('evil'), undefined)
  assert.equal(await preview.preview('../etc'), undefined)
  assert.equal(await preview.preview('nobody'), undefined)
  assert.equal(await preview.preview(undefined), undefined)
})
