import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { appendChunks, callRecord, callNote, isGoodbye, channelOf, createRealtimeVoice, delegationText, parseEvent, promisesAction } from '../src/remote-control-realtime.js'

// A stand-in for the voice service's side channel: what the phone's call would give the host.
class FakeSocket extends EventEmitter {
  static instances = []
  constructor(url, options) { super(); this.url = url; this.options = options; this.sent = []; FakeSocket.instances.push(this); queueMicrotask(() => this.arrive()) }
  arrive() { this.emit('open') }
  send(text) { this.sent.push(JSON.parse(text)) }
  close() { this.closed = true; this.emit('close') }
  hear(message) { this.emit('message', Buffer.from(JSON.stringify(message))) }
}

const setup = (overrides = {}) => {
  FakeSocket.instances = []
  const notes = []
  const notify = async (method, params) => { notes.push({ method, params }) }
  const delegated = []
  const voice = createRealtimeVoice({
    WebSocket: FakeSocket,
    credentials: async () => ({ access: 'test-access', accountId: 'acct' }),
    userAgent: 'test/1',
    delegate: async (threadId, text, onMessage) => { delegated.push({ threadId, text }); await overrides.work?.(onMessage) },
    ...overrides.options,
  })
  return { voice, notes, notify, delegated }
}
const start = { threadId: 't1', transport: { type: 'existingCall', callId: 'rtc_abc' }, realtimeSessionId: 'S1', version: 'v3', realtimeStartInstructions: 'Use prefixes.' }
const settle = () => new Promise(resolve => setTimeout(resolve, 20))

test('joining an existing call: the side channel opens on the call id and the phone is told', async () => {
  const { voice, notes, notify } = setup()
  assert.deepEqual(await voice.start(start, notify), {})
  const [socket] = FakeSocket.instances
  assert.equal(socket.url, 'wss://api.openai.com/v1/live/rtc_abc')
  assert.equal(socket.options.headers.authorization, 'Bearer test-access')
  assert.equal(socket.options.headers['chatgpt-account-id'], 'acct')
  assert.deepEqual(notes.map(note => note.method), ['thread/realtime/started'])
  assert.deepEqual(notes[0].params, { threadId: 't1', version: 'v3', realtimeSessionId: 'S1' })
})

test('transcripts reach the phone, a spoken request runs as a turn and its answer is spoken back', async () => {
  const { voice, notes, notify, delegated } = setup({ work: async onMessage => { onMessage('[STATUS] Looking.'); onMessage('[COMPLETE] It is done.') } })
  await voice.start(start, notify)
  const [socket] = FakeSocket.instances
  socket.hear({ type: 'input_transcript.added', item: { text: 'hel' } })
  socket.hear({ type: 'turn.done', turn: { role: 'assistant', transcript: 'Sure.' } })
  socket.hear({ type: 'delegation.created', item: { id: 'd1', type: 'delegation', target: 'client', content: [{ type: 'input_text', text: 'list files' }] } })
  await settle()
  assert.deepEqual(notes.slice(1).map(note => [note.method, note.params.role]), [['thread/realtime/transcript/delta', 'user'], ['thread/realtime/transcript/done', 'assistant']])
  assert.equal(delegated.length, 1)
  assert.equal(delegated[0].text, 'list files')
  assert.deepEqual(socket.sent.map(message => [message.type, message.delegation_item_id, message.channel, message.content[0].text]), [
    ['delegation.context.append', 'd1', 'commentary', '[STATUS] Looking.'],
    ['delegation.context.append', 'd1', 'speakable', '[COMPLETE] It is done.'],
  ])
  socket.hear({ type: 'delegation.created', item: { id: 'd2', type: 'delegation', target: 'client', content: [{ type: 'input_text', text: 'again' }] } })
  await settle()
  assert.equal(delegated[1].text, 'again')
})

test('stopping closes the call and tells the phone; a closed call is reported once', async () => {
  const { voice, notes, notify } = setup()
  await voice.start(start, notify)
  const [socket] = FakeSocket.instances
  assert.equal(voice.stop('t1'), true)
  assert.equal(socket.closed, true)
  assert.deepEqual(socket.sent.at(-1), { type: 'session.close' })
  assert.equal(notes.filter(note => note.method === 'thread/realtime/closed').length, 1)
  assert.equal(voice.stop('t1'), false)
})

