import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRemoteControlHost, RpcError } from '../src/remote-control-host.js'
import { createDshRemoteControl, localFolder, modelKey, parseModelKey, projectTurns, visibleText } from '../src/remote-control-dsh.js'
import { createRemoteControlRelay, remoteControlEndpoints, retryAfterMs } from '../src/remote-control-relay.js'

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
  assert.deepEqual(turns[0].items.map(item => item.type), ['userMessage', 'reasoning', 'agentMessage', 'commandExecution'])
  assert.equal(turns[0].items[3].status, 'completed')
  assert.deepEqual([turns[0].items[3].command, turns[0].items[3].aggregatedOutput], ['ls', 'a.txt'])
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
    create: async request => { calls.push(['create', request]); return { sessionId: 's1' } },
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

test('the browser bundle stays free of Node built-ins (the QR encoder must not pull in fs)', async t => {
  const { readFile } = await import('node:fs/promises')
  // Acceptance runs the tests from a packaged copy without the build output or the UI source.
  const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8').catch(() => undefined)
  const source = await readFile(new URL('../src/client-remote-control.jsx', import.meta.url), 'utf8').catch(() => undefined)
  if (bundle === undefined || source === undefined) return t.skip('build output not present')
  assert.doesNotMatch(bundle, /require\((["'])(?:node:)?(?:fs|path|os|zlib|stream|child_process|net|tls)\1\)/u)
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

test('ask-user questions go to the phone during its turn and map back to DSH answers', async () => {
  const { bridge, session } = fakeControl()
  const asked = []
  const notify = async () => {}
  notify.ask = async (method, params) => { asked.push([method, params]); return { answers: { pick: { answers: ['Blue', 'my own'] }, why: { answers: ['because'] } } } }
  const request = {
    agent: { session }, wait: { callId: 'q1' },
    questions: [{ id: 'pick', question: 'Colour?', options: [{ label: 'Red' }, { label: 'Blue', description: 'cool' }] }, { id: 'why', question: 'Why?', header: 'Reason' }],
  }
  assert.equal(await bridge.onQuestion(request, async () => 'dsh'), 'dsh', 'no phone turn, DSH asks')
  await bridge.methods['turn/start'](hello('go'), { notify })
  const answer = await bridge.onQuestion(request, async () => 'dsh')
  assert.equal(asked[0][0], 'item/tool/requestUserInput')
  assert.equal(asked[0][1].questions[0].options[1].description, 'cool')
  assert.equal(asked[0][1].questions[1].options, null)
  assert.deepEqual(answer.answers, [{ id: 'pick', selected: ['Blue'], custom: 'my own' }, { id: 'why', selected: [], custom: 'because' }])
  notify.ask = async () => { throw new Error('gone') }
  assert.equal(await bridge.onQuestion(request, async () => 'dsh'), 'dsh', 'a dropped phone falls back to DSH')
})

test("DSH's own system reminders never show up as something the person typed", () => {
  const reminder = '<system-reminder>\nskills catalog\n</system-reminder>'
  assert.equal(visibleText([{ type: 'text', text: `hello\n${reminder}` }]), 'hello')
  const turns = projectTurns([
    { role: 'user', id: 'a', content: [{ type: 'text', text: reminder }] },
    { role: 'user', id: 'b', content: [{ type: 'text', text: `ask me\n${reminder}` }] },
    { role: 'assistant', id: 'c', content: [{ type: 'text', text: 'ok' }] },
  ])
  assert.equal(turns.length, 1)
  assert.equal(turns[0].items[0].content[0].text, 'ask me')
})

test('threads can be archived and restored from the phone through the DSH archive set', async () => {
  const archived = new Set()
  const registry = {
    get archivedSessionIds() { return [...archived] },
    archiveSession: async (id, options) => { assert.deepEqual(options, { stopActivity: true }); archived.add(id) },
    unarchiveSession: async id => { archived.delete(id) },
  }
  const bridgeWith = createDshRemoteControl({ controller: () => ({ list: async () => ({ items: [{ sessionId: 's1', updatedAt: 2_000_000, blank: false }] }), resolveAgent: async () => ({ agent: { session: { id: 's1', meta: {}, deriveMessages: () => [] }, options: {} } }) }), agents: () => ({}), workspaces: () => registry, userAgent: 'x' })
  assert.equal((await bridgeWith.methods['thread/list']({}, {})).data.length, 1)
  await bridgeWith.methods['thread/archive']({ threadId: 's1' })
  assert.equal((await bridgeWith.methods['thread/list']({}, {})).data.length, 0)
  assert.equal((await bridgeWith.methods['thread/list']({ archived: true }, {})).data.length, 1)
  await bridgeWith.methods['thread/unarchive']({ threadId: 's1' })
  assert.equal((await bridgeWith.methods['thread/list']({}, {})).data.length, 1)
})

test('a host id the relay keeps refusing with 409 is enrolled again and finally replaced', async () => {
  let renewals = 0, enrolls = 0
  class Refused { constructor() { this.handlers = {}; setTimeout(() => this.handlers.error?.(new Error('Unexpected server response: 409')), 1) } on(name, handler) { this.handlers[name] = handler } close() {} }
  const fetch = async () => { enrolls += 1; return { ok: true, json: async () => ({ environment_id: 'env', server_id: 'srv', remote_control_token: 'tok', expires_at: new Date(Date.now() + 3_600_000).toISOString() }) } }
  const relay = createRemoteControlRelay({
    credentials: async () => ({ access: 'a', accountId: 'b' }), fetch, WebSocket: Refused, installationId: 'i', hostName: 'h', userAgent: 'x/1',
    serve: () => ({ receive() {}, close() {} }), wait: () => new Promise(resolve => setTimeout(resolve, 2)),
    renewInstallation: async () => { renewals += 1; return `new-${renewals}` }, conflictRenewMs: 0,
  })
  void relay.start()
  await new Promise(resolve => setTimeout(resolve, 300))
  await relay.stop()
  assert.ok(renewals >= 1, 'a new host id is taken')
  assert.ok(enrolls >= 3, 'enrollment is repeated first')
})

test('the app title thread is answered in place and never becomes a DSH conversation', async () => {
  const { bridge, calls } = fakeControl()
  const notes = []
  const notify = async (method, params) => { notes.push([method, params]) }
  await bridge.methods['turn/start'](hello('请向我提出一个问题'), { notify })
  const started = await bridge.methods['thread/start']({ ephemeral: true, threadSource: 'thread_title', cwd: '/Documents/Codex/x' }, { notify })
  assert.match(started.thread.id, /^ephemeral-/u)
  const creates = calls.filter(([name]) => name === 'create').length
  await bridge.methods['turn/start']({ threadId: started.thread.id, input: [{ type: 'text', text: 'You are a helpful assistant...\n\n请向我提出一个问题' }] }, { notify })
  await new Promise(resolve => setTimeout(resolve, 5))
  const done = notes.find(([method, params]) => method === 'turn/completed' && params.threadId === started.thread.id)
  assert.equal(done[1].turn.items[0].text, '请向我提出一个问题')
  assert.equal(calls.filter(([name]) => name === 'create').length, creates, 'no DSH session was created')
  assert.equal(calls.filter(([name, request]) => name === 'prompt' && request.sessionId === started.thread.id).length, 0)
})

test('a folder the phone invents is not used as the conversation folder', () => {
  assert.equal(localFolder('/Documents/Codex/2026-10-09/new-chat'), undefined)
  assert.equal(localFolder('relative/path'), undefined)
  assert.equal(localFolder(process.cwd()), process.cwd())
})

test("DSH's injected runtime context never shows up as a message from the person", () => {
  const turns = projectTurns([
    { role: 'user', id: 'a', source: { kind: 'user' }, content: [{ type: 'text', text: 'ask me' }] },
    { role: 'assistant', id: 'b', content: [{ type: 'text', text: 'ok' }] },
    { role: 'user', id: 'c', source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'Current runtime context. ...' }] },
    { role: 'assistant', id: 'd', content: [{ type: 'text', text: 'next' }] },
  ])
  assert.equal(turns.length, 1)
  assert.deepEqual(turns[0].items.map(item => item.type), ['userMessage', 'agentMessage', 'agentMessage'])
})

test('a question waits for a phone that dropped and asks it again when it reopens the thread', async () => {
  const { bridge, session } = fakeControl()
  const first = async () => {}
  let rejectFirst
  first.ask = () => new Promise((_resolve, reject) => { rejectFirst = reject })
  await bridge.methods['turn/start'](hello('go'), { notify: first })
  const request = { agent: { session }, questions: [{ id: 'q', question: 'Why?' }] }
  const answer = bridge.onQuestion(request, async () => 'dsh')
  await new Promise(resolve => setTimeout(resolve, 5))
  bridge.forget(first)
  rejectFirst(new Error('Client disconnected'))
  await new Promise(resolve => setTimeout(resolve, 5))
  const second = async () => {}
  second.ask = async () => ({ answers: { q: { answers: ['because'] } } })
  await bridge.methods['thread/resume']({ threadId: 's1' }, { notify: second })
  assert.deepEqual((await answer).answers, [{ id: 'q', selected: [], custom: 'because' }])
})

test('text the model is still writing reaches the phone as it arrives, then the committed message finishes the same item', async () => {
  const { bridge, session, finish } = fakeControl()
  const notes = []
  const notify = async (method, params) => { notes.push([method, params]) }
  await bridge.methods['turn/start'](hello('go'), { notify })
  bridge.onStream(session, { type: 'start' })
  bridge.onStream(session, { type: 'chunk', chunk: { type: 'reasoning-delta', text: 'thinking' } })
  bridge.onStream(session, { type: 'chunk', chunk: { type: 'text-delta', text: 'Hel' } })
  bridge.onStream(session, { type: 'chunk', chunk: { type: 'text-delta', text: 'lo' } })
  const started = notes.filter(([method]) => method === 'item/started').at(-1)[1].item
  assert.equal(started.type, 'agentMessage')
  assert.deepEqual(notes.filter(([method]) => method === 'item/agentMessage/delta').map(([, params]) => [params.itemId, params.delta]), [[started.id, 'Hel'], [started.id, 'lo']])
  session.deriveMessages = () => [{ role: 'assistant', id: 'a1', content: [{ type: 'text', text: 'Hello' }] }]
  bridge.onSessionEvent(session, { type: 'assistant/message' })
  bridge.onStream(session, { type: 'end', outcome: { kind: 'committed', eventType: 'assistant/message' } })
  const done = notes.filter(([method]) => method === 'item/completed').map(([, params]) => params.item).filter(item => item.type === 'agentMessage')
  assert.deepEqual(done.map(item => [item.id, item.text]), [[started.id, 'Hello']])
  finish(); await wait()
})

test('a streamed attempt that never commits is closed instead of hanging on the phone', async () => {
  const { bridge, session, finish } = fakeControl()
  const notes = []
  const notify = async (method, params) => { notes.push([method, params]) }
  await bridge.methods['turn/start'](hello('go'), { notify })
  bridge.onStream(session, { type: 'start' })
  bridge.onStream(session, { type: 'chunk', chunk: { type: 'text-delta', text: 'partial' } })
  bridge.onStream(session, { type: 'end', outcome: { kind: 'abandoned' } })
  const done = notes.filter(([method]) => method === 'item/completed').map(([, params]) => params.item).filter(item => item.type === 'agentMessage')
  assert.deepEqual(done.map(item => item.text), ['partial'])
  finish(); await wait()
})

test('a reply without any reasoning block is not lost on its way to the phone', async () => {
  const { bridge, session, finish } = fakeControl()
  const notes = []
  const notify = async (method, params) => { notes.push([method, params]) }
  await bridge.methods['turn/start'](hello('go'), { notify })
  session.deriveMessages = () => [{ role: 'assistant', id: 'a1', content: [{ type: 'text', text: 'Hi there' }] }]
  bridge.onSessionEvent(session, { type: 'assistant/message' })
  const texts = notes.filter(([method]) => method === 'item/completed').map(([, params]) => params.item).filter(item => item.type === 'agentMessage').map(item => item.text)
  assert.deepEqual(texts, ['Hi there'])
  finish(); await wait()
})

const PNG_URL = `data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`

function fakeAttachments() {
  const saved = []
  return {
    saved,
    saveImage: async input => { saved.push(input); return { attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: input.mediaType, bytes: input.data.length, width: 1, height: 1 } },
    readImage: async ref => ({ ref, data: new Uint8Array(Buffer.from('fake-png')) }),
  }
}

test("a photo from the phone goes to DSH with the text, in the form DSH's own prompt endpoint admits", async () => {
  const store = fakeAttachments()
  const calls = []
  const control = fakeControl()
  const bridge = createDshRemoteControl({ controller: () => ({
    resolveAgent: async () => ({ agent: { session: control.session, options: {}, whenIdle: () => new Promise(() => {}) } }),
    modelCatalog: async () => ({ groups: [] }), selectModel: async () => {},
    prompt: async request => { calls.push(request); return {} },
  }), attachments: () => store, userAgent: 'x/1' })
  const notes = []
  await bridge.methods['turn/start']({ threadId: 's1', input: [{ type: 'text', text: 'what is this?', text_elements: [] }, { type: 'image', url: PNG_URL }] }, { notify: async (method, params) => { notes.push([method, params]) } })
  assert.deepEqual(calls[0].content.map(block => block.type), ['text', 'image'])
  assert.deepEqual([calls[0].content[1].mediaType, calls[0].content[1].data], ['image/png', Buffer.from('fake-png').toString('base64')])
  const shown = notes.find(([method, params]) => method === 'item/completed' && params.item.type === 'userMessage')[1].item
  assert.deepEqual(shown.content.map(part => part.type), ['text', 'image'])
})

test('an image alone is a message; non-inline images and empty input are refused', async () => {
  const store = fakeAttachments()
  const control = fakeControl()
  const calls = []
  const bridge = createDshRemoteControl({ controller: () => ({
    resolveAgent: async () => ({ agent: { session: control.session, options: {}, whenIdle: () => new Promise(() => {}) } }),
    modelCatalog: async () => ({ groups: [] }), selectModel: async () => {},
    prompt: async request => { calls.push(request); return {} },
  }), attachments: () => store, userAgent: 'x/1' })
  const notify = async () => {}
  await bridge.methods['turn/start']({ threadId: 's1', input: [{ type: 'image', url: PNG_URL }] }, { notify })
  assert.deepEqual(calls[0].content.map(block => block.type), ['image'])
  await assert.rejects(() => bridge.methods['turn/start']({ threadId: 's2', input: [{ type: 'image', url: 'file:///x.png' }] }, { notify }), /inline/u)
  await assert.rejects(() => bridge.methods['turn/start']({ threadId: 's3', input: [] }, { notify }), /text or an image/u)
})

test('images in a conversation, the person\'s and the ones tools return, reach the phone as data URLs', () => {
  const id = `sha256:${'b'.repeat(64)}`
  const urls = new Map([[id, PNG_URL]])
  const turns = projectTurns([
    { role: 'user', id: 'u', content: [{ type: 'text', text: 'draw' }, { type: 'image', attachment: { attachmentId: id } }] },
    { role: 'assistant', id: 'a', content: [{ type: 'tool-call', id: 'c1', name: 'codex_image_generate', arguments: '{}' }] },
    { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: 'Generated an image.' }, { type: 'image', attachment: { attachmentId: id } }] },
  ], 1_000_000, urls)
  assert.deepEqual(turns[0].items[0].content.map(part => part.type), ['text', 'image'])
  assert.deepEqual([turns[0].items[1].type, turns[0].items[1].status, turns[0].items[1].result], ['imageGeneration', 'completed', PNG_URL.slice(PNG_URL.indexOf(',') + 1)])
})

test('the phone folder picker sees real local folders and nothing for made-up ones', async () => {
  const { bridge } = fakeControl()
  const root = await mkdtemp(join(tmpdir(), 'rc-folder-'))
  try {
    await mkdir(join(root, 'sub'))
    await writeFile(join(root, 'a.txt'), 'x')
    await writeFile(join(root, '.hidden'), 'x')
    const listed = await bridge.methods['fs/readDirectory']({ path: root }, {})
    assert.deepEqual(listed.entries.map(entry => [entry.fileName, entry.isDirectory]), [['sub', true], ['a.txt', false]])
    assert.equal((await bridge.methods['fs/getMetadata']({ path: root }, {})).isDirectory, true)
    assert.equal((await bridge.methods['fs/getMetadata']({ path: join(root, 'a.txt') }, {})).isFile, true)
    assert.deepEqual((await bridge.methods['fs/readDirectory']({ path: '/Documents/Codex/made-up' }, {})).entries, [])
    assert.equal((await bridge.methods['fs/getMetadata']({ path: '/Documents/Codex/made-up' }, {})).isDirectory, true)
  } finally { await rm(root, { recursive: true, force: true }) }
})

const enrollOk = () => ({ ok: true, json: async () => ({ environment_id: 'env', server_id: 'srv', remote_control_token: 'tok', expires_at: new Date(Date.now() + 3_600_000).toISOString() }) })

test('a connection that stops answering pings is dropped and reconnected', async () => {
  const sockets = []
  class Silent {
    constructor() { this.handlers = {}; this.pings = 0; this.terminated = false; sockets.push(this); queueMicrotask(() => this.handlers.open?.()) }
    on(name, handler) { this.handlers[name] = handler }
    ping() { this.pings += 1 }
    terminate() { this.terminated = true; this.handlers.close?.() }
    close() { this.handlers.close?.() }
  }
  const relay = createRemoteControlRelay({
    credentials: async () => ({ access: 'a', accountId: 'b' }), fetch: async () => enrollOk(), WebSocket: Silent, installationId: 'i', hostName: 'h', userAgent: 'x/1',
    serve: () => ({ receive() {}, close() {} }), wait: () => new Promise(resolve => setTimeout(resolve, 2)), pingMs: 5, pongTimeoutMs: 30,
  })
  void relay.start()
  await wait(120)
  await relay.stop()
  assert.ok(sockets[0].pings >= 2, 'it pings')
  assert.equal(sockets[0].terminated, true, 'a silent socket is terminated')
  assert.ok(sockets.length >= 2, 'and a new one is opened')
})

test('a socket that keeps answering pings stays connected', async () => {
  const sockets = []
  class Alive {
    constructor() { this.handlers = {}; sockets.push(this); queueMicrotask(() => this.handlers.open?.()) }
    on(name, handler) { this.handlers[name] = handler }
    ping() { queueMicrotask(() => this.handlers.pong?.()) }
    terminate() { this.handlers.close?.() }
    close() { this.handlers.close?.() }
  }
  const relay = createRemoteControlRelay({
    credentials: async () => ({ access: 'a', accountId: 'b' }), fetch: async () => enrollOk(), WebSocket: Alive, installationId: 'i', hostName: 'h', userAgent: 'x/1',
    serve: () => ({ receive() {}, close() {} }), wait: (_ms, signal) => new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })), pingMs: 5, pongTimeoutMs: 30,
  })
  void relay.start()
  await wait(120)
  await relay.stop()
  assert.equal(sockets.length, 1)
})

