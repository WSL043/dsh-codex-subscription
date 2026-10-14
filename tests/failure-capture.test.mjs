import assert from 'node:assert/strict'
import test from 'node:test'

import { redactRequest, reviveRequest } from '../src/failure-capture.js'
import { observeAdapter } from '../src/request-observer.js'

test('a recorded request keeps its structure and undefined fields but none of the text', () => {
  const request = {
    method: 'streamSimple',
    model: { id: 'gpt-x', input: ['text', 'image'], contextWindow: 272000 },
    context: {
      systemPrompt: 'SECRET system prompt',
      messages: [{ role: 'user', content: [{ type: 'text' }, { type: 'text', text: 'SECRET message' }] }],
      tools: [{ name: 'read', description: 'SECRET description', parameters: { type: 'object', properties: undefined } }],
    },
    options: { apiKey: 'SECRET-KEY', headers: { authorization: 'SECRET' }, reasoning: 'low', sessionId: 'SECRET-SESSION', signal: new AbortController().signal, onPayload() {} },
  }
  const copy = redactRequest(request)
  const text = JSON.stringify(copy)
  assert.equal(text.includes('SECRET'), false)
  assert.equal(copy.options.reasoning, 'low')
  assert.equal(copy.context.messages[0].role, 'user')
  assert.equal(copy.context.messages[0].content[0].text, undefined, 'a block without text stays without text')
  const revived = reviveRequest(JSON.parse(text))
  assert.equal('text' in revived.context.messages[0].content[0], false)
  assert.equal(typeof revived.context.messages[0].content[1].text, 'string')
  assert.equal(revived.context.tools[0].parameters.properties, undefined)
  assert.equal('properties' in revived.context.tools[0].parameters, true, 'undefined is kept as a present key')
})

test('the recorded copy is bounded', () => {
  const huge = { messages: Array.from({ length: 500 }, () => ({ role: 'user', content: 'x'.repeat(10_000), extra: Array.from({ length: 500 }, () => ({ a: 1 })) })) }
  const text = JSON.stringify(redactRequest(huge))
  assert.ok(text.length < 200_000, `copy was ${text.length} bytes`)
})

test('the adapter observer records failures and thrown errors but not cancellations', async () => {
  const notes = []
  const provider = { noteAdapterFailure: (kind, options, failure) => notes.push([kind, options.id, failure.code ?? failure.message]) }
  const adapter = observeAdapter({
    async *stream(options) {
      if (options.mode === 'throw') throw Object.assign(new Error('boom'), { code: 'X' })
      yield { reason: { kind: options.mode === 'fail' ? 'error' : 'stop', failure: options.mode === 'fail' ? { code: 'PI_AI_ERROR', message: 'bad' } : undefined } }
    },
  }, provider)
  for await (const _ of adapter.stream({ id: 1, mode: 'fail' })) { /* drain */ }
  for await (const _ of adapter.stream({ id: 2, mode: 'ok' })) { /* drain */ }
  await assert.rejects(async () => { for await (const _ of adapter.stream({ id: 3, mode: 'throw' })) { /* drain */ } }, /boom/u)
  const aborted = AbortSignal.abort()
  await assert.rejects(async () => { for await (const _ of adapter.stream({ id: 4, mode: 'throw', signal: aborted })) { /* drain */ } }, /boom/u)
  assert.deepEqual(notes, [['failure', 1, 'PI_AI_ERROR'], ['thrown', 3, 'X']])
})
