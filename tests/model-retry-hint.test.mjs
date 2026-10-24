import test from 'node:test'
import assert from 'node:assert/strict'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import * as dshLlm from '@deepseek-ai/dsh-llm'
import { openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { createModelRetryHint, providerRetryAfterMs, createModelRetryBridge } from '../src/model-retry-hint.js'

const errorEvent = (message = 'Service temporarily overloaded') => ({ type: 'error', reason: 'error', error: { errorMessage: message } })
const jwt = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic' } })).toString('base64url')}.fake`
async function failureOf(t, status, headers, extra = {}) {
  let requests = 0
  t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response(extra.body ?? JSON.stringify({ error: { message: 'Service temporarily overloaded' } }), { status, headers }) })
  const provider = openaiCodexSubscriptionProvider()
  const profile = { provider: 'openai-codex', piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(), transport: 'sse', streamIdleTimeoutMs: 3000, ...extra.profile }
  const adapter = provider.wrapRetryAdapter(new PiAiAdapter({ profiles: () => new Map([['openai-codex', profile]]), resolveApiKey: async () => jwt }))
  let failure
  try { for await (const event of adapter.stream({ provider: 'openai-codex', model: 'gpt-5.6-luna', messages: [{ role: 'user', content: [{ type: 'text', text: 'synthetic fixture' }] }], ...extra.options })) if (event.reason?.failure) failure = event.reason.failure } catch (error) { failure = error.failure ?? { message: error.message } }
  return { failure, requests, policy: adapter.providerRetryPolicy('openai-codex') }
}

test('Retry-After milliseconds precede seconds; dates, invalid values and huge finite waits stay bounded', () => {
  assert.equal(providerRetryAfterMs({ 'retry-after-ms': '250', 'retry-after': '9' }), 250)
  assert.equal(providerRetryAfterMs(new Headers({ 'retry-after': '1.5' })), 1500)
  const now = Date.UTC(2026, 9, 24, 0, 0, 0)
  assert.equal(providerRetryAfterMs({ 'retry-after': new Date(now + 3000).toUTCString() }, now), 3000)
  assert.equal(providerRetryAfterMs({ 'retry-after-ms': 'bad', 'retry-after': '2' }), 2000)
  assert.equal(providerRetryAfterMs({ 'retry-after-ms': '1e100' }), Number.MAX_SAFE_INTEGER)
  for (const value of ['', 'bad-date', '-2', '0', 'Infinity']) assert.equal(providerRetryAfterMs({ 'retry-after': value }, now), undefined)
})

for (const status of [429, 503]) test(`actual pi-ai and DSH adapter preserve HTTP ${status} hint without an internal replay`, async t => {
  const { failure, requests } = await failureOf(t, status, { 'retry-after': '2' }, status === 429 ? { body: 'HTTP 429 rate limit' } : {})
  assert.equal(requests, 1, JSON.stringify(failure))
  assert.equal(failure.code, status === 429 ? 'RATE_LIMIT' : 'SERVER')
  assert.equal(failure.status, status)
  assert.equal(failure.providerRetryAfterMs, 2000)
})

test('the actual adapter preserves the provider hint while retry policy remains disabled', async t => {
  const { failure, requests, policy } = await failureOf(t, 503, { 'retry-after-ms': '120' }, { profile: { retryPolicy: dshLlm.resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }) } })
  assert.equal(requests, 1, JSON.stringify(failure)); assert.equal(policy.maxRetries, 0)
  assert.equal(failure.providerRetryAfterMs, 120)
})

test('each request owns its response facts; a successful response clears a previous failure', () => {
  const a = createModelRetryHint(), b = createModelRetryHint()
  a.onResponse({ status: 503, headers: { 'retry-after': '7' } })
  b.onResponse({ status: 429, headers: { 'retry-after': '2' } })
  assert.equal(a.failure({message:'overloaded',code:'PI_AI_ERROR'}).providerRetryAfterMs, 7000)
  assert.equal(b.failure({message:'HTTP 429 rate limit',code:'RATE_LIMIT'}).providerRetryAfterMs, 2000)
  a.onResponse({ status: 200, headers: {} })
  assert.equal(a.failure({message:'overloaded',code:'PI_AI_ERROR'}).providerRetryAfterMs, undefined)
})

test('cancelled, terminal quota and already-started output never gain a retry hint', () => {
  for (const mode of ['abort', 'quota', 'output']) {
    const hint = createModelRetryHint()
    hint.onResponse({ status: 503, headers: { 'retry-after': '2' } })
    if (mode === 'output') hint.observe({ type: 'text_delta', delta: 'partial' })
    const original = { code: 'ORIGINAL', message: mode === 'quota' ? 'insufficient_quota' : 'overloaded' }
    assert.equal(hint.failure(original, mode === 'abort' ? AbortSignal.abort() : undefined), original)
  }
})