test('a server Retry-After is a floor for the next attempt and a flapping connection keeps backing off', async () => {
  assert.equal(retryAfterMs('7'), 7000)
  assert.equal(retryAfterMs('Wed, 21 Oct 2026 07:28:10 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT')), 10_000)
  assert.equal(retryAfterMs('soon'), undefined)
  const waits = []
  let tries = 0
  const fetch = async () => {
    tries += 1
    if (tries === 1) return { ok: false, status: 429, headers: { get: () => '90' }, json: async () => ({}) }
    return enrollOk()
  }
  class Flap { constructor() { this.handlers = {}; queueMicrotask(() => { this.handlers.open?.(); this.handlers.close?.() }) } on(name, handler) { this.handlers[name] = handler } close() {} }
  const relay = createRemoteControlRelay({
    credentials: async () => ({ access: 'a', accountId: 'b' }), fetch, WebSocket: Flap, installationId: 'i', hostName: 'h', userAgent: 'x/1',
    serve: () => ({ receive() {}, close() {} }), random: () => 1,
    wait: (ms, signal) => { waits.push(ms); return new Promise(resolve => { const timer = setTimeout(resolve, waits.length >= 5 ? 1_000_000 : 1); signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true }) }) },
  })
  void relay.start()
  await wait(50)
  await relay.stop()
  assert.ok(waits[0] >= 90_000, 'Retry-After is honoured')
  assert.deepEqual(waits.slice(1, 5), [2000, 4000, 8000, 16000], 'quick drops do not reset the backoff')
})

