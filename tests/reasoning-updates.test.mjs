import test from 'node:test'
import assert from 'node:assert/strict'
import { boundedStringify } from '../src/reasoning-json.js'
import { isReasoningState, reasoningHash, rewriteReasoning, REASONING_LIMITS } from '../src/reasoning-updates.js'

const model = { id: 'gpt-6.1-sol', provider: 'openai-codex', api: 'openai-codex-responses', baseUrl: 'https://chatgpt.com/backend-api', reasoning: true, supportsReasoningEffortUpdates: true }
const scope = reasoningHash('synthetic-account-and-model')
const user = text => ({ role: 'user', content: text })
const body = (input, effort = 'medium') => ({ model: model.id, input, reasoning: { effort, summary: 'concise' }, prompt_cache_key: 'fixture' })
const rewrite = (payload, previous, extra = {}) => rewriteReasoning(payload, { model, scope, previous, fresh: true, ...extra })

test('advertised models use the same protocol without inferring support from their names', () => {
  for (const id of ['gpt-6-astra', 'gpt-6-luna', 'future-account-model']) {
    const descriptor = { ...model, id }
    const result = rewrite({ ...body([user('first')]), model: id }, undefined, { model: descriptor })
    assert.equal(result.reason, 'baseline')
    assert.ok(result.state)
  }
})

test('fixed baseline and original update positions survive switches, retries and tool-only continuations', () => {
  let input = [user('first')], current = rewrite(body(input))
  for (const [index, effort] of ['high', 'medium', 'xhigh', 'low', 'max'].entries()) {
    const previous = current
    input = [...input, { type: 'function_call_output', call_id: `call-${index}`, output: 'fixture' }]
    current = rewrite(body(input, effort), previous.state)
    assert.equal(current.payload.reasoning.effort, 'medium')
    assert.equal(current.payload.reasoning.summary, 'concise')
    assert.equal(current.payload.prompt_cache_key, 'fixture')
    assert.deepEqual(current.payload.input.slice(0, previous.payload.input.length), previous.payload.input)
    assert.equal(current.payload.input.at(-1).reasoning.effort, effort)
    assert.deepEqual(rewrite(body(input, effort), current.state).payload, current.payload)
    for (let i = 1; i < current.payload.input.length; i++) assert.ok(!(current.payload.input[i].type === 'configuration_update' && current.payload.input[i - 1].type === 'configuration_update'))
  }
  assert.match(rewrite(body(input, 'low'), current.state).error, /same input/u)
  assert.ok(isReasoningState(current.state))
})

test('next-user boundary does not rewrite older assistant input; roundtrip and ancestor fork remain stable', () => {
  const first = rewrite(body([user('first')]))
  const raw = body([user('first'), { role: 'assistant', content: 'answer' }, user('second')], 'high')
  const before = JSON.stringify(raw), next = rewrite(raw, first.state)
  assert.equal(JSON.stringify(raw), before)
  assert.equal(next.payload.input[2].type, 'configuration_update')
  const restored = JSON.parse(JSON.stringify(next.state))
  const branch = rewrite(body([...raw.input, user('branch')], 'low'), restored)
  assert.deepEqual(branch.payload.input.slice(0, next.payload.input.length), next.payload.input)
  assert.deepEqual(next.state, restored)
})

test('unknown window, edited input, changed account, changed envelope and malformed metadata never adopt history', () => {
  const initial = body([user('first')]), first = rewrite(initial)
  for (const [payload, previous, extra, reason] of [
    [initial, undefined, { fresh: false }, 'unknown-window'],
    [body([user('edited')], 'high'), first.state, {}, 'history-changed'],
    [{ ...initial, instructions: 'changed' }, first.state, {}, 'history-changed'],
    [initial, first.state, { scope: reasoningHash('another-account') }, 'changed-account-or-state'],
    [initial, { ...first.state, unexpected: 'PRIVATE' }, {}, 'changed-account-or-state'],
  ]) {
    const result = rewrite(payload, previous, extra)
    assert.equal(result.payload, payload); assert.equal(result.reason, reason); assert.equal(result.state, undefined)
  }
})

test('unsupported routes, pro, automatic compaction, truncation and foreign update history stay unchanged', () => {
  for (const payload of [
    { ...body([user('x')]), context_management: [] },
    { ...body([user('x')]), multi_agent: true },
    { ...body([user('x')]), reasoning: { effort: 'high', mode: 'pro' } },
    { ...body([user('x')]), truncation: 'auto' },
    { ...body([user('x')]), previous_response_id: 'fixture' },
    { ...body([user('x')]), conversation: 'fixture' },
    { ...body([user('x')]), background: true },
    ...['configuration_update', 'compaction', 'compaction_trigger', 'agent_message'].map(type => body([{ type }])),
  ]) assert.equal(rewrite(payload).payload, payload)
  for (const badModel of [{ ...model, supportsReasoningEffortUpdates: false }, { ...model, supportsReasoningEffortUpdates: undefined }, { ...model, baseUrl: 'https://api.openai.com/v1/responses' }, { ...model, baseUrl: `${model.baseUrl}/codex/responses/compact` }]) {
    const payload = body([user('x')]); assert.equal(rewrite(payload, undefined, { model: badModel }).payload, payload)
  }
})

test('item, byte and update limits stop pinning but preserve the selected effort', () => {
  for (const input of [Array(REASONING_LIMITS.items + 1).fill(user('x')), [user('x'.repeat(REASONING_LIMITS.bytes))]]) {
    const payload = body(input, 'high'), result = rewrite(payload)
    assert.equal(result.payload, payload); assert.equal(result.reason, 'history-limit')
  }
  let input = [user('x')], current = rewrite(body(input))
  for (let i = 0; i < REASONING_LIMITS.updates; i++) {
    input = [...input, user(String(i))]; current = rewrite(body(input, i % 2 ? 'medium' : 'high'), current.state)
  }
  const payload = body([...input, user('limit')], 'high')
  assert.equal(rewrite(payload, current.state).payload, payload)
  assert.equal(rewrite(payload, current.state).reason, 'update-limit')
})

test('bounded JSON preserves native bytes, shared containers and escaping; rejects cycles', () => {
  const shared = { text: '中😀\n\t"\\\ud800' }
  for (const value of [shared, [shared, shared], { undefined: undefined, child: {} }, [undefined, NaN, false]]) {
    const text = JSON.stringify(value), bytes = Buffer.byteLength(text)
    assert.equal(boundedStringify(value, bytes), text)
    assert.equal(boundedStringify(value, bytes - 1), undefined)
  }
  const cycle = {}; cycle.self = cycle
  assert.equal(boundedStringify(cycle, 100), undefined)
})
