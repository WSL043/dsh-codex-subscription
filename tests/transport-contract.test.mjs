import assert from 'node:assert/strict'
import test from 'node:test'
import { zstdDecompressSync } from 'node:zlib'

import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'

import { openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'

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

test('DSH PiAiAdapter can execute the OAuth-only Codex provider with a refreshed request token', async () => {
  const previousFetch = globalThis.fetch
  let request
  globalThis.fetch = async (input, init) => {
    request = { url: String(input), headers: new Headers(init.headers) }
    return new Response(sse([
      { type: 'response.created', response: { id: 'resp_dsh' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_dsh', role: 'assistant', content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'ok' },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_dsh', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] } },
      { type: 'response.done', response: { id: 'resp_dsh', status: 'completed', output: [], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }

  try {
    const provider = openaiCodexSubscriptionProvider()
    const profiles = new Map([['openai-codex', {
      provider: 'openai-codex',
      displayName: 'ChatGPT subscription',
      piProvider: provider,
      configuredMaxTokens: new Map(),
      transport: 'sse',
      streamIdleTimeoutMs: 10_000,
    }]])
    const adapter = new PiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: async () => jwt('account-dsh'),
    })
    let text = ''
    for await (const chunk of adapter.stream({
      provider: 'openai-codex',
      model: 'gpt-5.6-luna',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      sessionId: 'dsh-session',
    })) {
      if (chunk.type === 'text-delta') text += chunk.text
    }

    assert.equal(text, 'ok')
    assert.equal(request.url, 'https://chatgpt.com/backend-api/codex/responses')
    assert.equal(request.headers.get('chatgpt-account-id'), 'account-dsh')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('subscription fast mode reaches only officially supported Codex model requests', async () => {
  const previousFetch = globalThis.fetch
  const wires = []
  globalThis.fetch = async (_input, init) => {
    wires.push(JSON.parse(zstdDecompressSync(Buffer.from(init.body)).toString('utf8')))
    return new Response(sse([
      { type: 'response.created', response: { id: `resp_${wires.length}` } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: `msg_${wires.length}`, role: 'assistant', content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'ok' },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: `msg_${wires.length}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] } },
      { type: 'response.done', response: { id: `resp_${wires.length}`, status: 'completed', output: [], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }

  try {
    let speedMode = 'fast'
    const provider = openaiCodexSubscriptionProvider({ resolveSpeedMode: () => speedMode })
    const profiles = new Map([['openai-codex', {
      provider: 'openai-codex',
      displayName: 'ChatGPT subscription',
      piProvider: provider,
      configuredMaxTokens: new Map(),
      transport: 'sse',
      streamIdleTimeoutMs: 10_000,
    }]])
    const adapter = new PiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: async () => jwt('account-fast'),
    })
    const run = async modelId => {
      let text = ''
      for await (const chunk of adapter.stream({
        provider: 'openai-codex',
        model: modelId,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
        sessionId: `session-${modelId}`,
      })) {
        if (chunk.type === 'text-delta') text += chunk.text
      }
      assert.equal(text, 'ok')
    }

    await run('gpt-5.6-sol')
    await run('gpt-5.3-codex-spark')
    speedMode = 'standard'
    await run('gpt-5.6-sol')

    assert.equal(wires[0].service_tier, 'priority')
    assert.equal('service_tier' in wires[1], false)
    assert.equal('service_tier' in wires[2], false)
  } finally {
    globalThis.fetch = previousFetch
  }
})
