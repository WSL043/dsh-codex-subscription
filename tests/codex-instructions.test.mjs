import assert from 'node:assert/strict'
import test from 'node:test'
import { openaiCodexProvider, openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'

async function capture(payload, { id = 'gpt-6.2-sol', preferences = '', compaction, onPayload } = {}) {
  let wire
  const native = openaiCodexProvider()
  const provider = openaiCodexSubscriptionProvider({
    resolveCustomInstructions: () => preferences,
    compaction: compaction && { requestOptions: options => options, networkOptions: options => options, ...compaction },
    providerFactory: () => ({ ...native, streamSimple(model, _context, options) {
      return {
        async *[Symbol.asyncIterator]() { wire = await options.onPayload(payload, model); yield { type: 'done' } },
        result: async () => ({ stopReason: 'stop' }),
      }
    } }),
  })
  const model = { ...native.getModels()[0], id }
  for await (const _ of provider.streamSimple(model, { messages: [] }, { onPayload })) {}
  return wire
}

test('6.2 and later cache reusable instructions without mutating history or replay items', async () => {
  const payload = { instructions: 'Stable DSH policy', input: [
    { role: 'user', content: 'First question' },
    { type: 'reasoning', id: 'r1', encrypted_content: 'opaque' },
    { type: 'function_call', call_id: 'c1', name: 'read', arguments: '{}' },
    { type: 'function_call_output', call_id: 'c1', output: 'Result' },
  ] }
  const before = structuredClone(payload)
  for (const id of ['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6.3-luna', 'gpt-7-sol', 'gpt-7.0-sol']) {
    const wire = await capture(payload, { id, preferences: 'Be concise.' })
    assert.equal(wire.instructions, '')
    assert.equal(wire.input[0].role, 'developer')
    assert.match(wire.input[0].content[0].text, /^Stable DSH policy/)
    assert.ok(wire.input[0].content[0].text.endsWith('Be concise.'))
    assert.deepEqual(wire.input.slice(1), before.input)
  }
  assert.deepEqual(payload, before)
  for (const id of ['gpt-6.1-sol', 'gpt-5.6-luna', 'unknown-model']) {
    const wire = await capture(payload, { id })
    assert.equal(wire.instructions, payload.instructions)
    assert.deepEqual(wire.input, payload.input)
  }
})

test('native developer prefixes accept preferences once in either supported content shape', async () => {
  for (const content of ['Native prefix', [{ type: 'input_text', text: 'Native prefix' }]]) {
    const payload = { input: [{ role: 'developer', content }, { role: 'user', content: 'Question' }] }
    const before = structuredClone(payload)
    const wire = await capture(payload, { preferences: 'Saved preference' })
    assert.equal(wire.instructions, undefined)
    assert.equal(wire.input.length, 2)
    const text = typeof wire.input[0].content === 'string' ? wire.input[0].content : wire.input[0].content.map(p => p.text).join('\n')
    assert.ok(text.startsWith('Native prefix'))
    assert.ok(text.endsWith('Saved preference'))
    assert.equal(text.match(/Saved preference/gu).length, 1)
    assert.deepEqual(payload, before)
  }
})

test('compaction replay keeps its checkpoint and caller turn-scoped instructions stay separate', async () => {
  const checkpoint = { type: 'compaction', encrypted_content: 'checkpoint' }
  const wire = await capture({ instructions: 'Stable policy', input: [{ role: 'user', content: 'Continue' }] }, {
    compaction: { preparePayload: payload => ({ ...payload, input: [checkpoint, ...payload.input] }) },
    onPayload: payload => ({ ...payload, instructions: 'Summarize only this turn.' }),
  })
  assert.deepEqual(wire.input[0], checkpoint)
  assert.equal(wire.input[1].role, 'developer')
  assert.equal(wire.input[1].content[0].text, 'Stable policy')
  assert.equal(wire.instructions, 'Summarize only this turn.')
})