function bridgeWithWorkspaces() {
  const made = fakeControl()
  const workspaces = { archivedSessionIds: [], list: () => [{ id: 'w1', path: 'C:/work/app', title: 'App', sessionIds: ['s1'], createdAt: 1_000_000, updatedAt: 2_000_000 }, { id: 'w2', path: 'C:/work/empty', title: '', sessionIds: [], createdAt: 1_000_000, updatedAt: 1_500_000 }] }
  const forks = []
  const bridge = createDshRemoteControl({
    controller: () => ({
      resolveAgent: async id => ({ agent: { session: { ...made.session, id }, options: { provider: 'openai-codex', model: 'gpt-6' } } }),
      list: async () => ({ items: [{ sessionId: 's1', updatedAt: 2_000_000, blank: false, cwd: 'C:/work/app' }, { sessionId: 's2', updatedAt: 1_000_000, blank: false, cwd: 'C:/other' }, { sessionId: 's3', updatedAt: 500_000, blank: false, cwd: 'C:/other' }] }),
      modelCatalog: async () => ({ groups: [] }), selectModel: async () => {},
      create: async request => { forks.push(['create', request]); return { sessionId: 's1' } },
      fork: async request => { forks.push(['fork', request]); return { sessionId: 's1' } },
    }),
    workspaces: () => workspaces, usage: () => ({ read: async () => ({ rateLimits: [{ id: 'codex', name: 'Codex', windows: [{ usedPercent: 42.4, remainingPercent: 57.6, windowSeconds: 18_000, resetsAt: 1_900_000_000 }, { usedPercent: 10, remainingPercent: 90, windowSeconds: 604_800 }] }] }) }), userAgent: 'x/1',
  })
  return { bridge, forks }
}

