import assert from 'node:assert/strict'
import test from 'node:test'
import { constants, zstdCompressSync } from 'node:zlib'

import { withCodexNetwork, createCodexNetworkTransport } from '../src/oauth-network.js'
import { openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'

const endpoint = 'https://chatgpt.com/backend-api/codex/responses'
const compressed = body => {
  const bytes = zstdCompressSync(body, { params: { [constants.ZSTD_c_compressionLevel]: 3 } })
  return { method: 'POST', body: bytes, headers: { 'content-type': 'application/json', 'content-encoding': 'zstd', 'content-length': String(bytes.length), authorization: 'Bearer fixture' } }
}

test('Codex SSE sends identical JSON bytes once through the host chain or explicit proxy (refs #261)', async () => {
  const originalFetch = globalThis.fetch
  const json = Buffer.from(JSON.stringify({ model: 'fixture', input: [{ type: 'compaction', encrypted_content: 'opaque-checkpoint' }, { role: 'user', content: [{ type: 'input_text', text: '日本語 中文' }, { type: 'input_image', image_url: 'data:image/png;base64,' + 'abcD'.repeat(1_400_000) }] }] }) + ' \n')
  for (const dedicated of [false, true]) {
    let calls = 0
    const sentBytes = []
    const init = compressed(json), signal = new AbortController().signal
    init.signal = signal
    init.dispatcher = { fixture: true }
    const inspect = async (input, outgoing) => {
      calls++
      assert.equal(input, endpoint)
      assert.deepEqual(outgoing.body, json)
      assert.equal(outgoing.signal, signal)
      assert.equal(outgoing.dispatcher, init.dispatcher)
      const headers = new Headers(outgoing.headers)
      assert.equal(headers.get('content-encoding'), null)
      assert.equal(headers.get('content-length'), null)
      assert.equal(headers.get('authorization'), 'Bearer fixture')
      assert.equal(headers.get('content-type'), 'application/json')
      return new Response('invalid-parameter', { status: 400 })
    }
    const response = await withCodexNetwork(fetch => fetch(endpoint, init), {
      requestFetch: true, env: {}, platform: 'test',
      onModelRequestBytes: bytes => sentBytes.push(bytes),
      ...(dedicated ? { modelSseProxy: 'http://127.0.0.1:7890', fetchThroughProxy: inspect, fallbackFetch: () => assert.fail('proxy bypassed') } : { fallbackFetch: inspect }),
    })
    assert.equal(response.status, 400)
    assert.equal(await response.text(), 'invalid-parameter')
    assert.equal(calls, 1, 'rejected requests must not be retried')
    assert.deepEqual(sentBytes, [json.length], 'diagnostics count the final outgoing body, not the smaller SDK zstd buffer (refs #275)')
    assert.equal(init.headers['content-encoding'], 'zstd', 'the caller keeps its original request')
    assert.equal(globalThis.fetch, originalFetch)
  }
})

test('request decoding is limited to request-local POSTs on the exact Codex inference endpoint', async () => {
  const init = compressed('{}')
  const otherEndpoints = ['https://auth.openai.com/oauth/token', 'https://chatgpt.com/backend-api/wham/usage', 'https://chatgpt.com/backend-api/images/generations', 'https://chatgpt.com/backend-api/codex/responses/compact', 'https://chatgpt.com/backend-api/wham/remote/control/server/pair/status', 'https://example.test/backend-api/codex/responses', 'http://chatgpt.com/backend-api/codex/responses', 'https://chatgpt.com:8443/backend-api/codex/responses']
  await withCodexNetwork(async fetch => {
    for (const url of otherEndpoints) await fetch(url, init)
    await fetch(endpoint, { ...init, method: 'PUT' })
    await fetch(endpoint, { ...init, headers: { 'content-encoding': 'gzip' } })
  }, { requestFetch: true, env: {}, platform: 'test', fallbackFetch: async (_url, outgoing) => {
    assert.equal(outgoing.body, init.body)
    return new Response('ok')
  } })
})

test('Request bodies can be decoded without consuming the caller or losing its fetch options', async () => {
  const init = compressed('{ "input" : [] }\n')
  const input = new Request(endpoint, init)
  const dispatcher = { fixture: true }
  await withCodexNetwork(fetch => fetch(input, { dispatcher }), {
    requestFetch: true, env: {}, platform: 'test', fallbackFetch: async (received, outgoing) => {
      assert.equal(received, input)
      assert.equal(outgoing.dispatcher, dispatcher)
      assert.equal(new Headers(outgoing.headers).get('content-encoding'), null)
      assert.equal(Buffer.from(outgoing.body).toString(), '{ "input" : [] }\n')
      return new Response('ok')
    },
  })
  assert.equal(input.bodyUsed, false)
  assert.deepEqual(Buffer.from(await input.arrayBuffer()), init.body)
})

test('aborted and corrupt compressed requests do not reach the network', async () => {
  const controller = new AbortController()
  controller.abort()
  const options = { requestFetch: true, env: {}, platform: 'test', fallbackFetch: () => assert.fail('request was sent') }
  await assert.rejects(withCodexNetwork(fetch => fetch(endpoint, { ...compressed('{}'), signal: controller.signal }), options), error => error === controller.signal.reason)
  await assert.rejects(withCodexNetwork(fetch => fetch(endpoint, { ...compressed('{}'), body: Buffer.from('invalid zstd') }), options))
})

test('plain JSON and HTTP authentication/rate-limit failures preserve single-send behavior', async () => {
  for (const status of [200, 400, 401, 403, 429, 500]) {
    let calls = 0
    const init = { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }
    const response = await withCodexNetwork(fetch => fetch(endpoint, init), {
      requestFetch: true, env: {}, platform: 'test', fallbackFetch: async (_url, outgoing) => {
        calls++
        assert.equal(outgoing, init)
        return new Response('same-error', { status })
      },
    })
    assert.equal(response.status, status)
    assert.equal(calls, 1)
  }
})

test('real pi-ai SSE and WebSocket fallback reach host middleware with plain JSON and redacted diagnostics', async () => {
  for (const transport of ['sse', 'websocket']) {
    const seen = []
    const item = { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }
    class UnavailableSocket { constructor() { throw new Error('fixture: connection unavailable') } }
    const fakeFetch = async (_url, init) => {
      assert.equal(new Headers(init.headers).get('content-encoding'), null)
      const body = JSON.parse(Buffer.from(init.body).toString())
      seen.push(body)
      const events = [
        { type: 'response.created', response: { id: 'resp_fixture' } },
        { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
        { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'ok' },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.done', response: { id: 'resp_fixture', status: 'completed', output: [item], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
      ]
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
    }
    const network = createCodexNetworkTransport({ env: {}, platform: 'test', WebSocket: UnavailableSocket })
    const provider = openaiCodexSubscriptionProvider({ runNetwork: network.run, beginModelAttempt: network.beginModelAttempt, connection: { prepare: async options => ({ options, network: { websocket: transport === 'websocket', WebSocket: UnavailableSocket } }) } })
    const apiKey = 'e30.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url') + '.fixture'
    const events = []
    for await (const event of provider.streamSimple(provider.getModels().find(model => model.id === 'gpt-5.6-luna'), { messages: [{ role: 'user', content: 'private prompt fixture', timestamp: 0 }] }, { apiKey, transport, fetch: fakeFetch })) events.push(event)
    assert.equal(events.at(-1)?.type, 'done', JSON.stringify(events.at(-1)))
    assert.equal(seen.length, 1)
    assert.equal(network.snapshot().model.requestCompression, 'zstd-decoded')
    assert.equal(network.history().events.at(-1).requestCompression, 'zstd-decoded')
    assert.equal(network.snapshot().model.status, 'ok')
    assert.equal(JSON.stringify(network.history()).includes('private prompt fixture'), false)
  }
})
