import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import WebSocket, { WebSocketServer } from 'ws'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { createSubscriptionConnection, tokenScope } from '../src/subscription-connection.js'
import { openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { createCodexNetworkTransport, withCodexNetwork } from '../src/oauth-network.js'

test('SSE leaves the WebSocket constructor untouched; unrelated WebSocket subclasses retain their prototype', async () => {
  const original = globalThis.WebSocket
  class FixtureSocket { constructor(url) { this.url = url } }
  globalThis.WebSocket = FixtureSocket
  try {
    await withCodexNetwork(async () => assert.equal(globalThis.WebSocket, FixtureSocket))
    await withCodexNetwork(async () => {
      class UnrelatedSocket extends globalThis.WebSocket {}
      const socket = new UnrelatedSocket('wss://example.test/')
      assert.ok(socket instanceof UnrelatedSocket)
      assert.ok(socket instanceof FixtureSocket)
    }, { websocket: true })
    assert.equal(globalThis.WebSocket, FixtureSocket)
  } finally { globalThis.WebSocket = original }
})

test('experimental connections keep default SSE and isolate session caches across credentials, proxies and plugin instances', async () => {
  let mode = 'sse', proxy
  const policy = createSubscriptionConnection({ resolveMode: () => mode, resolveProxy: async () => proxy })
  const input = { apiKey: 'token-one', sessionId: 'conversation', transport: 'auto' }
  try {
    assert.equal((await policy.prepare(input)).options.transport, 'sse')
    mode = 'websocket'
    const first = await policy.prepare(input)
    assert.equal(first.options.transport, 'websocket-cached')
    assert.equal(first.options.sessionId, (await policy.prepare(input)).options.sessionId)
    assert.ok(!first.options.sessionId.includes(input.apiKey))
    assert.notEqual(first.options.sessionId, (await policy.prepare({ ...input, apiKey: 'token-two' })).options.sessionId)
    proxy = 'http://localhost:1001'
    assert.notEqual(first.options.sessionId, (await policy.prepare(input)).options.sessionId)
    const second = createSubscriptionConnection({ resolveMode: () => mode, resolveProxy: async () => undefined })
    assert.notEqual(first.options.sessionId, (await second.prepare(input)).options.sessionId)
    second.dispose()
    mode = 'sse'
    assert.equal((await policy.prepare(input)).options.sessionId, 'conversation')
  } finally { policy.dispose() }
})

test('a rejected WebSocket proxy CONNECT falls back through the existing SSE route, without changing global proxy settings', async () => {
  let connects = 0, fetches = 0
  const server = http.createServer()
  server.on('connect', (_request, socket) => { connects++; socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const proxy = `http://127.0.0.1:${server.address().port}`
  const originalWebSocket = globalThis.WebSocket, originalEnv = process.env.HTTPS_PROXY, originalFetch = globalThis.fetch
  const connection = createSubscriptionConnection({ resolveMode: () => 'websocket', resolveProxy: async () => proxy })
  const network = createCodexNetworkTransport({ env: { HTTPS_PROXY: proxy } })
  globalThis.fetch = async (_input, init) => {
    assert.equal(typeof init.dispatcher.dispatch, 'function')
    fetches++
    return new Response('data: {"type":"response.created","response":{"id":"fallback"}}\n\ndata: {"type":"response.done","response":{"id":"fallback","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":0,"total_tokens":1}}}\n\n', { headers: { 'content-type': 'text/event-stream' } })
  }
  const provider = openaiCodexSubscriptionProvider({ connection, runNetwork: network.run })
  const apiKey = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')}.fake`
  try {
    const model = provider.getModels().find(model => model.id === 'gpt-5.6-luna')
    const stream = provider.streamSimple(model, { messages: [{ role: 'user', content: 'test', timestamp: Date.now() }] }, { apiKey, sessionId: 'proxy-failure', signal: AbortSignal.timeout(5000) })
    const events = []
    for await (const event of stream) events.push(event.type)
    assert.ok(events.includes('done'), events.join(','))
    assert.equal(connects, 1)
    assert.equal(fetches, 1)
    assert.equal(connection.snapshot().sseFallbacks, 1)
    assert.equal(connection.snapshot().websocketFailures, 1)
    assert.doesNotMatch(JSON.stringify(connection.snapshot()), /fixture|proxy-failure|responseId|Error/)
    assert.equal(globalThis.WebSocket, originalWebSocket)
    assert.equal(process.env.HTTPS_PROXY, originalEnv)
  } finally { globalThis.fetch = originalFetch; connection.dispose(); await new Promise(resolve => server.close(resolve)) }
})

test('a pending handshake times out and completes via SSE without an unhandled ws error', async () => {
  const server = http.createServer()
  const handshakes = new Set()
  server.on('upgrade', (_request, socket) => {
    handshakes.add(socket)
    socket.once('close', () => handshakes.delete(socket))
    // Deliberately leave the local handshake pending until the client closes.
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const endpoint = `ws://127.0.0.1:${server.address().port}`
  let socket, closeReason, fetches = 0
  class LoopbackSocket extends WebSocket {
    constructor() { super(endpoint); socket = this }
    close(code, reason) {
      closeReason = reason
      return super.close(code, reason)
    }
  }
  const connection = createSubscriptionConnection({ resolveMode: () => 'websocket', resolveProxy: async () => undefined })
  const prepare = connection.prepare
  connection.prepare = async (...args) => {
    const request = await prepare(...args)
    request.options.websocketConnectTimeoutMs = 250
    return request
  }
  const network = createCodexNetworkTransport({ WebSocket: LoopbackSocket, env: {}, platform: 'test' })
  const provider = openaiCodexSubscriptionProvider({ connection, runNetwork: network.run })
  const apiKey = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')}.fake`
  const model = provider.getModels().find(candidate => candidate.id === 'gpt-5.6-luna')
  try {
    const stream = provider.streamSimple(model, { messages: [{ role: 'user', content: 'test', timestamp: 1 }] }, {
      apiKey, sessionId: 'handshake-timeout', signal: AbortSignal.timeout(5000),
      fetch: async () => {
        fetches++
        return new Response('data: {"type":"response.done","response":{"id":"fallback","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":0,"total_tokens":1}}}\n\n', { headers: { 'content-type': 'text/event-stream' } })
      },
    })
    const events = []
    for await (const event of stream) events.push(event.type)
    assert.equal(events.at(-1), 'done', events.join(','))
    assert.equal(fetches, 1)
    assert.equal(connection.snapshot().sseFallbacks, 1)
    assert.ok(socket, 'the SDK must attempt the WebSocket first')
    assert.equal(closeReason, 'connect_timeout')
    assert.equal(socket.readyState, WebSocket.CLOSED)
    assert.equal(socket.listenerCount('error'), 0)
  } finally {
    connection.dispose()
    for (const handshake of handshakes) handshake.destroy()
    await new Promise(resolve => server.close(resolve))
  }
})

test('an advertised WebSocket limit checks the encoded request before send and falls back only for that request', async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  const endpoint = `ws://127.0.0.1:${server.address().port}`
  let limitHeader = '2048', connections = 0, fetches = 0
  const sends = []
  const frames = [
    { type: 'response.created', response: { id: 'accepted' } },
    { type: 'response.done', response: { id: 'accepted', status: 'completed', output: [], usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 } } },
  ]
  server.on('headers', headers => { headers.push(`x-codex-websocket-max-message-bytes: ${limitHeader}`) })
  server.on('connection', socket => {
    connections++
    socket.on('message', message => {
      sends.push({ bytes: message.length, chars: message.toString('utf8').length })
      for (const frame of frames) socket.send(JSON.stringify(frame))
    })
  })
  class LoopbackSocket extends WebSocket {
    constructor() { super(endpoint) }
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    fetches++
    return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }
  const connection = createSubscriptionConnection({ resolveMode: () => 'websocket', resolveProxy: async () => undefined })
  const network = createCodexNetworkTransport({ WebSocket: LoopbackSocket, env: {}, platform: 'test' })
  const provider = openaiCodexSubscriptionProvider({ connection, runNetwork: network.run })
  const apiKey = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')}.fake`
  const model = provider.getModels().find(candidate => candidate.id === 'gpt-5.6-luna')
  const request = async (content, sessionId = 'size-limit') => {
    const events = []
    for await (const event of provider.streamSimple(model, { messages: [{ role: 'user', content, timestamp: 1 }] },
      { apiKey, sessionId, signal: AbortSignal.timeout(5000) })) events.push(event.type)
    assert.ok(events.includes('done'), events.join(','))
  }
  try {
    const unicode = '漢'.repeat(1000)
    await request(unicode)
    assert.equal(connections, 1)
    assert.deepEqual(sends, [])
    assert.equal(fetches, 1)
    await request('small request in the same session')
    assert.equal(connections, 2)
    assert.equal(sends.length, 1)
    assert.ok(sends[0].bytes <= 2048)
    assert.equal(fetches, 1)

    limitHeader = 'invalid'
    await request(unicode, 'invalid-header')
    assert.equal(sends.length, 2)
    assert.ok(sends[1].chars <= 2048)
    assert.ok(sends[1].bytes > 2048)
    assert.equal(fetches, 1)
  } finally {
    globalThis.fetch = originalFetch
    connection.dispose()
    for (const socket of server.clients) socket.terminate()
    await new Promise(resolve => server.close(resolve))
  }
})

for (const closeCode of [1006, 1000]) test(`close ${closeCode} after response acceptance reaches DSH as TRANSPORT without SSE replay`, async () => {
  const originalSocket = globalThis.WebSocket, originalFetch = globalThis.fetch
  let fetches = 0, sends = 0
  class InterruptedSocket extends EventTarget {
    readyState = 1
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))) }
    send() {
      sends++
      queueMicrotask(() => {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'response.created', response: { id: 'accepted' } }) }))
        // Account selection invokes this same connection cleanup, which closes with 1000.
        setImmediate(() => closeCode === 1000 ? connection.dispose() : this.close())
      })
    }
    close(code = 1006, reason = 'fixture disconnect') {
      if (this.readyState === 3) return
      this.readyState = 3
      this.dispatchEvent(Object.assign(new Event('close'), { code, reason, wasClean: code === 1000 }))
    }
  }
  globalThis.WebSocket = InterruptedSocket
  globalThis.fetch = async () => { fetches++; throw Error('must not replay') }
  const connection = createSubscriptionConnection({ resolveMode: () => 'websocket', resolveProxy: async () => undefined })
  const provider = openaiCodexSubscriptionProvider({ connection })
  const apiKey = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')}.fake`
  try {
    const profiles = new Map([['openai-codex', {
      provider: 'openai-codex', piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(), streamIdleTimeoutMs: 3000,
    }]])
    const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => apiKey })
    const chunks = []
    for await (const chunk of adapter.stream({
      provider: 'openai-codex', model: 'gpt-5.6-luna', sessionId: `interrupted-${closeCode}`,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'fixture' }] }], signal: AbortSignal.timeout(3000),
    })) chunks.push(chunk)
    const failure = chunks.find(chunk => chunk.reason?.failure)?.reason.failure
    assert.equal(failure?.code, 'TRANSPORT', JSON.stringify(failure))
    assert.ok(failure.message.startsWith(`Network transport failure: WebSocket closed ${closeCode}`))
    assert.equal(sends, 1)
    assert.equal(fetches, 0)
  } finally { connection.dispose();globalThis.WebSocket=originalSocket;globalThis.fetch=originalFetch }
})