test('DSH workspaces appear as the phone projects and new chats can start in one', async () => {
  const { bridge, forks } = bridgeWithWorkspaces()
  const projects = await bridge.methods['project/list']({}, {})
  assert.deepEqual(projects.data.map(project => [project.id, project.name, project.roots[0].path]), [['w1', 'App', 'C:/work/app'], ['w2', 'empty', 'C:/work/empty']])
  assert.equal(projects.data[1].recencyAt, null)
  assert.equal((await bridge.methods['project/read']({ projectId: 'w1' }, {})).project.name, 'App')
  await assert.rejects(() => bridge.methods['project/read']({ projectId: 'nope' }, {}), /not found/u)
  const listed = await bridge.methods['thread/list']({}, {})
  assert.equal(listed.data.find(entry => entry.id === 's1').projectId, 'w1')
  assert.deepEqual((await bridge.methods['thread/list']({ projectId: 'w1' }, {})).data.map(entry => entry.id), ['s1'])
  await bridge.methods['thread/start']({ projectId: 'w1' }, { notify: async () => {} })
  assert.deepEqual(forks.find(entry => entry[0] === 'create')[1], { workspaceId: 'w1' })
})

test('thread/list filters by folder and excluded ids and pages with a cursor', async () => {
  const { bridge } = bridgeWithWorkspaces()
  assert.deepEqual((await bridge.methods['thread/list']({ cwd: 'C:/other' }, {})).data.map(entry => entry.id), ['s2', 's3'])
  assert.deepEqual((await bridge.methods['thread/list']({ excludedThreadIds: ['s1'] }, {})).data.map(entry => entry.id), ['s2', 's3'])
  const first = await bridge.methods['thread/list']({ limit: 2 }, {})
  assert.equal(first.data.length, 2)
  const second = await bridge.methods['thread/list']({ limit: 2, cursor: first.nextCursor }, {})
  assert.deepEqual([second.data.length, second.nextCursor], [1, null])
})

