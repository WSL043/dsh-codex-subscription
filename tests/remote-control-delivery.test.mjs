import assert from 'node:assert/strict'
import test from 'node:test'
import { createDshRemoteControl } from '../src/remote-control-dsh.js'
import { createRemoteControlRelay } from '../src/remote-control-relay.js'
import { createRemoteControlHost } from '../src/remote-control-host.js'
import { diagnosticLog } from '../src/diagnostic-log.js'
import { phoneLog } from '../src/remote-control-log.js'
const tick = () => new Promise(resolve => setImmediate(resolve))

test('large history and image chunks finish before a later reply or notification on the same stream', async () => {
  let socket, phone
  class Socket {
    constructor() { socket = this; this.readyState = 1; this.frames = []; this.handlers = {}; queueMicrotask(() => this.handlers.open?.()) }
    on(name, fn) { this.handlers[name] = fn }
    send(data, callback) { this.frames.push(JSON.parse(data)); setImmediate(() => callback?.()) }
    close() { this.readyState = 3; this.handlers.close?.() }
  }
  const relay = createRemoteControlRelay({
    credentials: async () => ({ access: 'a', accountId: 'b' }),
    fetch: async () => Response.json({ environment_id: 'env', server_id: 'srv', remote_control_token: 'rct', expires_at: new Date(Date.now() + 3600000).toISOString() }),
    WebSocket: Socket, installationId: 'test', hostName: 'test', userAgent: 'test/1',
    serve: client => { phone = client; return { receive() {}, close() {} } }, wait: () => new Promise(() => {}),
  })
  try {
    void relay.start()
    while (!socket?.handlers.message) await tick()
    socket.handlers.message(JSON.stringify({ type: 'client_message', client_id: 'phone', stream_id: 'st', seq_id: 1, message: { id: 1, method: 'initialize' } }))
    while (!phone) await tick()
    const history = { id: 2, result: { history: 'x'.repeat(3_400_000) } }
    const delivery = Promise.all([
      phone.send(history),
      phone.send({ method: 'turn/completed', params: { threadId: 't' } }),
      phone.send({ id: 3, result: {} }),
    ])
    history.result.history = 'changed while queued'
    await delivery
    const frames = socket.frames.filter(f => f.type.startsWith('server_message'))
    assert.deepEqual(frames.map(f => f.seq_id), frames.map(f => f.seq_id).toSorted((a,b) => a-b), 'a later sequence must never overtake an unfinished chunked message')
    const chunks = frames.filter(f => f.type === 'server_message_chunk')
    assert.equal(JSON.parse(Buffer.concat(chunks.map(f => Buffer.from(f.message_chunk_base64, 'base64'))).toString()).result.history.length, 3_400_000)
  } finally { await relay.stop() }
})

test('image result bytes reach the completed tool before turn completion, even when reading outlasts the model', async () => {
  let idle, read
  const notes = [], messages = []
  const session = { id: 's', meta: { createdAt: Date.now() }, deriveMessages: () => messages }
  const bridge = createDshRemoteControl({ controller: () => ({ resolveAgent: async () => ({ agent: { session, whenIdle: () => new Promise(r => { idle = r }) } }), prompt: async () => ({ accepted: true }) }), agents: () => ({}), attachments: () => ({ readImage: () => new Promise(r => { read = r }) }), userAgent: 'test/1' })
  await bridge.methods['turn/start']({ threadId: 's', input: [{ type: 'text', text: 'draw' }], clientUserMessageId: 'phone-u' }, { notify: async (method, params) => notes.push({ method, params: structuredClone(params) }) })
  const call = { role: 'assistant', id: 'a', content: [{ type: 'tool-call', id: 'tool', name: 'codex_image_generate', arguments: '{}' }] }
  messages.push(call); bridge.onSessionEvent(session, { type: 'assistant/message', data: { message: call } })
  assert.equal(notes.some(n => n.method === 'item/completed' && n.params.item.type === 'imageGeneration'), false, 'starting the tool must not complete an empty image result')
  const ref = { attachmentId: 'test-image' }
  const result = { role: 'tool', toolCallId: 'tool', content: [{ type: 'image', attachment: ref }] }
  // The committed history may already have moved on before this event is handled.
  messages.push(result, { role: 'assistant', id: 'later', content: [{ type: 'text', text: 'done' }] })
  bridge.onSessionEvent(session, { type: 'tool/result', data: { message: result } })
  idle(); await tick()
  assert.equal(notes.some(n => n.method === 'turn/completed'), false, 'the turn must wait for its image')
  read({ ref: { ...ref, mediaType: 'image/png' }, data: Buffer.from('png') })
  await tick(); await tick()
  const done = notes.find(n => n.method === 'turn/completed')
  assert.equal(done.params.turn.items.find(i => i.type === 'imageGeneration').result, Buffer.from('png').toString('base64'))
})

