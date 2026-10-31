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
  assert.deepEqual(provider.streamFailure(), { count: 0, stage: undefined, frame: undefined, request: undefined, adapter: undefined })
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
    for await (const event of provider.streamSimple(provider.getModels()[0], { messages: [{ role: 'user', content: 'SECRET-PROMPT-TEXT', timestamp: 1 }] }, { apiKey, transport: 'sse' })) events.push(event)
    assert.ok(events.some(event => event.type === 'error'))
    const failure = provider.streamFailure()
    assert.deepEqual({ count: failure.count, stage: failure.stage, frame: failure.frame }, { count: 1, stage: 'request', frame: undefined })
    assert.equal(failure.request.method, 'streamSimple')
    assert.equal(JSON.stringify(failure.request).includes('SECRET'), false, 'no message text in the copy')
  } finally { globalThis.fetch = previous }
})

test('stream health observes the actual SSE route after cloud compaction overrides WebSocket', async () => {
  const { openaiCodexSubscriptionProvider } = await import('../src/pi-ai-runtime.js')
  const previous = globalThis.fetch
  const frames = [
    { type: 'response.created', response: { id: 'fixture' } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'message', role: 'assistant', content: [] } },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'PRIVATE RESPONSE' },
  ]
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(frames.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')))
      setTimeout(() => controller.error(Object.assign(new Error('ECONNRESET: aborted'), { code: 'ECONNRESET' })), 20)
    },
  }), { headers: { 'content-type': 'text/event-stream' } })
  try {
    let responses = 0
    const provider = openaiCodexSubscriptionProvider({
      connection: { prepare: options => ({ options: { ...options, transport: 'websocket-cached' } }) },
      compaction: { requestOptions: options => ({ ...options, transport: 'sse' }), networkOptions: options => options, preparePayload: payload => payload },
    })
    const apiKey = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')}.fake`
    const events = []
    for await (const event of provider.streamSimple(provider.getModels()[0], { messages: [{ role: 'user', content: 'PRIVATE PROMPT', timestamp: 1 }] },
      { apiKey, sessionId: 'PRIVATE SESSION', onResponse() { responses++ } })) events.push(event)
    assert.ok(events.some(event => event.type === 'text_delta'))
    assert.ok(events.some(event => event.type === 'error'))
    assert.equal(responses, 1, 'the caller callback is preserved')
    const [health] = provider.streamHealth()
    assert.deepEqual([health.configured, health.selected, health.effective, health.status, health.code], ['websocket', 'sse', 'sse', 'failed', 'ECONNRESET'])
    assert.ok(health.eventCount > 0)
    assert.equal(health.outputStarted, true)
    assert.doesNotMatch(JSON.stringify(health), /PRIVATE|fixture/)
  } finally { globalThis.fetch = previous }
})
