// Test-only hooks: real model traffic, one local upgrade rejection and one slow SSE consumer.
const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')
const sockets = new Set(), wires = [], transformations = []
let phase = 'startup', rejectNext = false, holdNext = false, held = false, release, modelRequests = 0, port
const modelUrl = value => { try { const url = new URL(typeof value === 'string' || value instanceof URL ? value : value.url); return url.hostname === 'chatgpt.com' && url.pathname.endsWith('/codex/responses') } catch { return false } }
const payload = data => JSON.parse(typeof data === 'string' ? data : Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? data.length).toString('utf8'))
const note = (body, transport, socket) => {
  assert.equal(body.model, 'gpt-6.2-sol', 'Only the approved Sol model may be called')
  assert.ok(++modelRequests <= 12, 'Live model call budget exhausted')
  wires.push({ phase, transport, socket, model: body.model, inputItems: body.input?.length ?? 0,
    previousResponse: Boolean(body.previous_response_id), toolDefinitions: body.tools?.length ?? 0,
    reasoningItems: body.input?.filter(item => item.type === 'reasoning').length ?? 0,
    encryptedReasoningItems: body.input?.filter(item => item.type === 'reasoning' && typeof item.encrypted_content === 'string').length ?? 0,
    bytes: Buffer.byteLength(JSON.stringify(body)) })
}
const server = http.createServer((_request, response) => { response.writeHead(502); response.end() })
server.on('upgrade', (_request, socket) => socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'))
const ready = new Promise(resolve => server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve() }))
let socketId = 0
function wrapSocket(NativeSocket) {
class TestSocket extends NativeSocket {
  constructor(url, ...options) {
    const target = modelUrl(url), rejected = target && rejectNext
    if (rejected) rejectNext = false
    // Do not forward any authentication headers to the local fault endpoint.
    super(rejected ? `ws://127.0.0.1:${port}` : url, ...(rejected ? [{}] : options))
    this.liveTarget = target; this.liveId = ++socketId; this.liveBusy = false
    if (target) sockets.add(this)
    this.on('close', () => { sockets.delete(this); this.liveBusy = false })
    this.on('error', () => { this.liveBusy = false })
    this.on('message', data => {
      try {
        const event = payload(data)
        if (['response.completed', 'response.done', 'response.failed', 'error'].includes(event.type)) this.liveBusy = false
        if (Array.isArray(event.response?.input_transformations) && transformations.length < 16) {
          const reported = event.response.input_transformations
          const items = reported.slice(0, 16).flatMap(item => item.type === 'reasoning' && item.action === 'removed' && item.reason === 'prefix_mismatch'
            ? [{ type: item.type, action: item.action, reason: item.reason }] : [])
          transformations.push({ phase, reportedCount: reported.length, unclassifiedCount: reported.length - items.length, items })
        }
      } catch { /* never retain response bodies */ }
    })
  }
  send(data, ...args) {
    if (this.liveTarget) { note(payload(data), 'websocket', this.liveId); this.liveBusy = true }
    return super.send(data, ...args)
  }
}
for (const name of Reflect.ownKeys(NativeSocket)) {
  if (!['length', 'name', 'prototype', 'caller', 'arguments'].includes(name)) Object.defineProperty(TestSocket, name, Object.getOwnPropertyDescriptor(NativeSocket, name))
}
return TestSocket
}
const fetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  if (!modelUrl(input)) return fetch(input, init)
  const body = payload(init?.body ?? await input.clone().text())
  note(body, 'sse')
  const response = await fetch(input, init)
  if (!holdNext || !JSON.stringify(body).includes('LIVE-PARALLEL-HOLD') || !response.ok) return response
  holdNext = false
  const gate = new Promise(resolve => { release = resolve })
  const reader = response.body.getReader()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const first = await reader.read()
        if (!first.done) controller.enqueue(first.value)
        held = true
        await gate
        for (;;) { const chunk = await reader.read(); if (chunk.done) break; controller.enqueue(chunk.value) }
        controller.close()
      } catch (error) { controller.error(error) }
    },
    cancel: reason => reader.cancel(reason),
  })
  return new Response(stream, { status: response.status, headers: response.headers })
}
globalThis[Symbol.for('dsh-linux-live-control')] = {
  wrapSocket,
  ready, phase: value => { phase = value }, snapshot: () => ({ modelRequests, wires: [...wires], transformations: [...transformations] }),
  held: () => held, hold: () => { held = false; holdNext = true }, release: () => release?.(),
  close: () => new Promise(resolve => server.close(resolve)),
  rejectUpgrade: async () => {
    await ready
    assert.ok([...sockets].every(socket => !socket.liveBusy), 'Do not interrupt an active model request')
    rejectNext = true
    await Promise.all([...sockets].map(socket => { const done = once(socket, 'close'); socket.close(1000, 'live-test-reconnect'); return done }))
  },
}
