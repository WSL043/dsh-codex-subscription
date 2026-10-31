import test from 'node:test'
import assert from 'node:assert/strict'
import { safeFetchFailure } from '../src/transport-failure.js'
import { withCodexNetwork, createCodexNetworkTransport } from '../src/oauth-network.js'
import { createModelAttempt } from '../src/model-attempt.js'
import { openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { diagnosticLog } from '../src/diagnostic-log.js'
const apiKey = 'e30.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url') + '.fixture'
test('network error summary retains allowlisted nested codes, never raw messages or addresses', () => {
  const nested = Object.assign(Error('SECRET request body and credentials'), { code: 'ECONNRESET', address: 'PRIVATE_ADDRESS' })
  const failure = new TypeError('fetch failed', { cause: new AggregateError([nested, { code: 'SECRET_CODE' }]) })
  nested.cause = failure
  assert.equal(safeFetchFailure(failure), 'fetch failed [ECONNRESET]')
})
test('real SDK error events report sending rather than payload construction, retaining safe fetch cause', async () => {
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed', { cause: Object.assign(Error('PRIVATE_ADDRESS SECRET'), { code: 'UND_ERR_SOCKET' }) }) }
  diagnosticLog.clear()
  try {
    const provider = openaiCodexSubscriptionProvider({ runNetwork: (_area,run,options) => withCodexNetwork(run,{...options,env:{},platform:'test'}) })
    const events = []
    for await (const event of provider.streamSimple(provider.getModels()[0], { messages: [{ role:'user',content:'SECRET_PROMPT',timestamp:1 }] }, { apiKey,transport:'sse',maxRetries:0 })) events.push(event)
    assert.equal(calls, 1, 'diagnostic observation does not add a retry')
    assert.equal(provider.streamFailure().stage, 'request')
    assert.ok(events.some(e => e.type === 'error'))
    const log = diagnosticLog.snapshot().entries.at(-1)
    assert.equal(log.message, 'request failed while sending: fetch failed [UND_ERR_SOCKET]')
    assert.doesNotMatch(JSON.stringify(log), /SECRET|PRIVATE_ADDRESS|fixture/)
  } finally { globalThis.fetch = previous; diagnosticLog.clear() }
})
test('payload hook exceptions are still classified as payload errors and never dispatch', async () => {
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw Error('must not send') }
  try {
    const provider = openaiCodexSubscriptionProvider()
    for await (const _ of provider.streamSimple(provider.getModels()[0], { messages:[] }, { apiKey,transport:'sse',onPayload() { throw Error('fixture') } })) {}
    assert.equal(calls,0)
    assert.equal(provider.streamFailure().stage,'payload')
  } finally { globalThis.fetch = previous }
})
test('diagnostic observer failure cannot replace the real fetch error', async () => {
  const previous = globalThis.fetch
  const original = new TypeError('fetch failed')
  globalThis.fetch = async () => { throw original }
  try {
    await assert.rejects(withCodexNetwork(() => fetch('https://chatgpt.com/'), { env:{}, platform:'test', onFetchFailure() { throw Error('observer failed') } }), error => error === original)
  } finally { globalThis.fetch = previous }
})
for (const code of ['ECONNRESET', 'UND_ERR_SOCKET']) test(code + ' SDK error is one failed attempt, never header/iterator success', async () => {
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed', { cause: Object.assign(Error('SECRET'), { code }) }) }
  try {
    const network = createCodexNetworkTransport({ env: {}, platform: 'test' })
    const provider = openaiCodexSubscriptionProvider({ runNetwork: network.run, beginModelAttempt: network.beginModelAttempt })
    const stream = provider.streamSimple(provider.getModels()[0], { messages: [] }, { apiKey, transport: 'sse', maxRetries: 0 })
    for await (const _ of stream) {}
    await stream.next()
    const { events } = network.history()
    assert.equal(events.length, 1)
    assert.equal(events[0].status, 'failed')
    assert.equal(events[0].networkFailure, 'fetch failed [' + code + ']')
    assert.deepEqual(events[0].transports, ['sse'])
    assert.equal(events[0].requestedTransport, 'sse')
    assert.equal(network.snapshot().model.status, 'failed')
    assert.equal(events[0].attemptId, provider.streamFailure().attemptId)
    assert.equal(events[0].stage, 'request')
    assert.equal(events[0].route, 'direct')
    assert.equal(calls, 1)
    assert.doesNotMatch(JSON.stringify(events), /SECRET|fixture/)
  } finally { globalThis.fetch = previous }
})

