import assert from 'node:assert/strict'
import test from 'node:test'
import { createVoicePreview } from '../src/voice-preview.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const voices = (name = 'Spruce', path = name.toLowerCase()) => Response.json({ voices: [{ name, preview_url: `https://persistent.oaistatic.com/${path}.mp3` }] })
const audio = () => new Response(Uint8Array.of(1, 2, 3))
const credentials = async () => ({ access: 'synthetic', accountId: 'fixture' })

test('voice catalogs and samples follow the active account even when its access token changes', async () => {
  let accountId = 'first', access = 'one'
  const calls = []
  const preview = createVoicePreview({ credentials: async () => ({ accountId, access }), fetch: async (url, init) => {
    calls.push({ url, account: init.headers?.['chatgpt-account-id'] })
    return url.includes('settings/voices') ? voices(accountId === 'first' ? 'Spruce' : 'Maple') : audio()
  } })
  assert.deepEqual(await preview.available('en'), ['spruce'])
  await preview.preview('spruce', 'en')
  access = 'refreshed'
  await preview.preview('spruce', 'en')
  assert.equal(calls.length, 2, 'same-account token renewal keeps the public sample cache')
  accountId = 'second'
  assert.deepEqual(await preview.available('en'), ['maple'])
  assert.equal(await preview.preview('spruce', 'en'), undefined)
  assert.equal(calls.at(-1).account, 'second')
})

test('a signed-out caller cannot read an earlier authenticated catalog or sample cache', async () => {
  let authenticated = true
  const preview = createVoicePreview({ credentials: async () => authenticated ? { access: 'synthetic', accountId: 'fixture' } : {}, fetch: async url => url.includes('settings/voices') ? voices() : audio() })
  await preview.preview('spruce', 'en')
  authenticated = false
  await assert.rejects(preview.preview('spruce', 'en'), error => error.code === 'voice-auth')
  await assert.rejects(preview.available('en'), error => error.code === 'voice-auth')
})

test('concurrent previews share catalog and clip requests while cancelling one waiter leaves its peer running', async () => {
  const catalog = deferred(), clip = deferred(), calls = []
  const preview = createVoicePreview({ credentials, fetch: async (url, init) => {
    calls.push({ url, signal: init.signal })
    return url.includes('settings/voices') ? catalog.promise : clip.promise
  } })
  const controller = new AbortController()
  const cancelled = preview.preview('spruce', 'en', controller.signal)
  const other = preview.preview('spruce', 'en')
  const rejection = assert.rejects(cancelled, error => error.name === 'AbortError')
  await tick()
  assert.equal(calls.length, 1)
  controller.abort()
  await rejection
  assert.equal(calls[0].signal.aborted, false)
  catalog.resolve(voices())
  await tick()
  assert.equal(calls.length, 2)
  clip.resolve(audio())
  assert.equal((await other).name, 'Spruce')
})

test('concurrent successful previews share both the catalog and audio transfers', async () => {
  const calls = []
  const preview = createVoicePreview({ credentials, fetch: async url => {
    calls.push(url)
    await tick()
    return url.includes('settings/voices') ? voices() : audio()
  } })
  const results = await Promise.all([preview.preview('spruce', 'en'), preview.preview('spruce', 'en')])
  assert.equal(calls.length, 2)
  assert.equal(results[0].audio, results[1].audio)
})

test('cancelling the last sample waiter aborts that fetch and permits a clean retry', async () => {
  const pending = deferred(), signals = []
  const preview = createVoicePreview({ credentials, fetch: async (url, init) => {
    if (url.includes('settings/voices')) return voices()
    signals.push(init.signal)
    return signals.length === 1 ? pending.promise : audio()
  } })
  const controller = new AbortController(), first = preview.preview('spruce', 'en', controller.signal)
  const rejected = assert.rejects(first, error => error.name === 'AbortError')
  await tick()
  controller.abort()
  await rejected
  assert.equal(signals[0].aborted, true)
  pending.resolve(audio())
  assert.equal((await preview.preview('spruce', 'en')).name, 'Spruce')
  assert.equal(signals.length, 2)
})