test('a refreshed token for the same account keeps the same socket and cache key', async () => {
  const jwt = account => `h.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: account }, iat: Math.random() })).toString('base64url')}.s`
  assert.equal(tokenScope(jwt('acct-1')), tokenScope(jwt('acct-1')))
  assert.notEqual(tokenScope(jwt('acct-1')), tokenScope(jwt('acct-2')))
  assert.equal(tokenScope('opaque-token'), 'token:opaque-token')
  const connection = createSubscriptionConnection({ resolveMode: () => 'websocket', resolveProxy: async () => undefined })
  const first = await connection.prepare({ sessionId: 's', apiKey: jwt('acct-1') })
  const second = await connection.prepare({ sessionId: 's', apiKey: jwt('acct-1') })
  const other = await connection.prepare({ sessionId: 's', apiKey: jwt('acct-2') })
  assert.equal(first.options.sessionId, second.options.sessionId)
  assert.notEqual(first.options.sessionId, other.options.sessionId)
  connection.dispose()
})

test('cached WebSocket sends only the appended input and replays full input after edits or reconnect (refs #275)', async () => {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await once(server, 'listening')
  const endpoint = `ws://127.0.0.1:${server.address().port}`
  const wires = []
  server.on('connection', socket => socket.on('message', bytes => {
    wires.push({ body: JSON.parse(bytes.toString()), bytes: bytes.length })
    const id = `resp_${wires.length}`
    socket.send(JSON.stringify({ type: 'response.created', response: { id } }))
    socket.send(JSON.stringify({ type: 'response.done', response: { id, status: 'completed', output: [], usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 } } }))
  }))
  class LoopbackSocket extends WebSocket { constructor() { super(endpoint) } }
  const connection = createSubscriptionConnection({ resolveMode: () => 'websocket', resolveProxy: async () => undefined })
  const network = createCodexNetworkTransport({ WebSocket: LoopbackSocket, env: {}, platform: 'test' })
  const provider = openaiCodexSubscriptionProvider({ connection, runNetwork: network.run })
  const apiKey = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')}.fake`
  const model = provider.getModels().find(candidate => candidate.id === 'gpt-5.6-luna')
  const user = content => ({ role: 'user', content, timestamp: 1 })
  const request = async messages => {
    let answer
    for await (const event of provider.streamSimple(model, { messages }, { apiKey, sessionId: 'delta-history', signal: AbortSignal.timeout(5000) })) {
      if (event.type === 'error') assert.fail(event.error?.errorMessage)
      if (event.type === 'done') answer = event.message
    }
    assert.ok(answer)
    return answer
  }
  try {
    let messages = [user('archived dummy data '.repeat(4000))]
    messages.push(await request(messages), user('follow-up'))
    const second = await request(messages)
    assert.equal(wires[0].body.previous_response_id, undefined)
    assert.equal(wires[1].body.previous_response_id, 'resp_1')
    assert.equal(wires[1].body.input.length, 1)
    assert.ok(wires[1].bytes < wires[0].bytes / 20)
    messages = [{ ...messages[0], content: messages[0].content + ' edited prefix' }, ...messages.slice(1), second, user('after edit')]
    messages.push(await request(messages), user('after reconnect'))
    assert.equal(wires[2].body.previous_response_id, undefined)
    assert.ok(wires[2].bytes >= wires[0].bytes)
    await Promise.all([...server.clients].map(socket => { const closed = once(socket, 'close'); socket.close(); return closed }))
    await request(messages)
    assert.equal(wires[3].body.previous_response_id, undefined)
    assert.ok(wires[3].bytes >= wires[0].bytes)
    assert.equal(connection.snapshot().deltaRequests, 1)
  } finally {
    connection.dispose()
    for (const socket of server.clients) socket.terminate()
    await new Promise(resolve => server.close(resolve))
  }
})
