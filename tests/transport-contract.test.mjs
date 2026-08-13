import assert from 'node:assert/strict'
import test from 'node:test'

import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'

const jwt = accountId => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({
    'https://api.openai.com/auth': { chatgpt_account_id: accountId },
  })}.signature`
}

const sse = events => `${events.map(event => `data: ${JSON.stringify(event)}`).join('\n\n')}\n\n`

test('pi-ai Codex wire keeps a stable cache key, stateless storage, and server cache usage', async () => {
  const previousFetch = globalThis.fetch
  let wire
  let request
  globalThis.fetch = async (input, init) => {
    request = { url: String(input), headers: new Headers(init.headers) }
    return new Response(sse([
      { type: 'response.created', response: { id: 'resp_1' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'ok' },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] } },
      { type: 'response.done', response: { id: 'resp_1', status: 'completed', output: [], usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 80 }, output_tokens: 5, total_tokens: 105 } } },
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }

  try {
    const provider = openaiCodexProvider()
    const model = provider.getModels().find(model => model.id === 'gpt-5.6-luna')
    assert.ok(model)
    let final
    for await (const event of provider.streamSimple(model, {
      systemPrompt: 'Stable prefix',
      messages: [{ role: 'user', content: 'hello', timestamp: 1 }],
    }, {
      apiKey: jwt('account-1'),
      sessionId: 'session-stable',
      cacheRetention: 'short',
      transport: 'sse',
      onPayload(payload) { wire = structuredClone(payload) },
    })) {
      if (event.type === 'done') final = event.message
    }

    assert.equal(request.url, 'https://chatgpt.com/backend-api/codex/responses')
    assert.equal(request.headers.get('chatgpt-account-id'), 'account-1')
    assert.equal(request.headers.get('session-id'), 'session-stable')
    assert.equal(wire.store, false)
    assert.equal(wire.prompt_cache_key, 'session-stable')
    assert.deepEqual(wire.include, ['reasoning.encrypted_content'])
    assert.equal(wire.instructions, 'Stable prefix')
    assert.equal(final.usage.cacheRead, 80)
    assert.equal(final.usage.input, 20)
  } finally {
    globalThis.fetch = previousFetch
  }
})