test('legacy SDK errors that drop or reject provider facts retain the old error path', () => {
  for (const ErrorClass of [class extends Error {}, class extends Error { constructor() { throw Error('Unsupported option') } }]) {
    const hint = createModelRetryHint({ ErrorClass })
    hint.onResponse({ status: 503, headers: { 'retry-after': '2' } })
    const original = { message: 'overloaded', code: 'PI_AI_ERROR' }; assert.equal(hint.failure(original), original)
  }
})
test('concurrent adapter streams and prepared calls retain their own failure metadata', async () => {
  const bridge = createModelRetryBridge()
  const fake = { async *stream(options) {
    bridge.current().onResponse({ status: options.status, headers: { 'retry-after-ms': String(options.wait) } })
    await new Promise(resolve => setImmediate(resolve))
    yield { type: 'finish', reason: { kind: 'error', failure: { message: 'overloaded', code: options.status === 429 ? 'RATE_LIMIT' : 'PI_AI_ERROR' } } }
  }, async prepareCall() { return { stream: options => fake.stream(options) } } }
  const wrapped = bridge.wrapAdapter(fake)
  const collect = async iterable => { const events = []; for await (const event of iterable) events.push(event); return events[0].reason.failure }
  const [a, b] = await Promise.all([collect(wrapped.stream({ status: 429, wait: 123 })), collect((await wrapped.prepareCall()).stream({ status: 503, wait: 456 }))])
  assert.deepEqual([a.code, a.providerRetryAfterMs, b.code, b.providerRetryAfterMs], ['RATE_LIMIT', 123, 'SERVER', 456])
  assert.equal(bridge.current(), undefined)
})

for (const code of ['usage_limit_reached', 'rate_limit_exceeded']) test(`ambiguous JSON 429 ${code} keeps the original quota-like error instead of forcing a retry`, async t => {
  const { failure, requests } = await failureOf(t, 429, { 'retry-after': '2' }, { body: JSON.stringify({ error: { code, message: 'Provider refusal' } }) })
  assert.equal(requests, 1)
  assert.match(failure.message, /You have hit your ChatGPT usage limit/u)
  assert.equal(failure.providerRetryAfterMs, undefined)
  assert.notEqual(failure.code, 'RATE_LIMIT')
})

test('native quota codes and cancellation retain their classification regardless of HTTP status', () => {
  for (const code of ['QUOTA', 'ACCOUNT_QUOTA', 'ABORTED']) {
    const hint = createModelRetryHint()
    hint.onResponse({ status: 503, headers: { 'retry-after': '2' } })
    const original = { code, message: 'Provider refused the request' }
    assert.equal(hint.failure(original), original)
  }
})

test('zero, empty and negative millisecond hints override the seconds header as in pi-ai', () => {
  for (const value of ['0', '', '-1']) assert.equal(providerRetryAfterMs({ 'retry-after-ms': value, 'retry-after': '9' }), undefined)
})

test('HTTP-date survives the actual pi-ai and DSH adapter path', async t => {
  const { failure, requests } = await failureOf(t, 503, { 'retry-after': new Date(Date.now() + 3000).toUTCString() })
  assert.equal(requests, 1)
  assert.ok(failure.providerRetryAfterMs > 1500 && failure.providerRetryAfterMs <= 3000)
})

test('a legacy adapter without prepareCall keeps that method absent', () => {
  const bridge = createModelRetryBridge()
  const adapter = { async *stream() {} }
  assert.equal(bridge.wrapAdapter(adapter).prepareCall, undefined)
})

test('a partially emitted SSE response keeps its existing failure and is never replayed by the hint bridge', async t => {
  let requests = 0
  const events = [{ type: 'response.created', response: { id: 'partial' } }, { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'm', role: 'assistant', content: [] } }, { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'partial output' }, { type: 'error', message: '503 overloaded during stream' }]
  t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response(events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream', 'retry-after-ms': '120' } }) })
  const provider = openaiCodexSubscriptionProvider(), profiles = new Map([['openai-codex', { provider: 'openai-codex', piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(), transport: 'sse', streamIdleTimeoutMs: 3000 }]])
  const adapter = provider.wrapRetryAdapter(new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => jwt }))
  const chunks = []
  for await (const event of adapter.stream({ provider: 'openai-codex', model: 'gpt-5.6-luna', messages: [{ role: 'user', content: [{ type: 'text', text: 'synthetic fixture' }] }] })) chunks.push(event)
  assert.equal(requests, 1)
  assert.ok(chunks.some(chunk => chunk.type === 'text-delta'))
  assert.equal(chunks.find(chunk => chunk.type === 'finish').reason.failure.providerRetryAfterMs, undefined)
})