test('attempt outcomes are sticky, bounded and do not expose arbitrary metadata', () => {
  const values = []
  const attempt = createModelAttempt({ publish: value => values.push(value) })
  attempt.configure({ preference: 'websocket', requestedTransport: 'sse', apiKey: 'SECRET', scope: 'SECRET', selectionReason: 'ws-cooldown' })
  attempt.transport('websocket'); attempt.transport('sse'); attempt.transport('SECRET')
  attempt.finish('cancelled', 'request'); attempt.finish('ok', 'stream')
  assert.equal(values.length, 1)
  assert.equal(values[0].status, 'cancelled')
  assert.deepEqual(values[0].transports, ['websocket', 'sse'])
  assert.doesNotMatch(JSON.stringify(values), /SECRET/)
})

test('consumer return before first read does not dispatch and records abandoned once', async () => {
  let prepares = 0
  const network = createCodexNetworkTransport()
  const provider = openaiCodexSubscriptionProvider({ beginModelAttempt: network.beginModelAttempt, connection: { prepare() { prepares++; throw Error('must not start') } } })
  const stream = provider.streamSimple(provider.getModels()[0], { messages: [] }, { apiKey })
  await stream.return(); await stream.next()
  assert.equal(prepares, 0)
  assert.equal(network.history().events.length, 1)
  assert.equal(network.snapshot().model.status, 'abandoned')
})
const successBody = 'data: {"type":"response.created","response":{"id":"fixture"}}\n\ndata: {"type":"response.done","response":{"id":"fixture","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":0,"total_tokens":1}}}\n\n'
test('concurrent SDK attempts commit independent outcomes, not success on headers', async () => {
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    if (++calls === 1) { await new Promise(resolve => setImmediate(resolve)); throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }) }
    return new Response(successBody, { headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    const network = createCodexNetworkTransport({ env: {}, platform: 'test' })
    const provider = openaiCodexSubscriptionProvider({ runNetwork: network.run, beginModelAttempt: network.beginModelAttempt })
    await Promise.all([1, 2].map(async () => { for await (const _ of provider.streamSimple(provider.getModels()[0], { messages: [] }, { apiKey, transport: 'sse', maxRetries: 0 })) {} }))
    const events = network.history().events
    assert.equal(events.length, 2)
    assert.deepEqual(events.map(e => e.status).sort(), ['failed', 'ok'])
    assert.equal(new Set(events.map(e => e.attemptId)).size, 2)
    assert.equal(events.find(e => e.status === 'ok').headersReceived, true)
  } finally { globalThis.fetch = previous }
})

test('an HTTP 200 followed by SDK stream error is failed, not successful headers', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => new Response('data: {"type":"response.created","response":{"id":"fixture"}}\n\ndata: {"type":"error","code":"server_error","message":"SECRET"}\n\n', { headers: { 'content-type': 'text/event-stream' } })
  try {
    const network = createCodexNetworkTransport({ env: {}, platform: 'test' })
    const provider = openaiCodexSubscriptionProvider({ runNetwork: network.run, beginModelAttempt: network.beginModelAttempt })
    for await (const _ of provider.streamSimple(provider.getModels()[0], { messages: [] }, { apiKey, transport: 'sse', maxRetries: 0 })) {}
    assert.equal(network.history().events.length, 1)
    assert.equal(network.snapshot().model.status, 'failed')
    assert.equal(network.snapshot().model.headersReceived, true)
    assert.doesNotMatch(JSON.stringify(network.history()), /SECRET/)
  } finally { globalThis.fetch = previous }
})
test('caller abort records cancellation, not a network failure or later success', async () => {
  const previous = globalThis.fetch
  let started
  const ready = new Promise(resolve => { started = resolve })
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    started()
  })
  try {
    const abort = new AbortController()
    const network = createCodexNetworkTransport({ env: {}, platform: 'test' })
    const provider = openaiCodexSubscriptionProvider({ runNetwork: network.run, beginModelAttempt: network.beginModelAttempt })
    const stream = provider.streamSimple(provider.getModels()[0], { messages: [] }, { apiKey, transport: 'sse', maxRetries: 0, signal: abort.signal })
    const first = stream.next(); await ready; abort.abort()
    await first; await stream.return()
    assert.equal(network.history().events.length, 1)
    assert.equal(network.snapshot().model.status, 'cancelled')
    assert.equal(provider.streamFailure().count, 0)
  } finally { globalThis.fetch = previous }
})
