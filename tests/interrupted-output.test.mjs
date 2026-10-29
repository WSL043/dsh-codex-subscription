import test from 'node:test'
import assert from 'node:assert/strict'
import { requestSourceNode, interruptedOutputNode as definition } from '../src/interrupted-output.js'
const reader = provider => ({ previous: () => ({ state: { provider } }) })
const attempt = (seq, text) => ({ type: 'assistant/attempt', seq, data: { turn: 1, step: 2, stream: [
  { type: 'reasoning-chunks', texts: ['PRIVATE REASONING'], time0: 1, dt: [0], index: 0 },
  { type: 'tool-call-chunks', args: ['{"secret":true}'], time0: 1, dt: [0], index: 1 },
  { type: 'text-chunks', texts: [text], time0: 1, dt: [0], index: 2 },
] } })
const node = state => definition.buildViewNode({ state, key: 'draft:1:2', id: '1:2' })

test('Codex failed attempt shows only safe text outside process folds without mutating durable history', () => {
  const event = attempt(10, 'unfinished document'), original = structuredClone(event)
  let state = definition.start({}, { event }, reader('openai-codex'))
  assert.equal(node(state).data.text, 'unfinished document')
  assert.deepEqual(node(state).location, { kind: 'session' })
  assert.doesNotMatch(JSON.stringify(node(state)), /PRIVATE REASONING|secret/)
  assert.deepEqual(event, original)
  state = definition.update({ state }, { event: attempt(20, 'new draft') })
  assert.equal(node(state).data.text, 'new draft')
  assert.equal(node(state).data.attempts, 2)
  state = definition.update({ state }, { event: { type: 'llm/retry', data: { retry: 3, failure: { code: 'TRANSPORT' } } } })
  assert.equal(node(state).data.repeated, true)
  const materialized = node(state)
  state = definition.update({ state }, { event: { type: 'assistant/message', data: { message: {} } } })
  assert.equal(node(state), null, 'successful or native interrupted messages replace the recovery card')
  assert.deepEqual(definition.buildViewNode({ state, current: new Map([['chat', materialized]]) }),
    { ...materialized, visibility: 'hidden' }, 'native incremental upserts must explicitly hide a previously materialized card')
})

test('other providers, missing source, tool-only failures and unknown stream formats fail closed', () => {
  for (const provider of [undefined, 'deepseek', 'openai']) assert.equal(node(definition.start({}, { event: attempt(10, 'text') }, reader(provider))), null)
  assert.equal(node(definition.start({}, { event: attempt(10, '') }, reader('openai-codex'))), null)
  assert.equal(node(definition.start({}, { event: { ...attempt(10, ''), data: { stream: {} } } }, reader('openai-codex'))), null)
  assert.equal(requestSourceNode.start({}, { event: { data: { header: { config: { provider: 'openai-codex' } } } } }).provider, 'openai-codex')
  assert.equal(definition.match({ type: 'tool/result' }), null)
})
