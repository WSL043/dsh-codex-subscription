import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

test('live-test controls restrict model calls, strip fault credentials and retain no text (#275)', async () => {
  const require = createRequire(import.meta.url), ws = require.resolve('ws')
  require(ws)
  const originalWs = require.cache[ws].exports, originalFetch = globalThis.fetch, oldPackage = process.env.DSH_LIVE_PLUGIN_PACKAGE
  const constructed = []
  class Socket extends EventEmitter {
    readyState = 1
    constructor(...args) { super(); constructed.push(args); queueMicrotask(() => this.emit('open')) }
    send() {}
    close() { this.readyState = 3; queueMicrotask(() => this.emit('close')) }
  }
  require.cache[ws].exports = Socket
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data: {"type":"response.created"}\n\n'))
    controller.enqueue(new TextEncoder().encode('data: {"type":"response.completed","text":"PRIVATE-ANSWER"}\n\n'))
    controller.close()
  } }))
  process.env.DSH_LIVE_PLUGIN_PACKAGE = fileURLToPath(new URL('../package.json', import.meta.url))
  const helper = require.resolve('./helpers/linux-live-transport-control.cjs')
  let control
  try {
    require(helper)
    control = globalThis[Symbol.for('dsh-linux-live-control')]
    await control.ready
    const target = 'wss://chatgpt.com/backend-api/codex/responses'
    const Client = control.wrapSocket(Socket)
    const socket = new Client(target, { headers: { authorization: 'Bearer PRIVATE-SECRET' } })
    socket.send(JSON.stringify({ model: 'gpt-6.2-sol', input: [{ text: 'PRIVATE-PROMPT' }] }))
    assert.throws(() => socket.send(JSON.stringify({ model: 'gpt-6.2-astra' })), /approved Sol/)
    socket.emit('message', Buffer.from('{"type":"response.completed"}'))
    await control.rejectUpgrade()
    new Client(target, { headers: { authorization: 'Bearer PRIVATE-SECRET' } })
    assert.ok(constructed.at(-1)[0].startsWith('ws://127.0.0.1:'))
    assert.deepEqual(constructed.at(-1)[1], {})
    control.hold()
    const response = await globalThis.fetch('https://chatgpt.com/backend-api/codex/responses', {
      body: JSON.stringify({ model: 'gpt-6.2-sol', input: [{ text: 'LIVE-PARALLEL-HOLD PRIVATE-PROMPT' }] }),
    })
    const reader = response.body.getReader()
    await reader.read(); assert.equal(control.held(), true)
    control.release()
    while (!(await reader.read()).done) {}
    assert.doesNotMatch(JSON.stringify(control.snapshot()), /PRIVATE|SECRET|Bearer|authorization/)
  } finally {
    control?.release(); await control?.close()
    require.cache[ws].exports = originalWs; delete require.cache[helper]
    globalThis.fetch = originalFetch
    delete globalThis[Symbol.for('dsh-linux-live-control')]
    if (oldPackage === undefined) delete process.env.DSH_LIVE_PLUGIN_PACKAGE
    else process.env.DSH_LIVE_PLUGIN_PACKAGE = oldPackage
  }
})