test('the phone reads Codex usage as rate-limit windows', async () => {
  const { bridge } = bridgeWithWorkspaces()
  const limits = await bridge.methods['account/rateLimits/read']({}, {})
  assert.deepEqual([limits.rateLimits.primary.usedPercent, limits.rateLimits.primary.windowDurationMins, limits.rateLimits.primary.resetsAt], [42, 300, 1_900_000_000])
  assert.equal(limits.rateLimits.secondary.windowDurationMins, 10_080)
  assert.equal(Object.keys(limits.rateLimitsByLimitId)[0], 'codex')
  const none = createDshRemoteControl({ controller: () => ({}), userAgent: 'x/1' })
  assert.equal((await none.methods['account/rateLimits/read']({}, {})).rateLimits.primary, null)
})

test('a thread can be forked from the phone and its turns listed in pages', async () => {
  const { bridge, forks } = bridgeWithWorkspaces()
  const forked = await bridge.methods['thread/fork']({ threadId: 's1' }, { notify: async () => {} })
  assert.equal(forked.thread.id, 's1')
  assert.deepEqual(forks.find(entry => entry[0] === 'fork')[1], { sessionId: 's1' })
  const turns = await bridge.methods['thread/turns/list']({ threadId: 's1', limit: 1 }, {})
  assert.equal(turns.data.length, 1)
})

