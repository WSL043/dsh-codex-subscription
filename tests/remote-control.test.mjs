import assert from 'node:assert/strict'
import test from 'node:test'
import { createRemoteControlHost, RpcError } from '../src/remote-control-host.js'
import { createDshRemoteControl, modelKey, parseModelKey, projectTurns } from '../src/remote-control-dsh.js'
import { createRemoteControlRelay, remoteControlEndpoints } from '../src/remote-control-relay.js'

const wait = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms))

function connect(host) {
  const sent = []
  const client = { send: async message => { sent.push(message) }, close() {} }
  const connection = host.serve(client)
  return { sent, receive: connection.receive }
}

test('the host routes requests, notifications, errors and phone answers', async () => {
  const host = createRemoteControlHost({
    methods: {
      echo: params => ({ echoed: params.value }),
      boom: () => { throw new Error('secret internals') },
      denied: () => { throw new RpcError(-32602, 'bad input') },
      ask: async (_params, { ask }) => ({ answer: await ask('item/commandExecution/requestApproval', { command: 'ls' }) }),
    },
  })
  const { sent, receive } = connect(host)
  receive({ id: 1, method: 'echo', params: { value: 7 } })
  receive({ id: 2, method: 'boom' })
  receive({ id: 3, method: 'denied' })
  receive({ id: 4, method: 'missing' })
  receive({ method: 'initialized' })
  await wait()
  assert.deepEqual(sent.find(m => m.id === 1), { id: 1, result: { echoed: 7 } })
  assert.deepEqual(sent.find(m => m.id === 2).error, { code: -32603, message: 'Request failed' }, 'internal errors never leak')
  assert.equal(sent.find(m => m.id === 3).error.message, 'bad input')
  assert.equal(sent.find(m => m.id === 4).error.code, -32601)
  receive({ id: 5, method: 'ask' })
  await wait()
  const question = sent.find(m => m.method === 'item/commandExecution/requestApproval')
  assert.equal(question.params.command, 'ls')
  receive({ id: question.id, result: { decision: 'accept' } })
  await wait()
  assert.deepEqual(sent.find(m => m.id === 5).result, { answer: { decision: 'accept' } })
  assert.equal(host.seen()['request:echo'], 1)
})

test('model ids round-trip through provider/model keys', () => {
  const key = modelKey({ provider: 'openai-codex', model: 'gpt-6' })
  assert.deepEqual(parseModelKey(key), { provider: 'openai-codex', model: 'gpt-6' })
  assert.equal(parseModelKey('no-slash'), undefined)
  assert.deepEqual(parseModelKey(modelKey({ provider: 'a/b', model: 'c d' })), { provider: 'a/b', model: 'c d' })
})

test('DSH messages project into Codex turns and items', () => {
  const turns = projectTurns([
    { role: 'system', id: 's', content: [{ type: 'text', text: 'sys' }] },
    { role: 'user', id: 'u1', content: [{ type: 'text', text: 'hi' }] },
    { role: 'assistant', id: 'a1', content: [{ type: 'reasoning', text: 'think' }, { type: 'text', text: 'ok' }, { type: 'tool-call', id: 'c1', name: 'bash', arguments: '{"command":"ls"}' }] },
    { role: 'tool', id: 't1', toolCallId: 'c1', content: [{ type: 'text', text: 'a.txt' }] },
    { role: 'user', id: 'u2', content: [{ type: 'text', text: 'again' }] },
  ])
  assert.equal(turns.length, 2)
  assert.deepEqual(turns[0].items.map(item => item.type), ['userMessage', 'reasoning', 'agentMessage', 'dynamicToolCall'])
  assert.equal(turns[0].items[3].status, 'completed')
  assert.deepEqual(turns[0].items[3].arguments, { command: 'ls' })
})

function fakeControl({ error } = {}) {
  const calls = []
  let finish
  const session = { id: 's1', meta: { createdAt: 1_000_000, cwd: 'C:/w' }, deriveMessages: () => [{ role: 'user', id: 'u', content: [{ type: 'text', text: 'hello' }] }] }
  const agent = { session, options: { provider: 'openai-codex', model: 'gpt-6' }, whenIdle: () => new Promise(resolve => { finish = resolve }) }
  const controller = {
    resolveAgent: async id => id === 's1' ? { agent } : { error: {} },
    list: async () => ({ items: [{ sessionId: 's1', updatedAt: 2_000_000, running: false, blank: false, cwd: 'C:/w', projections: { values: { title: 'T' } } }, { sessionId: 'b', blank: true, updatedAt: 1 }] }),
    modelCatalog: async () => ({ default: { provider: 'openai-codex', model: 'gpt-6' }, groups: [{ id: 'openai-codex', name: 'Codex', models: [{ id: 'gpt-6', name: 'GPT-6' }] }, { id: 'deepseek', name: 'DeepSeek', models: [{ id: 'chat', name: 'Chat' }] }] }),
    selectModel: async request => { calls.push(['selectModel', request]) },
    prompt: async request => { calls.push(['prompt', request]); if (error) throw new Error(error); return { accepted: true } },
    create: async () => ({ sessionId: 's1' }),
    cancel: request => { calls.push(['cancel', request]) },
    rename: async () => ({}),
  }
  const permissions = { current: () => 'workspace-write', set: (_session, name) => calls.push(['permission', name]) }
  const bridge = createDshRemoteControl({ controller: () => controller, agents: () => ({}), permissions: () => permissions, userAgent: 'x/1' })
  return { bridge, calls, session, finish: () => finish() }
}