test('the call dropping ends the voice session with a reason', async () => {
  const { voice, notes, notify } = setup()
  await voice.start(start, notify)
  FakeSocket.instances[0].emit('close')
  assert.deepEqual(notes.at(-1), { method: 'thread/realtime/closed', params: { threadId: 't1', reason: 'transportClosed' } })
  assert.equal(voice.active('t1'), false)
})

test('when the first voice endpoint refuses, the next one is tried', async () => {
  FakeSocket.instances = []
  class Refusing extends FakeSocket {
    arrive() { if (this.url.includes('api.openai.com')) this.emit('unexpected-response', undefined, { statusCode: 403 }); else super.arrive() }
  }
  const voice = createRealtimeVoice({ WebSocket: Refusing, credentials: async () => ({ access: 'a', accountId: 'b' }), userAgent: 'x', delegate: async () => {} })
  await voice.start(start, async () => {})
  assert.equal(FakeSocket.instances.at(-1).url, 'wss://realtime.chatgpt.com/v1/live/rtc_abc')
})

test('a start without an existing call is refused', async () => {
  const { voice, notify } = setup()
  await assert.rejects(voice.start({ threadId: 't1', transport: { type: 'websocket' } }, notify), /already set up/u)
})

test('helpers: channel prefixes, chunking, delegation wrapper, event parsing', () => {
  assert.equal(channelOf('[STATUS] x'), 'commentary')
  assert.equal(channelOf('[COMPLETE] x'), 'speakable')
  assert.equal(channelOf('plain answer'), 'speakable')
  assert.equal(channelOf('[ANALYSIS] hidden'), undefined)
  const chunks = appendChunks('字'.repeat(400))
  assert.ok(chunks.length > 1 && chunks.every(chunk => Buffer.byteLength(chunk) <= 500) && chunks.join('') === '字'.repeat(400))
  assert.equal(delegationText('  a <b> & c '), 'a <b> & c')
  assert.match(callRecord([{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }]), /^You: hi\nVoice: hello\n\nThe voice call has ended\./u)
  assert.equal(parseEvent('not json'), undefined)
  assert.deepEqual(parseEvent('{"type":"error","error":{"message":"boom"}}'), { kind: 'error', message: 'boom' })
  assert.equal(parseEvent('{"type":"delegation.created","item":{"id":"x","type":"delegation","target":"server"}}'), undefined)
})

test('what was said and not handed to the agent is saved to the conversation when the call ends', async () => {
  const { voice, notify, delegated } = setup()
  await voice.start({ ...start, realtimeEndInstructions: 'Voice has ended.' }, notify)
  const [socket] = FakeSocket.instances
  socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: 'Hello there' } })
  socket.hear({ type: 'turn.done', turn: { role: 'assistant', transcript: 'Hi!' } })
  voice.stop('t1')
  await settle()
  assert.equal(delegated.length, 1)
  assert.match(delegated[0].text, /^You: Hello there\nVoice: Hi!\n\nThe voice call has ended\./u)
})

test('a spoken request is just its text, and the whole dialogue is saved once when the call ends', async () => {
  const { voice, notify, delegated } = setup()
  await voice.start(start, notify)
  const [socket] = FakeSocket.instances
  socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: 'Check the repo' } })
  socket.hear({ type: 'delegation.created', item: { id: 'd1', type: 'delegation', target: 'client', content: [{ type: 'input_text', text: 'list files' }] } })
  await settle()
  assert.equal(delegated[0].text, 'list files')
  voice.stop('t1')
  await settle()
  assert.equal(delegated.length, 2)
  assert.match(delegated[1].text, /^You: Check the repo\n/u)
})