test('clear cancels current callers and old responses cannot refill a newer account cache', async () => {
  const old = deferred()
  let accountId = 'first', reads = 0, oldSignal
  const preview = createVoicePreview({ credentials: async () => ({ access: 'synthetic', accountId }), fetch: async (url, init) => {
    if (!url.includes('settings/voices')) return audio()
    reads++
    if (reads === 1) { oldSignal = init.signal; return old.promise }
    return voices('Maple')
  } })
  const first = preview.available('en'), rejected = assert.rejects(first, error => error.name === 'AbortError')
  await tick()
  preview.clear()
  accountId = 'second'
  await rejected
  assert.equal(oldSignal.aborted, true)
  assert.deepEqual(await preview.available('en'), ['maple'])
  old.resolve(voices('Spruce'))
  await tick()
  assert.deepEqual(await preview.available('en'), ['maple'])
  assert.equal(reads, 2)
})

test('clearing while credentials are pending prevents a late login snapshot from starting requests', async () => {
  const auth = deferred()
  let calls = 0
  const preview = createVoicePreview({ credentials: () => auth.promise, fetch: async () => { calls++; return voices() } })
  const first = preview.available('en'), rejected = assert.rejects(first, error => error.name === 'AbortError')
  preview.clear()
  auth.resolve({ access: 'synthetic', accountId: 'old-account' })
  await rejected
  assert.equal(calls, 0)
})

test('catalog expiry respects a changed sample URL instead of permanently reusing old audio', async () => {
  let time = 0, edition = 'old'
  const samples = []
  const preview = createVoicePreview({ credentials, now: () => time, fetch: async url => {
    if (url.includes('settings/voices')) return voices('Spruce', edition)
    samples.push(url)
    return audio()
  } })
  await preview.preview('spruce', 'en')
  time = 10 * 60_000
  edition = 'new'
  await preview.preview('spruce', 'en')
  assert.deepEqual(samples, ['https://persistent.oaistatic.com/old.mp3', 'https://persistent.oaistatic.com/new.mp3'])
})

test('public sample cache uses a byte budget with LRU retention without discarding playback', async () => {
  const calls = new Map()
  const preview = createVoicePreview({ credentials, maxCachedAudioBytes: 60, fetch: async url => {
    if (url.includes('settings/voices')) return Response.json({ voices: ['aa', 'bb', 'cc'].map(name => ({ name, preview_url: `https://persistent.oaistatic.com/${name}.mp3` })) })
    calls.set(url, (calls.get(url) ?? 0) + 1)
    return audio()
  } })
  for (const voice of ['aa', 'bb', 'aa', 'cc', 'aa', 'bb']) assert.ok((await preview.preview(voice, 'en')).audio.startsWith('data:audio/'))
  assert.equal(calls.get('https://persistent.oaistatic.com/aa.mp3'), 1, 'recently used sample survives eviction')
  assert.equal(calls.get('https://persistent.oaistatic.com/bb.mp3'), 2, 'least recently used sample is fetched again')
  let downloads = 0
  const noRoom = createVoicePreview({ credentials, maxCachedAudioBytes: 1, fetch: async url => url.includes('settings/voices') ? voices() : (downloads++, audio()) })
  assert.ok((await noRoom.preview('spruce', 'en')).audio.startsWith('data:audio/'))
  await noRoom.preview('spruce', 'en')
  assert.equal(downloads, 2, 'valid samples larger than the cache budget remain playable but are not cached')
})

test('the entry limit also bounds many small public samples', async () => {
  const names = Array.from({ length: 41 }, (_, index) => `a${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`)
  let downloads = 0
  const preview = createVoicePreview({ credentials, fetch: async url => {
    if (url.includes('settings/voices')) return Response.json({ voices: names.map(name => ({ name, preview_url: `https://persistent.oaistatic.com/${name}.mp3` })) })
    downloads++
    return audio()
  } })
  for (const name of names) await preview.preview(name, 'en')
  await preview.preview(names[0], 'en')
  assert.equal(downloads, 42, 'the oldest of 41 small samples was evicted despite unused byte budget')
})
