import assert from 'node:assert/strict'
import test from 'node:test'
import { createVoicePreview } from '../src/voice-preview.js'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'

const catalog = { selected: 'orbit', voices: [
  { voice: 'orbit', name: 'Spruce', preview_url: 'https://persistent.oaistatic.com/voice/previews/orbit.en.m4a', description: 'Calm and affirming', accent: 'American English' },
  { voice: 'x', name: 'Evil', preview_url: 'https://example.com/evil.m4a' },
] }
const make = (extra = {}) => {
  const calls = []
  const fetch = async (url, init) => {
    calls.push(String(url))
    if (new URL(url).pathname.endsWith('/settings/voices')) return { ok: true, status: 200, json: async () => catalog }
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, ...extra }
  }
  return { calls, preview: createVoicePreview({ fetch, credentials: async () => ({ access: 'a', accountId: 'b' }), userAgent: 'x/1' }) }
}

test('catalog HTTP and malformed responses reach RPC as catalog failures rather than missing samples', async () => {
  for (const body of [new Response('<html>blocked</html>', { status: 403 }), Response.json({ wrong: [] })]) {
    const preview = createVoicePreview({ fetch: async () => body.clone(), credentials: async () => ({ access:'synthetic', accountId:'synthetic' }), userAgent:'test' })
    const handler = createSubscriptionRpcHandler({ voicePreview: preview })
    const result = await handler('voice/preview', { voice:'maple', language:'en' }, new AbortController().signal)
    assert.equal(result.error.code, 'voice-catalog')
    assert.doesNotMatch(JSON.stringify(result), /blocked|synthetic/)
  }
})

test('expired credentials and absent voices do not masquerade as the same error', async () => {
  const preview = createVoicePreview({ fetch: async () => new Response('', { status:401 }), credentials: async () => ({ access:'a', accountId:'b' }), userAgent:'test' })
  await assert.rejects(preview.preview('maple'), error => error.code === 'voice-auth')
  assert.equal(await make().preview.preview('maple'), undefined)
})

test('Maple loads from its catalog and audio failures remain download failures', async () => {
  const preview = createVoicePreview({ credentials: async () => ({ access:'a', accountId:'b' }), userAgent:'test', fetch: async url => String(url).includes('settings/voices') ? Response.json({ voices:[{ name:'Maple', preview_url:'https://persistent.oaistatic.com/maple.en.m4a' }] }) : new Response(new Uint8Array([1,2,3])) })
  assert.equal((await preview.preview('maple')).name, 'Maple')
  await assert.rejects(make({ ok:false, status:503 }).preview.preview('spruce'), error => error.code === 'voice-download')
})

test('cancelled preview requests neither fetch nor cache stale samples', async () => {
  const { preview, calls } = make()
  await assert.rejects(preview.preview('spruce', 'en', AbortSignal.abort()), error => error.name === 'AbortError')
  assert.equal(calls.length, 0)
})

test('a voice has a sample from ChatGPT\'s own catalog, as a playable data URL', async () => {
  const { preview, calls } = make()
  const result = await preview.preview('spruce')
  assert.equal(result.name, 'Spruce')
  assert.equal(result.description, 'Calm and affirming')
  assert.equal(result.audio, `data:audio/mp4;base64,${Buffer.from([1, 2, 3]).toString('base64')}`)
  await preview.preview('spruce')
  assert.equal(calls.filter(url => new URL(url).pathname.endsWith('/settings/voices')).length, 1, 'the catalog is read once for a while')
})

test('only clips from OpenAI\'s static host and well-formed voice names are used', async () => {
  const { preview } = make()
  assert.equal(await preview.preview('evil'), undefined)
  assert.equal(await preview.preview('../etc'), undefined)
  assert.equal(await preview.preview('nobody'), undefined)
  assert.equal(await preview.preview(undefined), undefined)
})

test('the catalog says which voices are offered, and a clip is downloaded once', async () => {
  const { preview, calls } = make()
  assert.deepEqual(await preview.available(), ['spruce'])
  await preview.preview('spruce')
  await preview.preview('spruce')
  assert.equal(calls.filter(url => url.endsWith('.m4a')).length, 1)
})

test('preview languages use spoken_language and never reuse another language\'s catalog or audio', async () => {
  const calls = []
  const preview = createVoicePreview({
    credentials: async () => ({ access: 'a', accountId: 'b' }), userAgent: 'test',
    fetch: async url => {
      calls.push(String(url))
      const parsed = new URL(url)
      if (parsed.pathname.endsWith('/settings/voices')) {
        const language = parsed.searchParams.get('spoken_language')
        return { ok: true, json: async () => ({ voices: [{ name: 'Cove', preview_url: `https://persistent.oaistatic.com/cove.${language}.m4a` }] }) }
      }
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode(parsed.pathname).buffer }
    },
  })
  await preview.preview('cove', 'auto')
  await preview.preview('cove', 'zh')
  await preview.preview('cove', 'ja')
  await preview.preview('cove', 'en')
  assert.deepEqual(calls.filter(url => url.includes('/settings/voices')).map(url => new URL(url).searchParams.get('spoken_language')), ['en', 'zh', 'ja'])
  assert.equal(calls.filter(url => url.endsWith('cove.en.m4a')).length, 1, 'auto and English use the same English sample')
  assert.equal(calls.filter(url => url.endsWith('cove.zh.m4a')).length, 1)
  assert.equal(calls.filter(url => url.endsWith('cove.ja.m4a')).length, 1)
})
