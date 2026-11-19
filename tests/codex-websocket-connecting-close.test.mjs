import assert from 'node:assert/strict'
import test from 'node:test'
import WebSocket from 'ws'
import { withCodexNetwork } from '../src/oauth-network.js'

const endpoint = 'wss://chatgpt.com/backend-api/codex/responses'
const expectedCloseError = 'WebSocket was closed before the connection was established'

class HandshakeSocket extends WebSocket {
  constructor() {
    super(null, undefined, {})
  }

  phase = WebSocket.CONNECTING
  get readyState() { return this.phase }
  close(code, reason) {
    this.closeCall = { code, reason, observers: this.listenerCount('error') }
    if (this.closeError) throw this.closeError
    this.phase = WebSocket.CLOSING
  }
}

function withSocket(run, url = endpoint) {
  return withCodexNetwork(() => run(new globalThis.WebSocket(url)), {
    websocket: true, WebSocket: HandshakeSocket,
  })
}

for (const reason of ['aborted', 'connect_timeout']) {
  test(`a connecting Codex close (${reason}) keeps an observer until close`, async () => {
    const original = globalThis.WebSocket
    const socket = await withSocket(socket => {
      assert.equal(socket.listenerCount('error'), 0)
      socket.close(1000, reason)
      assert.deepEqual(socket.closeCall, { code: 1000, reason, observers: 1 })
      return socket
    })
    assert.equal(globalThis.WebSocket, original)
    assert.doesNotThrow(() => socket.emit('error', new Error(expectedCloseError)))
    socket.emit('close')
    assert.equal(socket.listenerCount('error'), 0)
  })
}

test('unrelated errors retain EventEmitter behavior and reach existing listeners', async () => {
  await withSocket(socket => {
    const error = new Error('unexpected transport error')
    socket.close(1000, 'aborted')
    assert.throws(() => socket.emit('error', error), thrown => thrown === error)
    let observed
    socket.once('error', value => { observed = value })
    socket.emit('error', error)
    assert.equal(observed, error)
    socket.emit('close')
    assert.equal(socket.listenerCount('error'), 0)
  })
})

test('a synchronous close failure removes only the temporary listeners', async () => {
  await withSocket(socket => {
    const error = new Error('close failed')
    const observer = () => {}
    socket.on('error', observer)
    socket.closeError = error
    assert.throws(() => socket.close(1000, 'aborted'), thrown => thrown === error)
    assert.deepEqual(socket.listeners('error'), [observer])
    assert.equal(socket.listenerCount('close'), 0)
  })
})

test('established sockets, other close reasons and other paths are not guarded', async () => {
  await withSocket(socket => {
    socket.phase = WebSocket.OPEN
    socket.close(1000, 'aborted')
    assert.equal(socket.closeCall.observers, 0)
  })
  await withSocket(socket => {
    socket.close(1000, 'done')
    assert.equal(socket.closeCall.observers, 0)
  })
  await withSocket(socket => {
    socket.close(1000, 'aborted')
    assert.equal(socket.closeCall.observers, 0)
  }, 'wss://chatgpt.com/other')
})
