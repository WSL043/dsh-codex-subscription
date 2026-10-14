import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { once } from 'node:events'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { transportError, transportResponseBody } from '../src/oauth-network.js'
import { normalizeTransportEvent } from '../src/transport-failure.js'
import { openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'

async function endpoint(t, handler) {
  const server = http.createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  return `http://127.0.0.1:${server.address().port}`
}

function response(url, signal) {
  return new Promise((resolve, reject) => {
    http.get(url, { signal }, incoming => resolve(new Response(transportResponseBody(incoming, signal), { status: incoming.statusCode })))
      .on('error', reject)
  })
}

test('real mid-body socket reset retains its code and cause through the web response', async t => {
  const url = await endpoint(t, (_request, reply) => {
    reply.write('partial')
    setTimeout(() => reply.socket?.destroy(), 30)
  })
  await assert.rejects((await response(url)).text(), error => {
    assert.equal(error.code, 'ECONNRESET')
    assert.equal(error.cause.code, 'ECONNRESET')
    assert.match(error.message, /Network transport failure.*ECONNRESET/)
    return true
  })
})

test('normal streaming preserves every byte', async t => {
  const url = await endpoint(t, (_request, reply) => { reply.write('first'); reply.end('last') })
  assert.equal(await (await response(url)).text(), 'firstlast')
})

test('cancelling a reader releases an idle HTTP response', { timeout: 3000 }, async t => {
  let closed
  const disconnected = new Promise(resolve => { closed = resolve })
  const url = await endpoint(t, (_request, reply) => {
    reply.on('close', closed)
    reply.write('waiting')
  })
  const reader = (await response(url)).body.getReader()
  await reader.read()
  await reader.cancel()
  await disconnected
})

test('user cancellation is not relabelled as a retryable network failure', { timeout: 3000 }, async t => {
  const controller = new AbortController()
  const url = await endpoint(t, (_request, reply) => reply.write('waiting'))
  const reader = (await response(url, controller.signal)).body.getReader()
  await reader.read()
  controller.abort()
  await assert.rejects(reader.read(), error => !error.message.includes('Network transport failure'))
  for (const error of [new Error('aborted'), Object.assign(new Error('cancel'), { name: 'AbortError' }), new Error('401 unauthorized')]) {
    assert.equal(transportError(error), error)
  }
})

test('only recoverable WebSocket failures receive transport context', () => {
  for (const code of [1000, 1006, 1011, 1012, 1013]) {
    const event = { type: 'error', reason: 'error', error: { errorMessage: `WebSocket closed ${code} fixture` } }
    assert.match(normalizeTransportEvent(event).error.errorMessage, /^Network transport failure:/)
    assert.equal(normalizeTransportEvent(event, AbortSignal.abort()), event)
  }
  for (const message of ['WebSocket closed 1008 policy', 'WebSocket closed 1009 size', 'WebSocket closed 10000', 'aborted', '401 unauthorized']) {
    const event = { type: 'error', reason: 'error', error: { errorMessage: message } }
    assert.equal(normalizeTransportEvent(event), event)
  }
})

test('close 1000 errors are normalized without changing completed or cancelled events', () => {
  for (const message of ['WebSocket closed 1000', 'WebSocket closed 1000 debug_close']) {
    const event = { type: 'error', reason: 'error', error: { errorMessage: message } }
    const original = structuredClone(event)
    assert.equal(normalizeTransportEvent(event).error.errorMessage, `Network transport failure: ${message}`)
    assert.deepEqual(event, original)
    const done = { type: 'done', reason: 'stop', message: event.error }
    const aborted = { ...event, reason: 'aborted' }
    assert.equal(normalizeTransportEvent(done), done)
    assert.equal(normalizeTransportEvent(aborted), aborted)
    assert.equal(normalizeTransportEvent(event, AbortSignal.abort()), event)
  }
})

test('a gateway that cannot replay a request after an upstream failure receives transport context', () => {
  const event = { type: 'error', reason: 'error', error: { errorMessage: 'exceeded request buffer limit while retrying upstream' } }
  assert.match(normalizeTransportEvent(event).error.errorMessage, /^Network transport failure: exceeded request buffer limit/)
  assert.equal(normalizeTransportEvent(event, AbortSignal.abort()), event)
  for (const message of ['Payload Too Large', 'failed to buffer the request body: length limit exceeded']) {
    const rejected = { type: 'error', reason: 'error', error: { errorMessage: message } }
    assert.equal(normalizeTransportEvent(rejected), rejected)
  }
})

async function adapterChunks(t, url) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (_url, init) => response(url, init.signal)
  t.after(() => { globalThis.fetch = originalFetch })
  const provider = openaiCodexSubscriptionProvider()
  const profiles = new Map([['openai-codex', {
    provider: 'openai-codex', piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(),
    transport: 'sse', streamIdleTimeoutMs: 3000,
  }]])
  const token = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')}.fake`
  const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => token })
  const chunks = []
  for await (const chunk of adapter.stream({ provider: 'openai-codex', model: 'gpt-5.6-luna', messages: [{ role: 'user', content: [{ type: 'text', text: 'fixture' }] }] })) chunks.push(chunk)
  return chunks
}

test('actual DSH adapter classifies a real mid-stream reset as TRANSPORT without plugin replay', { timeout: 5000 }, async t => {
  let requests = 0
  const url = await endpoint(t, (_request, reply) => {
    requests++
    reply.write('data: {"type":"response.created","response":{"id":"cut"}}\n\n')
    setTimeout(() => reply.socket?.destroy(), 30)
  })
  const chunks = await adapterChunks(t, url)
  assert.ok(chunks.some(chunk => chunk.reason?.failure?.code === 'TRANSPORT'), JSON.stringify(chunks))
  assert.equal(requests, 1)
})

test('actual DSH adapter classifies a gateway replay-buffer 507 as retryable TRANSPORT', { timeout: 5000 }, async t => {
  let requests = 0
  const url = await endpoint(t, (_request, reply) => {
    requests++
    // Envoy's local reply when an upstream retry needs a request body larger than its buffer.
    reply.writeHead(507, { 'content-type': 'text/plain' }).end('exceeded request buffer limit while retrying upstream')
  })
  const failure = (await adapterChunks(t, url)).find(chunk => chunk.reason?.failure)?.reason.failure
  assert.equal(failure?.code, 'TRANSPORT', JSON.stringify(failure))
  assert.match(failure.message, /exceeded request buffer limit while retrying upstream/)
  assert.equal(requests, 1)
})
