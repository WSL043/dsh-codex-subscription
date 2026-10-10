import assert from 'node:assert/strict'
import test from 'node:test'
import { createRemoteControlRelay } from '../src/remote-control-relay.js'

const wait = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms))
const enrollOk = () => ({ ok: true, json: async () => ({ environment_id: 'env', server_id: 'srv', remote_control_token: 'tok', expires_at: new Date(Date.now() + 3_600_000).toISOString() }) })

function setup(extra = {}) {
  const sockets = []
  const connections = []
  class Socket {
    constructor() { this.handlers = {}; this.readyState = 1; this.sent = []; sockets.push(this); queueMicrotask(() => this.handlers.open?.()) }
    on(name, handler) { this.handlers[name] = handler }
    send(data, callback) { this.sent.push(JSON.parse(data)); callback?.() }
    close() { this.readyState = 3; this.handlers.close?.() }
  }
  const received = []
  const relay = createRemoteControlRelay({
    credentials: async () => ({ access: 'a', accountId: 'b' }), fetch: async () => enrollOk(), WebSocket: Socket, installationId: 'i', hostName: 'h', userAgent: 'x/1',
    serve: client => { connections.push(client); return { receive: message => received.push(message), close() {} } },
    wait: () => new Promise(resolve => setTimeout(resolve, 1)), ...extra,
  })
  return { relay, sockets, connections, received }
}
const fromPhone = (socket, message, seq) => socket.handlers.message(JSON.stringify({ type: 'client_message', client_id: 'phone', stream_id: 'st', seq_id: seq, message }))

test('what the phone has not acknowledged is sent again after a reconnect, and acknowledged messages are not', async () => {
  const { relay, sockets, connections } = setup()
  void relay.start()
  await wait(20)
  fromPhone(sockets[0], { id: 1, method: 'ping' }, 1)
  await wait(5)
  const phone = connections[0]
  await phone.send({ method: 'one' })
  await phone.send({ method: 'two' })
  sockets[0].handlers.message(JSON.stringify({ type: 'ack', client_id: 'phone', stream_id: 'st', seq_id: 1 }))
  sockets[0].readyState = 3
  await phone.send({ method: 'three' })
  sockets[0].handlers.close()
  await wait(40)
  const resent = sockets[1].sent.filter(envelope => envelope.type === 'server_message').map(envelope => envelope.message.method)
  assert.deepEqual(resent, ['two', 'three'], 'only what was not acknowledged, in order, including what was sent during the drop')
  assert.equal(sockets[1].sent.find(envelope => envelope.message?.method === 'two').seq_id, 2, 'with the same sequence numbers')
  await relay.stop()
})

test('the phone stream survives a reconnect and a repeated client message is delivered once', async () => {
  const { relay, sockets, connections, received } = setup()
  void relay.start()
  await wait(20)
  fromPhone(sockets[0], { id: 1, method: 'a' }, 1)
  sockets[0].handlers.close()
  await wait(40)
  fromPhone(sockets[1], { id: 2, method: 'b' }, 2)
  fromPhone(sockets[1], { id: 2, method: 'b' }, 2)
  fromPhone(sockets[1], { id: 1, method: 'a' }, 1)
  await wait(10)
  assert.equal(connections.length, 1, 'the same phone connection continues')
  assert.deepEqual(received.map(message => message.method), ['a', 'b'])
  assert.equal(sockets[1].sent.filter(envelope => envelope.type === 'ack').length, 3, 'repeats are still acknowledged')
  await relay.stop()
})

test('a request to the phone is not held back for a dropped phone, so its caller can fall back', async () => {
  const { relay, sockets, connections } = setup()
  void relay.start()
  await wait(20)
  fromPhone(sockets[0], { id: 1, method: 'a' }, 1)
  await wait(5)
  sockets[0].readyState = 3
  await assert.rejects(() => connections[0].send({ id: 's1', method: 'item/tool/requestUserInput', params: {} }), /not connected/u)
  sockets[0].handlers.close()
  await wait(40)
  assert.equal(sockets[1].sent.some(envelope => envelope.message?.method === 'item/tool/requestUserInput'), false)
  await relay.stop()
})

test('a refused upgrade with Retry-After delays the next attempt', async () => {
  const waits = []
  let tries = 0
  class Refused {
    constructor() { tries += 1; this.handlers = {}; queueMicrotask(() => this.handlers['unexpected-response']?.({ destroy() {} }, { statusCode: 429, headers: { 'retry-after': '120' } })) }
    on(name, handler) { this.handlers[name] = handler }
    close() {}
  }
  const relay = createRemoteControlRelay({
    credentials: async () => ({ access: 'a', accountId: 'b' }), fetch: async () => enrollOk(), WebSocket: Refused, installationId: 'i', hostName: 'h', userAgent: 'x/1',
    serve: () => ({ receive() {}, close() {} }), random: () => 0,
    wait: (ms, signal) => { waits.push(ms); return new Promise(resolve => { signal.addEventListener('abort', resolve, { once: true }) }) },
  })
  void relay.start()
  await wait(30)
  await relay.stop()
  assert.equal(tries, 1)
  assert.ok(waits[0] >= 120_000, `waited ${waits[0]}`)
})

test('what waited longer than the buffer idle limit is dropped on reconnect, and the stream carries on', async () => {
  let clock = 1_000_000
  const { relay, sockets, connections } = setup({ now: () => clock })
  void relay.start()
  await wait(20)
  fromPhone(sockets[0], { id: 1, method: 'a' }, 1)
  await wait(5)
  sockets[0].readyState = 3
  await connections[0].send({ method: 'old' })
  clock += 31 * 60_000
  sockets[0].handlers.close()
  await wait(40)
  assert.equal(sockets[1].sent.some(envelope => envelope.message?.method === 'old'), false, 'stale messages are not replayed')
  await connections[0].send({ method: 'fresh' })
  const fresh = sockets[1].sent.find(envelope => envelope.message?.method === 'fresh')
  assert.equal(fresh.seq_id, 2, 'the sequence continues, so the phone does not see a gap')
  await relay.stop()
})
