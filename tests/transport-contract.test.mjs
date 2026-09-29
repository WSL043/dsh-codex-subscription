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
  assert.equal(contexts()['gpt-5.4'], 128_000)
  perModel.set('gpt-5.4-mini', 200_000)
  assert.equal(contexts()['gpt-5.4-mini'], 200_000)
})