test('a new thread title and the token usage reach a phone that has the thread open', async () => {
  const made = fakeControl()
  const bridge = createDshRemoteControl({
    controller: () => ({ resolveAgent: async () => ({ agent: { session: made.session, options: {}, whenIdle: () => Promise.resolve() } }), modelCatalog: async () => ({ groups: [] }), selectModel: async () => {}, prompt: async () => ({}) }),
    projections: () => ({ snapshot: () => ({ values: { tokenUsage: { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 0 }, contextPressure: { pressureTokens: 1234, contextWindow: 272000 } } }) }), userAgent: 'x/1',
  })
  const notes = []
  const notify = async (method, params) => { notes.push([method, params]) }
  await bridge.methods['thread/resume']({ threadId: 's1' }, { notify })
  bridge.onSessionEvent(made.session, { type: 'session/title', data: { title: 'Fix the build' } })
  assert.deepEqual(notes.find(([method]) => method === 'thread/name/updated')[1], { threadId: 's1', threadName: 'Fix the build' })
  await bridge.methods['turn/start'](hello('go'), { notify })
  await wait(20)
  const usage = notes.find(([method]) => method === 'thread/tokenUsage/updated')[1].tokenUsage
  assert.deepEqual([usage.total.totalTokens, usage.total.cachedInputTokens, usage.last.totalTokens, usage.modelContextWindow], [170, 50, 1234, 272000])
})