test('history keeps the live turn identity after commit and completion', async () => {
  let idle
  const messages = [], session = { id: 's', meta: {}, deriveMessages: () => messages }
  const bridge = createDshRemoteControl({ controller: () => ({ resolveAgent: async () => ({ agent: { session, whenIdle: () => new Promise(r => { idle = r }) } }), prompt: async () => ({ accepted: true }), modelCatalog: async () => ({ groups: [] }) }), agents: () => ({}), userAgent: 'test/1' })
  const notify = async () => {}
  const { turn } = await bridge.methods['turn/start']({ threadId: 's', input: [{ type: 'text', text: 'hello' }], clientUserMessageId: 'phone-u' }, { notify })
  const message = { role: 'user', id: 'dsh-u', content: [{ type: 'text', text: 'hello' }] }
  messages.push(message); bridge.onSessionEvent(session, { type: 'user/message', data: message })
  idle(); await tick()
  const { thread } = await bridge.methods['thread/resume']({ threadId: 's' }, { notify })
  assert.equal(thread.turns[0].id, turn.id)
  assert.equal(thread.turns[0].items[0].clientId, 'phone-u')
})

test('normal info logs cover requests and errors without retaining bodies, image data or raw identifiers', async () => {
  diagnosticLog.clear()
  const host = createRemoteControlHost({ methods: { 'thread/read': () => { throw new Error('read failed') } } })
  const connection = host.serve({ id: 'private-phone-identifier', send: async () => {} })
  connection.receive({ id: 'private-request-identifier', method: 'thread/read', params: { threadId: 'private-thread-identifier', input: 'PRIVATE_CHAT_BODY', authorization: 'PRIVATE_CREDENTIAL' } })
  await tick()
  phoneLog('privacy check', { threadId: 'private-thread-identifier', body: 'PRIVATE_CHAT_BODY', image: 'PRIVATE_IMAGE_BYTES', token: 'PRIVATE_CREDENTIAL', bytes: 123 })
  const logs = diagnosticLog.snapshot().entries
  assert.ok(logs.some(e => e.message === 'request received' && e.level === 'info'))
  assert.ok(logs.some(e => e.message === 'request failed' && e.level === 'error'))
  const serialized = JSON.stringify(logs)
  assert.doesNotMatch(serialized, /PRIVATE_CHAT_BODY|PRIVATE_CREDENTIAL|PRIVATE_IMAGE_BYTES|private-phone-identifier|private-request-identifier|private-thread-identifier/)
  assert.match(serialized, /thread\/read/)
  connection.close()
})

test('repeating the previous prompt before a new user commit preserves both turns', async () => {
  let idle
  const old = { role: 'user', id: 'old-u', content: [{ type: 'text', text: 'again' }] }
  const messages = [old], session = { id: 's', meta: {}, deriveMessages: () => messages }
  const bridge = createDshRemoteControl({ controller: () => ({ resolveAgent: async () => ({ agent: { session, whenIdle: () => new Promise(r => { idle = r }) } }), prompt: async () => ({ accepted: true }), modelCatalog: async () => ({ groups: [] }) }), agents: () => ({}), userAgent: 'test/1' })
  const notify = async () => {}
  await bridge.methods['turn/start']({ threadId: 's', input: [{ type: 'text', text: 'again' }], clientUserMessageId: 'new-u' }, { notify })
  const { thread } = await bridge.methods['thread/resume']({ threadId: 's' }, { notify })
  assert.equal(thread.turns.length, 2)
  assert.equal(thread.turns[0].items[0].id, 'old-u')
  assert.equal(thread.turns[1].items[0].clientId, 'new-u')
  idle(); await tick()
})
