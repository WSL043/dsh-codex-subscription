import assert from 'node:assert/strict'
import test from 'node:test'
import { zstdDecompressSync } from 'node:zlib'

import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import * as piAi from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'

import { DshOAuthCredentialStore } from '../src/credential-store.js'
import { createModels, openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import {
  CONTEXT_MODE_CUSTOM,
  CONTEXT_MODE_EXTENDED,
  CONTEXT_MODE_STANDARD,
  normalizeInputImageDetail,
} from '../src/settings-contract.js'

// pi-ai 0.87 reads the system prompt and tools from a leading system message; older releases read the context fields.
const wireContext = context => typeof piAi.normalizeContext === 'function' ? piAi.normalizeContext(context) : context

const jwt = accountId => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({
    'https://api.openai.com/auth': { chatgpt_account_id: accountId },
  })}.signature`
}

const sse = events => `${events.map(event => `data: ${JSON.stringify(event)}`).join('\n\n')}\n\n`
const pixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

test('input image detail normalization falls back to auto for unknown values', () => {
  assert.equal(normalizeInputImageDetail('low'), 'low')
  assert.equal(normalizeInputImageDetail('original'), 'original')
  assert.equal(normalizeInputImageDetail('unknown'), 'auto')
  assert.equal(normalizeInputImageDetail(undefined), 'auto')
})

const memoryCredentials = initial => {
  let value = initial
  return {
    async resolve() { return value === undefined ? undefined : { value } },
    async set(_ref, next) { value = next },
    async unset() { value = undefined },
    read() { return value },
  }
}

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
    for await (const event of provider.streamSimple(model, wireContext({
      systemPrompt: 'Stable prefix',
      messages: [{ role: 'user', content: 'hello', timestamp: 1 }],
    }), {
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
    const networkAreas = []
    const provider = openaiCodexSubscriptionProvider({
      runNetwork: (area, operation) => {
        networkAreas.push(area)
        return operation()
      },
    })
    const profiles = new Map([['openai-codex', {
      provider: 'openai-codex',
      displayName: 'ChatGPT subscription',
      piProvider: provider,
      configuredMaxTokens: new Map(), modelErrors: new Map(),
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
    assert.ok(networkAreas.length > 0)
    assert.deepEqual(new Set(networkAreas), new Set(['model']))
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('a near-expiry OAuth token refreshes before the first model request is dispatched', async () => {
  const previousFetch = globalThis.fetch
  const oldAccess = jwt('account-old')
  const refreshedAccess = jwt('account-refreshed')
  const persisted = memoryCredentials(JSON.stringify({
    type: 'oauth',
    access: oldAccess,
    refresh: 'refresh-old',
    expires: Date.now() + 30_000,
    accountId: 'account-old',
  }))
  const store = new DshOAuthCredentialStore(persisted, 'CODEX_OAUTH', [], { expirySkewMs: 60_000 })
  const requestOrder = []
  const baseAuthProvider = openaiCodexSubscriptionProvider()
  const authProvider = {
    ...baseAuthProvider,
    auth: {
      ...baseAuthProvider.auth,
      oauth: {
        ...baseAuthProvider.auth.oauth,
        async refresh() {
          requestOrder.push('refresh')
          return {
            type: 'oauth',
            access: refreshedAccess,
            refresh: 'refresh-new',
            expires: Date.now() + 3_600_000,
            accountId: 'account-refreshed',
          }
        },
      },
    },
  }
  const authModels = createModels({ credentials: store })
  authModels.setProvider(authProvider)

  globalThis.fetch = async (_input, init) => {
    requestOrder.push('model')
    const headers = new Headers(init.headers)
    assert.equal(headers.get('chatgpt-account-id'), 'account-refreshed')
    return new Response(sse([
      { type: 'response.created', response: { id: 'resp_refresh' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_refresh', role: 'assistant', content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'ok' },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_refresh', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] } },
      { type: 'response.done', response: { id: 'resp_refresh', status: 'completed', output: [], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }

  try {
    const requestProvider = openaiCodexSubscriptionProvider()
    const profiles = new Map([['openai-codex', {
      provider: 'openai-codex',
      displayName: 'ChatGPT subscription',
      piProvider: requestProvider,
      configuredMaxTokens: new Map(), modelErrors: new Map(),
      transport: 'sse',
      streamIdleTimeoutMs: 10_000,
    }]])
    const adapter = new PiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: async () => (await authModels.getAuth('openai-codex'))?.auth.apiKey,
    })
    for await (const _chunk of adapter.stream({
      provider: 'openai-codex',
      model: 'gpt-5.6-luna',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      sessionId: 'refresh-before-request',
    })) {}

    assert.deepEqual(requestOrder, ['refresh', 'model'])
    assert.equal(JSON.parse(persisted.read()).refresh, 'refresh-new')
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
      configuredMaxTokens: new Map(), modelErrors: new Map(),
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

test('output detail reaches only verbosity-capable Codex requests', async () => {
  const previousFetch = globalThis.fetch
  const wires = []
  globalThis.fetch = async (_input, init) => {
    wires.push(JSON.parse(zstdDecompressSync(Buffer.from(init.body)).toString('utf8')))
    return new Response(sse([
      { type: 'response.created', response: { id: `resp_v${wires.length}` } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: `msg_v${wires.length}`, role: 'assistant', content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'ok' },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: `msg_v${wires.length}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] } },
      { type: 'response.done', response: { id: `resp_v${wires.length}`, status: 'completed', output: [], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    let outputVerbosity = 'high'
    const provider = openaiCodexSubscriptionProvider({ resolveOutputVerbosity: () => outputVerbosity })
    const profiles = new Map([['openai-codex', {
      provider: 'openai-codex', displayName: 'ChatGPT subscription', piProvider: provider,
      configuredMaxTokens: new Map(), modelErrors: new Map(), transport: 'sse', streamIdleTimeoutMs: 10_000,
    }]])
    const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => jwt('account-verbosity') })
    const run = async model => {
      for await (const _chunk of adapter.stream({
        provider: 'openai-codex', model, messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }], sessionId: `verbosity-${model}-${wires.length}`,
      })) {}
    }
    await run('gpt-5.6-sol')
    outputVerbosity = 'low'
    await run('gpt-5.6-sol')
    await run('gpt-5.3-codex-spark')
    assert.equal(wires[0].text.verbosity, 'high')
    assert.equal(wires[1].text.verbosity, 'low')
    assert.equal(wires[2].text.verbosity, 'low', 'Spark retains the audited pi-ai wire default when the catalog does not advertise verbosity')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('Codex requests never carry temperature, which the backend rejects', async () => {
  const previousFetch = globalThis.fetch
  const wires = []
  globalThis.fetch = async (_input, init) => {
    wires.push(JSON.parse(zstdDecompressSync(Buffer.from(init.body)).toString('utf8')))
    return new Response(sse([
      { type: 'response.created', response: { id: 'resp_t' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_t', role: 'assistant', content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'ok' },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_t', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] } },
      { type: 'response.done', response: { id: 'resp_t', status: 'completed', output: [], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    const provider = openaiCodexSubscriptionProvider()
    const profiles = new Map([['openai-codex', {
      provider: 'openai-codex', displayName: 'ChatGPT subscription', piProvider: provider,
      configuredMaxTokens: new Map(), modelErrors: new Map(), transport: 'sse', streamIdleTimeoutMs: 10_000,
    }]])
    const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => jwt('account-temperature') })
    for await (const _chunk of adapter.stream({
      provider: 'openai-codex', model: 'gpt-5.6-sol', temperature: 0,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'review' }] }], sessionId: 'temperature-review',
    })) {}
    assert.equal(wires.length, 1)
    assert.equal('temperature' in wires[0], false)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('official reviewer routes only DSH Auto review calls to the catalog reviewer model', async () => {
  const previousFetch = globalThis.fetch
  const wires = []
  globalThis.fetch = async (_input, init) => {
    wires.push(JSON.parse(zstdDecompressSync(Buffer.from(init.body)).toString('utf8')))
    return new Response(sse([
      { type: 'response.created', response: { id: 'resp_r' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_r', role: 'assistant', content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: '{"risk":"low","decision":"allow"}' },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_r', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '{"risk":"low","decision":"allow"}', annotations: [] }] } },
      { type: 'response.done', response: { id: 'resp_r', status: 'completed', output: [], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    let reviewModel = 'official'
    let route = { id: 'codex-auto-review', effort: 'low' }
    const catalog = { getModels: () => openaiCodexProvider().getModels(), metadata: () => undefined, reviewModel: parent => { assert.equal(parent, 'gpt-5.6-sol'); return route } }
    const provider = openaiCodexSubscriptionProvider({ resolveReviewModel: () => reviewModel, resolveSpeedMode: () => 'fast', catalog })
    const model = provider.getModels().find(candidate => candidate.id === 'gpt-5.6-sol')
    // DSH's adapter hands the reviewer policy over as `systemPrompt`.
    const run = async systemPrompt => {
      for await (const _chunk of provider.streamSimple(model,
        { systemPrompt, messages: [{ role: 'user', content: 'pending action', timestamp: 1 }] },
        { apiKey: jwt('account-review'), temperature: 0, sessionId: 'review' })) {}
    }
    const policy = 'REVIEW_POLICY\nYou are the final authorization reviewer for exactly one pending tool call.'
    await run(policy)
    await run('You are a helpful assistant.')
    route = undefined
    await run(policy)
    reviewModel = 'session'
    route = { id: 'codex-auto-review', effort: 'low' }
    await run(policy)
    assert.equal(wires[0].model, 'codex-auto-review')
    assert.equal(wires[0].reasoning?.effort, 'low')
    for (const key of ['temperature', 'service_tier', 'text']) assert.equal(key in wires[0], false, key)
    assert.equal(wires[1].model, 'gpt-5.6-sol', 'ordinary requests keep the conversation model')
    assert.equal(wires[1].service_tier, 'priority')
    assert.equal(wires[2].model, 'gpt-5.6-sol', 'without a catalog reviewer the session model reviews')
    assert.equal(wires[3].model, 'gpt-5.6-sol', 'the default setting keeps the session model')
    assert.deepEqual(provider.reviewCounters(), { requests: 2, routed: 1, sessionModel: 1, retries: 0 })
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('a DSH Auto review that drops before its answer is retried without leaking the failed attempt', async () => {
  const previousFetch = globalThis.fetch
  let calls = 0
  const answer = '{"risk":"low","decision":"allow"}'
  globalThis.fetch = async () => {
    calls += 1
    const events = calls === 1
      ? [{ type: 'response.created', response: { id: 'resp_d' } },
        { type: 'error', message: 'upstream stream ended before a completion event; this turn may be incomplete' }]
      : [{ type: 'response.created', response: { id: 'resp_ok' } },
        { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_ok', role: 'assistant', content: [] } },
        { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: answer },
        { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_ok', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: answer, annotations: [] }] } },
        { type: 'response.done', response: { id: 'resp_ok', status: 'completed', output: [], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } }]
    return new Response(sse(events), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    const provider = openaiCodexSubscriptionProvider()
    const model = provider.getModels().find(candidate => candidate.id === 'gpt-5.6-sol')
    const context = { systemPrompt: 'REVIEW_POLICY' + String.fromCharCode(10) + 'You are the final authorization reviewer for exactly one pending tool call.', messages: [{ role: 'user', content: 'pending action', timestamp: 1 }] }
    const events = []
    for await (const event of provider.streamSimple(model, context, { apiKey: jwt('account-retry'), sessionId: 'review-retry' })) events.push(event)
    assert.equal(calls, 2)
    assert.equal(events.some(event => event.type === 'error'), false, 'the dropped attempt stays hidden')
    assert.equal(events.at(-1).type, 'done')
    assert.equal(events.at(-1).message.content.find(part => part.type === 'text')?.text, answer)
    assert.equal(provider.reviewCounters().retries, 1)

    calls = 0
    globalThis.fetch = async () => { calls += 1; return new Response(sse([{ type: 'error', message: 'upstream stream ended before a completion event' }]), { status: 200, headers: { 'content-type': 'text/event-stream' } }) }
    const failed = []
    for await (const event of provider.streamSimple(model, context, { apiKey: jwt('account-retry'), sessionId: 'review-retry' })) failed.push(event)
    assert.equal(calls, 3, 'two retries, then the failure reaches DSH so it can fail closed')
    assert.equal(failed.at(-1).type, 'error')

    calls = 0
    const ordinary = []
    for await (const event of provider.streamSimple(model, { messages: context.messages }, { apiKey: jwt('account-retry'), sessionId: 'chat' })) ordinary.push(event)
    assert.equal(calls, 1, 'ordinary turns keep DSH retry semantics')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('input image detail follows the selected level on each Codex request', async () => {
  const previousFetch = globalThis.fetch
  const wires = []
  let nativeAutoDetail
  globalThis.fetch = async (_input, init) => {
    wires.push(JSON.parse(zstdDecompressSync(Buffer.from(init.body)).toString('utf8')))
    return new Response(sse([
      { type: 'response.created', response: { id: `resp_i${wires.length}` } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: `msg_i${wires.length}`, role: 'assistant', content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'ok' },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: `msg_i${wires.length}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] } },
      { type: 'response.done', response: { id: `resp_i${wires.length}`, status: 'completed', output: [], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    let detail = 'auto'
    const provider = openaiCodexSubscriptionProvider({ resolveInputImageDetail: () => detail })
    const model = provider.getModels().find(value => value.id === 'gpt-5.6-sol')
    assert.ok(model)
    for (const value of ['auto', 'low', 'high', 'original']) {
      detail = value
      for await (const _event of provider.streamSimple(model, {
        systemPrompt: 'Image detail check',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Inspect this image' }, { type: 'image', mimeType: 'image/png', data: pixelPng }], timestamp: 1 },
          { role: 'assistant', provider: model.provider, api: model.api, model: model.id, content: [{ type: 'toolCall', id: 'call_image|fc_image', name: 'inspect', arguments: {} }], usage: { totalTokens: 0 }, timestamp: 2 },
          { role: 'toolResult', toolCallId: 'call_image|fc_image', toolName: 'inspect', content: [{ type: 'text', text: 'Tool image' }, { type: 'image', mimeType: 'image/png', data: pixelPng }], timestamp: 3 },
        ],
      }, {
        apiKey: jwt('account-images'), sessionId: `image-${value}`, transport: 'sse',
        onPayload: payload => {
          if (value === 'auto') nativeAutoDetail = payload.input[0].content.find(part => part.type === 'input_image')?.detail
          return payload
        },
      })) {
        if (_event.type === 'error') throw _event.error
      }
    }
    const levels = ['auto', 'low', 'high', 'original']
    assert.deepEqual(wires.map(wire => wire.input[0].content.find(part => part.type === 'input_image').detail), levels)
    assert.deepEqual(wires.map(wire => wire.input.find(item => item.type === 'function_call_output').output.find(part => part.type === 'input_image').detail), levels)
    assert.equal(wires[0].input[0].content[0].text, 'Inspect this image')
    assert.equal(wires[0].input[0].content.find(part => part.type === 'input_image').detail, nativeAutoDetail, 'auto leaves the pi-ai native image detail unchanged')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('context presets preserve catalog defaults and cap every supported model independently', () => {
  let contextMode = CONTEXT_MODE_STANDARD
  let customContextWindow = 500_000
  const perModel = new Map()
  const provider = openaiCodexSubscriptionProvider({
    resolveContextMode: () => contextMode,
    resolveCustomContextWindow: modelKey => perModel.get(modelKey) ?? customContextWindow,
  })
  const contexts = () => Object.fromEntries(provider.getModels().map(model => [model.id, model.contextWindow]))
  // The bundled model list changes between pi-ai releases; check the audited ids that this one still ships.
  const expectContexts = (actual, expected) => {
    const shipped = Object.fromEntries(Object.entries(expected).filter(([id]) => id in actual))
    assert.ok(Object.keys(shipped).length >= 3, 'the installed pi-ai still ships at least three audited models')
    assert.partialDeepStrictEqual(actual, shipped)
  }

  expectContexts(contexts(), {
    'gpt-5.3-codex-spark': 128_000,
    'gpt-5.4': 272_000,
    'gpt-5.4-mini': 272_000,
    'gpt-5.5': 272_000,
    'gpt-5.6-luna': 272_000,
    'gpt-5.6-sol': 272_000,
    'gpt-5.6-terra': 272_000,
  })

  if ('gpt-6-astra' in contexts()) assert.equal(contexts()['gpt-6-astra'], 272_000)
  contextMode = CONTEXT_MODE_EXTENDED
  expectContexts(contexts(), {
    'gpt-5.3-codex-spark': 128_000,
    'gpt-5.4': 1_000_000,
    'gpt-5.4-mini': 400_000,
    'gpt-5.5': 1_000_000,
    'gpt-5.6-luna': 1_000_000,
    'gpt-5.6-sol': 1_000_000,
    'gpt-5.6-terra': 1_000_000,
  })

  if ('gpt-6-astra' in contexts()) assert.equal(contexts()['gpt-6-astra'], 872_000)
  contextMode = CONTEXT_MODE_CUSTOM
  perModel.set('gpt-5.4-mini', 300_000)
  perModel.set('gpt-5.6', 750_000)
  expectContexts(contexts(), {
    'gpt-5.3-codex-spark': 128_000,
    'gpt-5.4': 500_000,
    'gpt-5.4-mini': 300_000,
    'gpt-5.5': 500_000,
    'gpt-5.6-luna': 750_000,
    'gpt-5.6-sol': 750_000,
    'gpt-5.6-terra': 750_000,
  })

  if ('gpt-6-astra' in contexts()) assert.equal(contexts()['gpt-6-astra'], 500_000)
  customContextWindow = 64_000
  assert.equal(contexts()['gpt-5.5'], 128_000)
  perModel.set('gpt-5.5', 200_000)
  assert.equal(contexts()['gpt-5.5'], 200_000)
})

test('the Ultrafast tier reaches the wire only for a model the account catalog lists it for', async () => {
  const previousFetch = globalThis.fetch
  const wires = []
  globalThis.fetch = async (_input, init) => {
    wires.push(JSON.parse(zstdDecompressSync(Buffer.from(init.body)).toString('utf8')))
    return new Response(sse([
      { type: 'response.created', response: { id: `resp_u${wires.length}` } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: `msg_u${wires.length}`, role: 'assistant', content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'ok' },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: `msg_u${wires.length}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] } },
      { type: 'response.done', response: { id: `resp_u${wires.length}`, status: 'completed', output: [], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    let speedMode = 'ultrafast'
    const metadata = { 'gpt-6-astra': { supportsFast: true, supportsUltrafast: true }, 'gpt-6-sol': { supportsFast: true, supportsUltrafast: false } }
    const base = openaiCodexProvider().getModels()[0]
    const catalog = {
      getModels: () => Object.keys(metadata).map(id => ({ ...base, id, name: id })),
      metadata: id => metadata[id],
    }
    const provider = openaiCodexSubscriptionProvider({ catalog, resolveSpeedMode: () => speedMode })
    const profiles = new Map([['openai-codex', {
      provider: 'openai-codex', displayName: 'ChatGPT subscription', piProvider: provider,
      configuredMaxTokens: new Map(), modelErrors: new Map(), transport: 'sse', streamIdleTimeoutMs: 10_000,
    }]])
    const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => jwt('account-ultra') })
    const run = async modelId => {
      for await (const chunk of adapter.stream({
        provider: 'openai-codex', model: modelId,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }], sessionId: `session-u-${modelId}`,
      })) void chunk
    }
    await run('gpt-6-astra')
    await run('gpt-6-sol')
    speedMode = 'fast'
    await run('gpt-6-astra')
    assert.equal(wires[0].service_tier, 'ultrafast')
    assert.equal('service_tier' in wires[1], false, 'a model without the tier stays standard, never downgraded to another tier')
    assert.equal(wires[2].service_tier, 'priority')
  } finally {
    globalThis.fetch = previousFetch
  }
})
