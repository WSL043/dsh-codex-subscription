import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { appendChunks, callRecord, callNote, isGoodbye, channelOf, createRealtimeVoice, delegationText, parseEvent, promisesAction } from '../src/remote-control-realtime.js'
import { createVoiceHangupClassifier } from '../src/voice-hangup.js'

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

test('voice diagnostics correlate background result delivery and playback without saving content', async () => {
  const entries = []
  const log = { info: (area, message, detail) => entries.push({ area, message, detail }), warn() {}, error() {} }
  const { voice, notify } = setup({ options: { log } })
  await voice.start({ ...start, liveFollowups: true }, notify, { desktop: true })
  try {
    const [socket] = FakeSocket.instances
    socket.hear({ type: 'input_transcript.added', item: { text: 'private-user-speech' } })
    socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: 'private-user-speech' } })
    socket.hear({ type: 'session.output_audio.delta', delta: 'private-audio' })
    socket.hear({ type: 'output_transcript.added', item: { text: 'private-assistant-speech' } })
    voice.playback('t1', 'playing')
    voice.playback('t1', 'playing')
    voice.nativeMessage('t1', 'private-result')
    socket.hear({ type: 'turn.done', turn: { role: 'assistant', transcript: 'private-assistant-speech' } })
    const timeline = entries.filter(entry => entry.area === 'voice-flow')
    assert.equal(new Set(timeline.map(entry => entry.detail.match(/call=[a-f0-9]{8}/u)?.[0])).size, 1)
    assert.deepEqual(timeline.map(entry => entry.message), [
      'call connected', 'user transcript started', 'voice transcript finished',
      'service audio output began', 'voice reply transcript started', 'browser playback changed',
      'background result shared as context', 'voice transcript finished',
    ])
    assert.doesNotMatch(JSON.stringify(timeline), /private-|rtc_abc/u)
  } finally { voice.stop('t1') }
})

test('stopping a pending voice join cannot revive it after a later call has started', async () => {
  const {voice,notify}=setup()
  class DelayedSocket extends FakeSocket { arrive() {} }
  const pendingVoice=createRealtimeVoice({WebSocket:DelayedSocket,credentials:async()=>({access:'test',accountId:'test'}),userAgent:'test',delegate:async()=>{}})
  const pending=pendingVoice.start(start,notify)
  await settle()
  assert.equal(pendingVoice.stop('t1'),true)
  await assert.rejects(pending)
  assert.equal(pendingVoice.active('t1'),false)
  pendingVoice.closeAll();voice.closeAll()
})

test('aborting the caller cancels an in-flight sideband without leaving an active session', async () => {
  class DelayedSocket extends FakeSocket { arrive() {} }
  const voice=createRealtimeVoice({WebSocket:DelayedSocket,credentials:async()=>({access:'test',accountId:'test'}),userAgent:'test',delegate:async()=>{}})
  const abort=new AbortController(),opening=voice.start(start,async()=>{}, {signal:abort.signal})
  await settle();abort.abort()
  await assert.rejects(opening)
  assert.equal(voice.active('t1'),false)
  voice.closeAll()
})

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

test('voice sideband attaches the configured proxy to the WebSocket handshake', async () => {
  const lookups = []
  const { voice, notify } = setup({ options: {
    resolveProxy: async ({ target, signal }) => {
      assert.equal(signal.aborted, false)
      lookups.push(target.hostname)
      return 'http://127.0.0.1:7890/'
    },
  } })
  await voice.start(start, notify)
  try {
    assert.deepEqual(lookups, ['api.openai.com'])
    const [socket] = FakeSocket.instances
    assert.equal(socket.options.agent?.proxy?.hostname, '127.0.0.1')
    assert.equal(socket.options.headers.authorization, 'Bearer test-access')
  } finally { voice.stop('t1') }
})