const hello = text => ({ threadId: 's1', input: [{ type: 'text', text, text_elements: [] }] })

test('model/list offers every DSH provider and thread/list hides blank sessions', async () => {
  const { bridge } = fakeControl()
  const models = await bridge.methods['model/list']({}, {})
  assert.deepEqual(models.data.map(model => model.id), [modelKey({ provider: 'openai-codex', model: 'gpt-6' }), modelKey({ provider: 'deepseek', model: 'chat' })])
  assert.equal(models.data[0].isDefault, true)
  const list = await bridge.methods['thread/list']({}, {})
  assert.deepEqual(list.data.map(thread => [thread.id, thread.name]), [['s1', 'T']])
})

test('a phone turn applies the chosen model and permission, then reports completion', async () => {
  const { bridge, calls, finish } = fakeControl()
  const notes = []
  const notify = async (method, params) => { notes.push([method, params]) }
  const { turn } = await bridge.methods['turn/start']({
    ...hello('go'), model: modelKey({ provider: 'deepseek', model: 'chat' }), sandboxPolicy: { type: 'dangerFullAccess' },
  }, { notify })
  assert.ok(turn.id)
  assert.deepEqual(calls.find(call => call[0] === 'selectModel')[1], { sessionId: 's1', provider: 'deepseek', model: 'chat' })
  assert.deepEqual(calls.find(call => call[0] === 'permission'), ['permission', 'danger-full-access'])
  assert.deepEqual(calls.find(call => call[0] === 'prompt')[1].content, [{ type: 'text', text: 'go' }])
  await assert.rejects(() => bridge.methods['turn/start'](hello('again'), { notify }), /already running/u)
  finish(); await wait()
  assert.equal(notes.at(-1)[0], 'turn/completed')
  assert.equal(notes.at(-1)[1].turn.status, 'completed')
})

test('a model failure reaches the phone as an error and a failed turn', async () => {
  const { bridge, session, finish } = fakeControl()
  const notes = []
  const notify = async (method, params) => { notes.push([method, params]) }
  await bridge.methods['turn/start'](hello('go'), { notify })
  bridge.onSessionEvent(session, { type: 'turn/end', data: { reason: { kind: 'error', error: { message: 'missing DeepSeek API key' } } } })
  finish(); await wait()
  assert.equal(notes.find(([method]) => method === 'error')[1].error.message, 'missing DeepSeek API key')
  assert.equal(notes.at(-1)[1].turn.status, 'failed')
})

test('a rejected prompt is reported and frees the thread', async () => {
  const { bridge } = fakeControl({ error: 'no credentials' })
  const notify = async () => {}
  await assert.rejects(() => bridge.methods['turn/start'](hello('x'), { notify }), /did not accept the message: no credentials/u)
  await assert.rejects(() => bridge.methods['turn/start'](hello('x'), { notify }), /did not accept/u)
})

test('approvals go to the phone during its turn and to DSH otherwise', async () => {
  const { bridge, session } = fakeControl()
  const asked = []
  const notify = async () => {}
  notify.ask = async (method, params) => { asked.push([method, params]); return { decision: 'accept' } }
  const request = { agent: { session }, toolName: 'bash', callId: 'c1', reason: 'run it' }
  assert.equal(await bridge.onApproval(request, async () => 'rejected'), 'rejected', 'no phone turn, DSH decides')
  await bridge.methods['turn/start'](hello('go'), { notify })
  assert.equal(await bridge.onApproval(request, async () => 'rejected'), 'allowed-once')
  assert.equal(asked[0][0], 'item/commandExecution/requestApproval')
  notify.ask = async () => { throw new Error('gone') }
  assert.equal(await bridge.onApproval(request, async () => 'rejected'), 'rejected', 'a dropped phone falls back to DSH')
  notify.ask = async () => ({ decision: 'decline' })
  assert.equal(await bridge.onApproval(request, async () => 'allowed-once'), 'rejected')
})

