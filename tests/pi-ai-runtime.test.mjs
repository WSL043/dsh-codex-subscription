import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PI_AI_RUNTIME_VERSIONS,
  createModels,
  openaiCodexProvider,
} from '../src/pi-ai-runtime.js'

test('Codex transport is resolved from the DSH pi-ai adapter at the audited version', () => {
  const entry = import.meta.resolve('@earendil-works/pi-ai')
  const actual = JSON.parse(readFileSync(new URL('../package.json', entry), 'utf8')).version
  assert.ok(PI_AI_RUNTIME_VERSIONS.includes(actual), `Unaudited runtime: ${actual}`)
  assert.equal(typeof createModels, 'function')
  assert.equal(typeof openaiCodexProvider, 'function')
})

test('Codex requests keep their own user-agent when the host sends one', async () => {
  const { withoutUserAgent } = await import('../src/pi-ai-runtime.js')
  assert.deepEqual(withoutUserAgent({ 'User-Agent': 'DSH/1', 'x-other': 'kept' }), { 'x-other': 'kept' })
  assert.equal(withoutUserAgent(undefined), undefined)
})

test('an exception while a request is prepared leaves only a count and a source location', async () => {
  const { openaiCodexSubscriptionProvider } = await import('../src/pi-ai-runtime.js')
  const connection = { prepare() { return undefined.length } }
  const provider = openaiCodexSubscriptionProvider({ connection })
  assert.deepEqual(provider.streamFailure(), { count: 0, stage: undefined, frame: undefined })
  const model = provider.getModels()[0]
  await assert.rejects(async () => { for await (const _ of provider.streamSimple(model, { messages: [] }, { apiKey: 'x' })) break }, TypeError)
  const { count, stage, frame } = provider.streamFailure()
  assert.equal(stage, 'prepare')
  assert.equal(count, 1)
  assert.match(frame, /pi-ai-runtime\.test\.mjs:\d+:\d+$/u)
  assert.doesNotMatch(frame, /[A-Za-z]:\\|\\/u, 'no drive letter or backslash path')
})

test('an error event from the service is recorded as a failure after the payload was built', async () => {
  const { openaiCodexSubscriptionProvider } = await import('../src/pi-ai-runtime.js')
  const previous = globalThis.fetch
  globalThis.fetch = async () => new Response('{"error":{"message":"boom"}}', { status: 500, headers: { 'content-type': 'application/json' } })
  try {
    const provider = openaiCodexSubscriptionProvider()
    const apiKey = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')}.fake`
    const events = []
    for await (const event of provider.streamSimple(provider.getModels()[0], { messages: [{ role: 'user', content: 'hi', timestamp: 1 }] }, { apiKey, transport: 'sse' })) events.push(event)
    assert.ok(events.some(event => event.type === 'error'))
    assert.deepEqual(provider.streamFailure(), { count: 1, stage: 'payload', frame: undefined })
  } finally { globalThis.fetch = previous }
})