test('input readiness requires a nonempty audio frame, stays private, and resets for each voice session', async () => {
  const { voice, notify, notes, delegated } = setup()
  await voice.start(start, notify)
  const first = FakeSocket.instances[0]
  assert.equal(voice.status('t1').inputReady, false)
  for (const audio of ['', null, 0, []]) first.hear({ type: 'session.input_audio.append', audio })
  first.hear({ type: 'session.output_audio.delta', audio: 'synthetic-audio' })
  assert.equal(voice.status('t1').inputReady, false)
  first.hear({ type: 'session.input_audio.append', audio: 'synthetic-audio' })
  assert.equal(voice.status('t1').inputReady, true)
  first.hear({ type: 'session.input_audio.append', audio: '' })
  assert.equal(voice.status('t1').inputReady, true)
  assert.equal(delegated.length, 0)
  assert.deepEqual(notes.map(note => note.method), ['thread/realtime/started'])
  voice.stop('t1')
  assert.deepEqual(voice.status('t1'), { active: false, working: false, closing: false, lines: [] })
  await voice.start(start, notify)
  first.hear({ type: 'session.input_audio.append', audio: 'late-old-frame' })
  assert.equal(voice.status('t1').inputReady, false)
  voice.stop('t1')
})

test('a spoken free-text answer resolves the running DSH question without queuing another turn', async () => {
  let answer, asked
  const ready = new Promise(resolve => { asked = resolve })
  const { voice, notify, delegated } = setup({ work: async () => {
    const waiting = voice.askQuestion('t1', { questions: [{ id: 'pick', question: 'Which city?' }] })
    asked()
    answer = await waiting
  } })
  await voice.start(start, notify)
  const [socket] = FakeSocket.instances
  socket.hear({ type: 'delegation.created', item: { id: 'task', type: 'delegation', target: 'client', content: [{ type: 'input_text', text: 'Ask me to choose' }] } })
  await ready
  assert.deepEqual(socket.sent.filter(event => event.channel === 'speakable').map(event => [event.type, event.delegation_item_id]), [['delegation.context.append', 'task']])
  assert.match(socket.sent.at(-1).content[0].text, /Which city\?/u)
  socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: '東京です' } })
  socket.hear({ type: 'delegation.created', item: { id: 'echo', type: 'delegation', target: 'client', content: [{ type: 'input_text', text: '東京です' }] } })
  await settle()
  assert.deepEqual(answer, { answers: [{ id: 'pick', selected: [], custom: '東京です' }] })
  assert.equal(delegated.length, 1)
  assert.equal(voice.status('t1').working, false)
  voice.stop('t1')
})

test('interrupting speech redirects the voice without stopping the call or the DSH task', async () => {
  const { voice, notify } = setup()
  await voice.start(start, notify)
  assert.equal(voice.interrupt('t1'), true)
  assert.equal(FakeSocket.instances[0].sent.at(-1).type, 'session.context.append')
  assert.equal(FakeSocket.instances[0].sent.at(-1).channel, 'developer')
  const [socket] = FakeSocket.instances
  socket.hear({ type: 'output_transcript.added', item: { text: 'an old response' } })
  assert.equal(voice.replyEpoch('t1'), 0)
  socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: 'Let me add something' } })
  socket.hear({ type: 'output_transcript.added', item: { text: 'new reply' } })
  socket.hear({ type: 'output_transcript.added', item: { text: 'more of the same reply' } })
  assert.equal(voice.replyEpoch('t1'), 1)
  assert.equal(voice.active('t1'), true)
  voice.stop('t1')
})

test('desktop shares a background result during live speech without requesting playback', async () => {
  const { voice, notify } = setup()
  await voice.start({ ...start, liveFollowups: true }, notify, { desktop: true })
  const [socket] = FakeSocket.instances
  try {
    socket.hear({ type: 'input_transcript.added', item: { text: '少し待って' } })
    socket.hear({ type: 'session.output_audio.delta', delta: 'conversation audio' })
    const lead = '最初に認証の問題が見つかりました。'
    voice.nativeMessage('t1', lead + '次に設定とネットワークを確認しました。'.repeat(80))
    const context = socket.sent.filter(event => event.channel === 'commentary').map(event => event.content[0].text).join('')
    assert.match(context, /\[BACKGROUND_RESULT\]/u)
    assert.ok(context.includes(lead))
    assert.match(context, /See the written answer for remaining details/u)
    assert.ok(Buffer.byteLength(context) < 2200)
    const afterResult = socket.sent.length
    socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: '少し待って' } })
    socket.hear({ type: 'output_transcript.added', item: { text: 'もちろん。' } })
    socket.hear({ type: 'turn.done', turn: { role: 'assistant', transcript: 'もちろん。' } })
    assert.equal(socket.sent.length, afterResult, 'ending the voice reply does not trigger another handoff')
    assert.ok(!socket.sent.some(event => event.channel === 'speakable'))
  } finally { voice.stop('t1') }
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