test('the queue holds messages while a turn runs and starts them afterwards', async () => {
  const { bridge, calls, finish } = fakeControl()
  const notify = async () => {}
  await bridge.methods['turn/start'](hello('one'), { notify })
  const { queuedSubmission } = await bridge.methods['thread/queue/add']({ ...hello('two'), clientUserMessageId: 'c' }, { notify })
  assert.equal((await bridge.methods['thread/queue/list']({ threadId: 's1' }, {})).data.length, 1)
  finish(); await wait(20)
  assert.deepEqual(calls.filter(call => call[0] === 'prompt').map(call => call[1].content[0].text), ['one', 'two'])
  assert.equal((await bridge.methods['thread/queue/list']({ threadId: 's1' }, {})).data.length, 0)
  assert.ok(queuedSubmission.id)
})

test('only chatgpt.com endpoints are accepted', () => {
  assert.equal(remoteControlEndpoints().websocket.protocol, 'wss:')
  assert.throws(() => remoteControlEndpoints('https://example.com/'), /chatgpt\.com/u)
  assert.throws(() => remoteControlEndpoints('http://chatgpt.com/'), /chatgpt\.com/u)
})

test('the relay enrolls, pairs, frames messages and re-chunks large replies', async () => {
  const requests = []
  const fetch = async (url, init) => {
    requests.push([String(url), JSON.parse(init.body), init.headers])
    if (String(url).endsWith('/enroll')) return Response.json({ environment_id: 'env', server_id: 'srv', remote_control_token: 'rct', expires_at: new Date(Date.now() + 3_600_000).toISOString() })
    return Response.json({ pairing_code: '123', manual_pairing_code: 'ABCD-EFGH', server_id: 'srv', environment_id: 'env', expires_at: new Date(Date.now() + 600_000).toISOString() })
  }
  const sockets = []
  class FakeSocket {
    constructor(url, options) { this.url = url; this.options = options; this.readyState = 1; this.sent = []; this.handlers = {}; sockets.push(this); queueMicrotask(() => this.handlers.open?.()) }
    on(name, handler) { this.handlers[name] = handler }
    send(data, callback) { this.sent.push(JSON.parse(data)); callback?.() }
    close() { this.readyState = 3; this.handlers.close?.() }
  }
  const received = []
  const relay = createRemoteControlRelay({
    credentials: async () => ({ access: 'tok', accountId: 'acct' }), fetch, WebSocket: FakeSocket, installationId: 'inst', hostName: 'DSH (test)', userAgent: 'dsh-codex-subscription/1',
    serve: client => ({ receive: message => { received.push(message); void client.send({ id: message.id, result: { big: 'x'.repeat(400_000) } }) }, close() {} }),
    wait: () => new Promise(() => {}),
  })
  const pairing = await relay.pair()
  assert.equal(pairing.manualCode, 'ABCD-EFGH')
  assert.equal(requests[0][2].authorization, 'Bearer tok')
  assert.equal(requests[1][2].authorization, 'Bearer rct')
  void relay.start()
  await wait(20)
  const socket = sockets[0]
  assert.equal(socket.options.headers['x-codex-server-id'], 'srv')
  assert.equal(socket.options.headers['x-codex-name'], Buffer.from('DSH (test)').toString('base64'))
  socket.handlers.message(JSON.stringify({ type: 'client_message', client_id: 'phone', stream_id: 'st', seq_id: 1, message: { id: 9, method: 'ping' } }))
  await wait(30)
  assert.deepEqual(received, [{ id: 9, method: 'ping' }])
  assert.ok(socket.sent.some(frame => frame.type === 'ack' && frame.seq_id === 1))
  const chunks = socket.sent.filter(frame => frame.type === 'server_message_chunk')
  assert.ok(chunks.length > 1, 'a large reply is split into chunks')
  const joined = Buffer.concat(chunks.sort((a, b) => a.segment_id - b.segment_id).map(frame => Buffer.from(frame.message_chunk_base64, 'base64')))
  assert.equal(JSON.parse(joined.toString()).result.big.length, 400_000)
  assert.equal(relay.status().status, 'connected')
  await relay.stop()
  assert.equal(relay.status().status, 'stopped')
})

test('the browser bundle stays free of Node built-ins (the QR encoder must not pull in fs)', async () => {
  const { readFile } = await import('node:fs/promises')
  const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(bundle, /require\((["'])(?:node:)?(?:fs|path|os|zlib|stream|child_process|net|tls)\1\)/u)
  const source = await readFile(new URL('../src/client-remote-control.jsx', import.meta.url), 'utf8')
  assert.match(source, /from 'qrcode\/lib\/core\/qrcode\.js'/u)
})

test('the phone can prepare a working folder before a new chat', async () => {
  const { methods } = createDshRemoteControl({ controller: { }, agents: {}, permissions: {}, userAgent: 'test' })
  assert.deepEqual(await methods['fs/createDirectory']({ path: 'x' }), {})
  const meta = await methods['fs/getMetadata']({ path: 'x' })
  assert.equal(meta.isDirectory, true)
  assert.equal(meta.isSymlink, false)
  assert.deepEqual(await methods['fs/readDirectory']({ path: 'x' }), { entries: [] })
})
