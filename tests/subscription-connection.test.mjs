import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createSubscriptionConnection } from '../src/subscription-connection.js'
import { openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { createCodexNetworkTransport } from '../src/oauth-network.js'

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
  const originalWebSocket = globalThis.WebSocket, originalEnv = process.env.HTTPS_PROXY
  const connection = createSubscriptionConnection({ resolveMode: () => 'websocket', resolveProxy: async () => proxy })
  const network = createCodexNetworkTransport({ env: { HTTPS_PROXY: proxy }, fetchThroughProxy: async (_input, _init, route) => {
    assert.equal(route, `${proxy}/`)
    fetches++
    return new Response('data: {"type":"response.created","response":{"id":"fallback"}}\n\ndata: {"type":"response.done","response":{"id":"fallback","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":0,"total_tokens":1}}}\n\n', { headers: { 'content-type': 'text/event-stream' } })
  } })
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
    assert.equal(globalThis.WebSocket, originalWebSocket)
    assert.equal(process.env.HTTPS_PROXY, originalEnv)
  } finally { connection.dispose(); await new Promise(resolve => server.close(resolve)) }
})

test('a disconnect after response acceptance is surfaced without replaying the request over SSE', async () => {
  const originalSocket = globalThis.WebSocket, originalFetch = globalThis.fetch
  let fetches = 0, sends = 0
  class InterruptedSocket extends EventTarget {
    readyState = 1
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))) }
    send() {
      sends++
      queueMicrotask(() => {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'response.created', response: { id: 'accepted' } }) }))
        setImmediate(() => this.close())
      })
    }
    close() { if(this.readyState===3)return; this.readyState=3; const event=new Event('close'); Object.assign(event,{code:1006,reason:'fixture disconnect',wasClean:false}); this.dispatchEvent(event) }
  }
  globalThis.WebSocket = InterruptedSocket
  globalThis.fetch = async () => { fetches++; throw Error('must not replay') }
  const connection = createSubscriptionConnection({ resolveMode: () => 'websocket', resolveProxy: async () => undefined })
  const provider = openaiCodexSubscriptionProvider({ connection })
  const apiKey = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')}.fake`
  try {
    const model = provider.getModels().find(model => model.id === 'gpt-5.6-luna')
    const events=[]
    for await(const event of provider.streamSimple(model,{messages:[{role:'user',content:'fixture',timestamp:Date.now()}]},{apiKey,sessionId:'interrupted',signal:AbortSignal.timeout(3000)})) events.push(event.type)
    assert.ok(events.includes('start'))
    assert.ok(events.includes('error'))
    assert.equal(sends,1)
    assert.equal(fetches,0)
  } finally { connection.dispose();globalThis.WebSocket=originalSocket;globalThis.fetch=originalFetch }
})