test("shell commands and file edits show up with the phone's own command and diff views", () => {
  const call = (id, name, args) => ({ type: 'tool-call', id, name, arguments: JSON.stringify(args) })
  const turns = projectTurns([
    { role: 'user', id: 'u', content: [{ type: 'text', text: 'fix it' }] },
    { role: 'assistant', id: 'a', content: [call('c1', 'bash', { command: 'git status', description: 'Show status' }), call('c2', 'edit', { file_path: 'src/a.js', old_string: 'one', new_string: 'two\nthree' }), call('c3', 'write', { file_path: 'b.txt', content: 'hi' }), call('c4', 'web_search', { query: 'x' })] },
    { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: 'clean' }] },
    { role: 'tool', toolCallId: 'c2', isError: true, content: [{ type: 'text', text: 'no match' }] },
    { role: 'tool', toolCallId: 'c3', content: [{ type: 'text', text: 'ok' }] },
  ], 1_000_000, undefined, 'C:/w')
  const [command, edit, write, other] = turns[0].items.slice(1)
  assert.deepEqual([command.type, command.command, command.cwd, command.aggregatedOutput, command.exitCode, command.status], ['commandExecution', 'git status', 'C:/w', 'clean', 0, 'completed'])
  assert.deepEqual([edit.type, edit.status, edit.changes[0].path, edit.changes[0].kind.type], ['fileChange', 'failed', 'src/a.js', 'update'])
  assert.equal(edit.changes[0].diff, '@@\n-one\n+two\n+three')
  assert.deepEqual([write.type, write.changes[0].kind.type, write.changes[0].diff, write.status], ['fileChange', 'add', '+hi', 'completed'])
  assert.deepEqual([other.type, other.tool, other.status], ['dynamicToolCall', 'web_search', 'inProgress'])
})