test('a desktop call leaves its tail as a note in the context, without a turn', async () => {
  const recorded = []
  const { voice, notify, delegated } = setup({ options: { record: async (threadId, text) => { recorded.push({ threadId, text }) } } })
  await voice.start({ ...start, silentTailRecord: true }, notify)
  const [socket] = FakeSocket.instances
  socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: 'Hello there' } })
  socket.hear({ type: 'turn.done', turn: { role: 'assistant', transcript: 'Hi.' } })
  voice.stop('t1')
  await settle()
  assert.equal(delegated.length, 0)
  assert.equal(recorded.length, 1)
  assert.match(recorded[0].text, /You: Hello there\nVoice: Hi\.$/u)
})

test('a goodbye the voice model did not hand over is handed to the agent, which decides; no keyword ends the call by itself', async () => {
  assert.equal(isGoodbye('哦,知道了,拜拜'), true)
  assert.equal(isGoodbye('OK, bye!'), true)
  assert.equal(isGoodbye('check the build'), false)
  assert.equal(isGoodbye('Tell me about the goodbye song in my repo and what it does in this file please'), false)
  const { voice, notify, delegated } = setup()
  await voice.start({ ...start, hangUpOnGoodbye: true }, notify)
  const [socket] = FakeSocket.instances
  socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: 'check the build' } })
  socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: 'ok, bye' } })
  await new Promise(resolve => setTimeout(resolve, 2_800))
  assert.equal(voice.active('t1'), true)
  assert.equal(delegated.length, 1)
  assert.equal(delegated[0].text, 'ok, bye')
})

test('when the voice model hands the goodbye over itself (even just before the final transcript), the host does not ask twice', async () => {
  const { voice, notify, delegated } = setup()
  await voice.start({ ...start, hangUpOnGoodbye: true }, notify)
  const [socket] = FakeSocket.instances
  socket.hear({ type: 'delegation.created', item: { id: 'd1', type: 'delegation', target: 'client', content: [{ type: 'input_text', text: 'bye' }] } })
  socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: 'bye' } })
  await new Promise(resolve => setTimeout(resolve, 2_800))
  assert.equal(delegated.length, 1)
})

test('a close request marks the call as closing and leaves the hanging up to the window', async () => {
  const { voice, notify } = setup()
  await voice.start(start, notify)
  assert.equal(voice.status('t1').closing, false)
  assert.equal(voice.requestClose('t1'), true)
  assert.equal(voice.status('t1').closing, true)
  assert.equal(voice.status('t1').active, true)
  voice.stop('t1')
  assert.equal(voice.requestClose('t1'), false)
})

test('a spoken answer to the agent\'s question that the voice model did not hand over is handed over by the host', async () => {
  const { voice, delegated } = setup({ work: async onMessage => { if (delegated.length === 1) onMessage('[FINAL] Which city do you want?') } })
  await voice.start({ ...start, unhandledHandoverMs: 40 }, async () => {})
  const [socket] = FakeSocket.instances
  socket.hear({ type: 'delegation.created', item: { id: 'd1', type: 'delegation', target: 'client', content: [{ type: 'input_text', text: 'weather tomorrow' }] } })
  await settle()
  socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: 'Shenzhen' } })
  socket.hear({ type: 'turn.done', turn: { role: 'assistant', transcript: 'Shenzhen, let me check.' } })
  await new Promise(resolve => setTimeout(resolve, 120))
  assert.deepEqual(delegated.map(item => item.text), ['weather tomorrow', 'Shenzhen'])
})

test('chit-chat the voice model answered itself is not handed over', async () => {
  const { voice, delegated } = setup()
  await voice.start({ ...start, unhandledHandoverMs: 40 }, async () => {})
  const [socket] = FakeSocket.instances
  socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: 'do you like music' } })
  socket.hear({ type: 'turn.done', turn: { role: 'assistant', transcript: 'I do, quite a lot.' } })
  await new Promise(resolve => setTimeout(resolve, 120))
  assert.equal(delegated.length, 0)
})

test('a promise to go and do something is recognised in Chinese, Japanese and English', () => {
  for (const text of ['深圳今天的天气，我看一下。', 'ちょっと調べますね', "Sure, let me check that", '好，我查一下']) assert.equal(promisesAction(text), true, text)
  for (const text of ['嗯，是啊。', 'はい、聞こえてます。', 'I do, quite a lot.']) assert.equal(promisesAction(text), false, text)
})