test('a classified desktop hang-up closes the call while a previous queue admission is still pending', async () => {
  const queued = []
  const classified = []
  const admitted = Promise.withResolvers()
  const { voice, notify, notes } = setup({ options: {
    queue: async (_id, text) => { queued.push(text); await admitted.promise },
    classifyHangUp: async text => { classified.push(text); return text === 'えー、じゃあ今日はこの辺でね' },
  } })
  await voice.start({ ...start, hangUpOnGoodbye: true, liveFollowups: true }, notify, { desktop: true })
  const [socket] = FakeSocket.instances
  const delegate = (id, text) => socket.hear({ type: 'delegation.created', item: { id, type: 'delegation', target: 'client', content: [{ type: 'input_text', text }] } })
  try {
    voice.nativeWork('t1', true)
    delegate('d1', '「バイバイ」の意味を調べて')
    await settle()
    assert.deepEqual(queued, ['「バイバイ」の意味を調べて'])
    const screenDone = voice.waitForScreenAnswer('t1')
    socket.hear({ type: 'input_transcript.added', item: { text: 'えー' } })
    delegate('d2', 'えーじゃあ今日はこの辺でね')
    await settle()
    assert.equal(voice.active('t1'), true, 'a delegation does not decide whether to hang up')
    socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: 'えー、じゃあ今日はこの辺でね' } })
    await settle()
    assert.equal(voice.active('t1'), false)
    assert.equal(socket.closed, true)
    assert.ok(notes.some(note => note.method === 'thread/realtime/closed' && note.params.reason === 'spoken-hangup'))
    screenDone()
    admitted.resolve()
    await settle()
    assert.deepEqual(queued, ['「バイバイ」の意味を調べて'])
    assert.deepEqual(classified, ['えー、じゃあ今日はこの辺でね'])
  } finally { admitted.resolve(); voice.stop('t1') }
})

test('a finalized voice-only sign-off closes the call even when no agent request arrives', async () => {
  const { voice, notify } = setup({ options: {
    queue: async () => assert.fail('a sign-off does not create a turn'),
    classifyHangUp: async text => text === '作業はそのままで。私はそろそろ失礼するね。',
  } })
  await voice.start({ ...start, hangUpOnGoodbye: true, liveFollowups: true }, notify, { desktop: true })
  const [socket] = FakeSocket.instances
  try {
    voice.nativeWork('t1', true)
    socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: '電話は切らないでね。' } })
    await settle()
    assert.equal(voice.active('t1'), true)
    socket.hear({ type: 'turn.done', turn: { role: 'user', transcript: '作業はそのままで。私はそろそろ失礼するね。' } })
    await settle()
    assert.equal(voice.active('t1'), false)
    assert.equal(socket.closed, true)
  } finally { voice.stop('t1') }
})

test('voice hang-up requires a complete affirmative classification and sends only a one-shot utterance', async () => {
  let request, text = 'HANG_UP', reason = 'stop'
  const classify = createVoiceHangupClassifier({ provider: 'openai-codex', model: () => 'test-model',
    async *stream(options) { request = options; yield { type: 'text-delta', text }; yield { type: 'finish', reason: { kind: reason } } },
  })
  const signal = new AbortController().signal
  assert.equal(await classify('えーじゃあ今日はこの辺でね', signal), true)
  assert.deepEqual(request.messages, [{ role: 'user', content: [{ type: 'text', text: 'えーじゃあ今日はこの辺でね' }] }])
  assert.deepEqual(request.tools, [])
  assert.equal(request.sessionId, undefined)
  assert.equal(request.signal, signal)
  text = 'HANG_UP (maybe)'
  assert.equal(await classify('通話は切らないで', signal), false)
  text = 'HANG_UP'; reason = 'max-tokens'
  await assert.rejects(classify('通話は切らないで', signal), /did not complete/)
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

test('a 403 from the voice backend hints at two-step verification', async () => {
  const { createVoiceCall } = await import('../src/remote-control-realtime.js')
  const call = status => createVoiceCall({ fetch: async () => ({ ok: false, status, text: async () => 'denied', headers: new Headers() }), credentials: async () => ({ access: 'a', accountId: 'b' }), userAgent: 'test/1', sdp: 'v=0', session: {} })
  await assert.rejects(call(403), /HTTP 403.*two-step verification/u)
  await assert.rejects(call(500), error => !/two-step/u.test(error.message))
})
