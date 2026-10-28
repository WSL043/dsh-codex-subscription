import test from 'node:test'
import assert from 'node:assert/strict'
import { createComposerPredictions, predictionInput, predictionText } from '../src/composer-predictions.js'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'
const input = () => ({ sessionId: 'session-one', turnId: 'turn-one', model: 'gpt-6.1-sol', messages: [{ role: 'user', text: '修复按钮，先别发布。' }, { role: 'assistant', text: '已修复并测试。' }] })
const frame = (prediction = '打开预览看看。', extra = []) => `data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ suggestion: prediction }) }] }, ...extra] } })}\n\n`
const config = overrides => ({ is_enabled: true, prompt: 'Predict the next user message as JSON.', prediction_reasoning_effort: 'high', ...overrides })
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
function fixture(options = {}) {
  const calls = [], state = { enabled: true, account: 'account-one' }
  const service = createComposerPredictions({ userAgent: 'test', enabled: () => state.enabled,
    credentials: async () => ({ access: 'private-test-token', accountId: state.account }),
    fetch: async (url, init) => { calls.push({ url, init }); return options.fetch ? options.fetch(url, init, calls.length) : new Response(url.endsWith('/config') ? JSON.stringify(config(options.config)) : frame(), { status: 200 }) },
    ...options.service })
  return { service, calls, state }
}

test('disabled predictions do not read authentication or make any request', async () => {
  const { service, state, calls } = fixture({ service: { credentials: () => assert.fail('must not read credentials') } }); state.enabled = false
  assert.deepEqual(await service.generate({}), { prediction: null, reason: 'disabled' }); assert.equal(calls.length, 0)
})
test('prediction input excludes tools and oversized or unfinished context', () => {
  assert.equal(predictionInput(input()).messages.length, 2)
  for (const patch of [{ model: 'deepseek-chat' }, { sessionId: '' }, { turnId: '' }, { messages: [{ role: 'tool', text: 'hidden' }, { role: 'assistant', text: 'a' }] }, { messages: [{ role: 'user', text: 'x'.repeat(24001) }, { role: 'assistant', text: 'a' }] }, { messages: [{ role: 'user', text: 'x' }, { role: 'user', text: 'a' }] }]) assert.throws(() => predictionInput({ ...input(), ...patch }), /Invalid prediction/)
})
test('capability refusal and unsupported models never perform inference', async () => {
  for (const value of [{ is_enabled: false }, { unsupported_models: ['gpt-6.1-sol'] }]) {
    const { service, calls } = fixture({ config: value }); assert.equal((await service.generate(input())).prediction, null); assert.equal(calls.length, 1)
  }
})
test('request retains prediction metadata, exact remote prompt and a tool-free isolated context', async () => {
  const { service, calls } = fixture(); assert.equal((await service.generate(input())).prediction, '打开预览看看。')
  const body = JSON.parse(calls[1].init.body), metadata = JSON.parse(body.client_metadata['x-codex-turn-metadata'])
  assert.deepEqual(body.tools, []); assert.equal(body.tool_choice, 'none'); assert.equal(body.store, false)
  assert.equal(body.input.at(-1).content[0].text, config().prompt); assert.equal(body.reasoning.effort, 'high')
  assert.equal(metadata.turn_trigger, 'composer_predictions'); assert.equal(metadata.prediction_source_turn_id, 'turn-one')
  assert.equal(JSON.stringify(body).includes('private-test-token'), false); assert.equal(JSON.stringify(body).includes('account-one'), false)
  await service.generate(input()); assert.equal(calls.length, 2, 'same turn should reuse its result')
})
test('different callers share inference but one caller cancellation does not cancel its peer', async () => {
  let release, upstream
  const { service, calls } = fixture({ fetch: (url, init) => url.endsWith('/config') ? new Response(JSON.stringify(config())) : new Promise(resolve => { upstream = init.signal; release = () => resolve(new Response(frame())) }) })
  const abort = new AbortController(); const one = service.generate(input(), abort.signal); const failure = assert.rejects(one, /cancel|abort/i)
  const two = service.generate(input()); await tick(); abort.abort(new DOMException('cancelled', 'AbortError')); await failure
  assert.equal(upstream.aborted, false); release(); assert.equal((await two).prediction, '打开预览看看。'); assert.equal(calls.length, 2)
})
test('all readers leaving aborts the upstream request and does not cache its late result', async () => {
  let release, upstream
  const { service } = fixture({ fetch: (url, init) => url.endsWith('/config') ? new Response(JSON.stringify(config())) : new Promise(resolve => { upstream = init.signal; release = () => resolve(new Response(frame())) }) })
  const abort = new AbortController(); const pending = service.generate(input(), abort.signal); const failure = assert.rejects(pending, /cancel|abort/i)
  await tick(); abort.abort(new DOMException('cancelled', 'AbortError')); await failure; assert.equal(upstream.aborted, true); release(); await tick()
})
test('account changes and explicit clear discard old configuration and cached predictions', async () => {
  const { service, calls, state } = fixture(); await service.generate(input()); state.account = 'account-two'; await service.generate(input()); assert.equal(calls.length, 4)
  assert.equal(calls[3].init.headers['chatgpt-account-id'], 'account-two'); service.clear(); await service.generate(input()); assert.equal(calls.length, 6)
})
test('clear during an active response cancels callers and rejects stale completion', async () => {
  let release
  const { service } = fixture({ fetch: url => url.endsWith('/config') ? new Response(JSON.stringify(config())) : new Promise(resolve => { release = () => resolve(new Response(frame())) }) })
  const pending = service.generate(input()); const failure = assert.rejects(pending, /scope|cancel/i); await tick(); service.clear(); await failure; release(); await tick()
})
test('turning off while configuration is in flight prevents generation', async () => {
  let release
  const { service, calls, state } = fixture({ fetch: () => new Promise(resolve => { release = () => resolve(new Response(JSON.stringify(config()))) }) })
  const pending = service.generate(input()); const failure = assert.rejects(pending, /scope|cancel/i); await tick(); state.enabled = false; release(); await failure; assert.equal(calls.length, 1)
})
test('text parsing rejects tool calls, malformed/oversized suggestions and incomplete streams', () => {
  assert.equal(predictionText(frame(null)), null); assert.equal(predictionText(frame('  好的。  ')), '好的。')
  for (const value of [frame('a', [{ type: 'function_call', name: 'shell' }]), frame('a'.repeat(601)), 'data: {"type":"response.failed"}\n', 'data: {"type":"response.created"}\n', 'data: {"type":"response.completed","response":{"status":"completed","output":[]}}\n']) assert.throws(() => predictionText(value))
})
test('network failures do not retry or route to another provider', async () => {
  const { service, calls } = fixture({ fetch: url => url.endsWith('/config') ? new Response(JSON.stringify(config())) : new Response('busy', { status: 500 }) }); await assert.rejects(service.generate(input()), /HTTP 500/); assert.equal(calls.length, 2)
})
test('RPC exposes only text results and sanitizes upstream errors', async () => {
  const signal = new AbortController().signal
  const handler = createSubscriptionRpcHandler({ composerPredictions: { generate: async () => { throw new Error('private provider details') } } })
  const result = await handler('predictions/generate', input(), signal); assert.equal(result.ok, false); assert.equal(JSON.stringify(result).includes('private provider'), false)
  const disabled = createSubscriptionRpcHandler({}); assert.deepEqual(await disabled('predictions/generate', {}, signal), { ok: true, value: { prediction: null } })
})
