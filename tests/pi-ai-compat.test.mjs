import assert from 'node:assert/strict'
import test from 'node:test'

import { hoistLeadingSystem, understandsSystemMessages } from '../src/pi-ai-compat.js'
import { openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'

test('only pi-ai 0.87 and later understand system messages in the transcript', () => {
  for (const version of ['0.85.1', '0.86.9', undefined, 'x']) assert.equal(understandsSystemMessages(version), false, String(version))
  for (const version of ['0.87.0', '0.87.1', '1.0.2', '1.2.0']) assert.equal(understandsSystemMessages(version), true, version)
})

test('leading system messages fold back into systemPrompt and tools, the rest of the transcript stays', () => {
  const tool = { name: 'read', description: 'd', parameters: { type: 'object', properties: {} } }
  const folded = hoistLeadingSystem({
    messages: [
      { role: 'system', content: 'Be brief.', sections: { env: 'Windows' }, toolsAdded: [tool], timestamp: 0 },
      { role: 'system', content: [{ type: 'text', text: 'More.' }, { type: 'image' }], timestamp: 0 },
      { role: 'user', content: 'hi', timestamp: 1 },
      { role: 'system', content: 'a later update stays in the history', timestamp: 2 },
    ],
  })
  assert.equal(folded.systemPrompt, 'Be brief.\n\nWindows\n\nMore.')
  assert.deepEqual(folded.tools, [tool])
  assert.deepEqual(folded.messages.map(message => message.role), ['user', 'system'])
  const plain = { systemPrompt: 'p', messages: [{ role: 'user', content: 'hi', timestamp: 1 }] }
  assert.equal(hoistLeadingSystem(plain), plain, 'a context that already has the old shape is left alone')
  assert.deepEqual(hoistLeadingSystem({ systemPrompt: 'a', messages: [{ role: 'system', content: 'b', timestamp: 0 }, { role: 'user', content: 'c', timestamp: 1 }] }).systemPrompt, 'a\n\nb')
})

test('the request that failed in issue 166 now reaches pi-ai in a form it can size', async () => {
  // A session-title request as an adapter from 0.2.1-alpha.2 hands it over: the system prompt is the first message.
  const previous = globalThis.fetch
  let sent
  globalThis.fetch = async (_url, init) => { sent = init; return new Response('data: {"type":"response.completed","response":{"id":"r","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }) }
  try {
    const provider = openaiCodexSubscriptionProvider()
    const apiKey = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')}.fake`
    const events = []
    for await (const event of provider.streamSimple(provider.getModels()[0], {
      messages: [{ role: 'system', content: 'Write a short title.', timestamp: 0 }, { role: 'user', content: 'Fix the login test', timestamp: 0 }],
    }, { apiKey, transport: 'sse', maxTokens: 64 })) events.push(event)
    assert.equal(events.some(event => event.type === 'error'), false, JSON.stringify(events.find(event => event.type === 'error')?.error?.errorMessage))
    assert.ok(sent, 'the request went out')
  } finally { globalThis.fetch = previous }
})