test('a file edit approval uses the phone file-change request', async () => {
  const { bridge, session } = fakeControl()
  session.deriveMessages = () => [{ role: 'assistant', id: 'a', content: [{ type: 'tool-call', id: 'e1', name: 'edit', arguments: '{"file_path":"a.js","old_string":"x","new_string":"y"}' }] }]
  const asked = []
  const notify = async () => {}
  notify.ask = async (method, params) => { asked.push([method, params]); return { decision: 'acceptForSession' } }
  await bridge.methods['turn/start'](hello('go'), { notify })
  const result = await bridge.onApproval({ agent: { session }, toolName: 'edit', callId: 'e1' }, async () => 'rejected')
  assert.equal(result, 'allowed-once')
  assert.equal(asked[0][0], 'item/fileChange/requestApproval')
  assert.equal(asked[0][1].itemId, 'e1')
})

test('the DSH task list becomes the phone plan', async () => {
  const { bridge, session, finish } = fakeControl()
  const notes = []
  await bridge.methods['turn/start'](hello('go'), { notify: async (method, params) => { notes.push([method, params]) } })
  session.deriveMessages = () => [{ role: 'assistant', id: 'a', content: [{ type: 'tool-call', id: 't1', name: 'todo_write', arguments: JSON.stringify({ todos: [{ content: 'Read code', status: 'completed' }, { content: 'Fix bug', status: 'in_progress' }, { content: 'Test', status: 'pending' }] }) }] }]
  bridge.onSessionEvent(session, { type: 'assistant/message' })
  assert.deepEqual(notes.find(([method]) => method === 'turn/plan/updated')[1].plan, [{ step: 'Read code', status: 'completed' }, { step: 'Fix bug', status: 'inProgress' }, { step: 'Test', status: 'pending' }])
  finish(); await wait()
})
