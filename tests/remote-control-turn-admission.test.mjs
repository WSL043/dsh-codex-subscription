import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createDshRemoteControl } from '../src/remote-control-dsh.js'

const deferred = () => Promise.withResolvers()
const tick = () => new Promise(resolve => setImmediate(resolve))
async function until(predicate) {
  const end = Date.now() + 1500
  while (!predicate()) { if (Date.now() > end) throw Error('Admission did not settle'); await tick() }
}
const input = text => [{ type: 'text', text }]
function fixture(voice) {
  const calls = [], notes = [], idle = []
  let admission = async () => ({ accepted: true }), resolve = async () => {}, tier = 'default', speedGate
  const messages = []
  const session = { id: 's', meta: {}, deriveMessages: () => messages }
  const agent = { session, status: 'idle', whenIdle: () => { const next = deferred(); idle.push(next); return next.promise } }
  const bridge = createDshRemoteControl({
    controller: () => ({
      resolveAgent: async () => { await resolve(); return { agent } },
      modelCatalog: async () => ({ groups: [] }),
      prompt: async (request, signal) => { calls.push({ request, signal }); return admission(request, signal) },
      cancel: () => { calls.push({ cancel: true }) },
    }), agents: () => ({}), userAgent: 'admission-test/1', voice,
    speed: { current: () => tier, set: async value => { tier = value; if (speedGate) await speedGate.promise } },
  })
  const notify = async (method, params) => { notes.push({ method, params: structuredClone(params) }) }
  const call = (method, params, context = {}) => bridge.methods[method]({ threadId: 's', ...params }, { notify, ...context })
  const start = (text = 'opening', extra = {}) => call('turn/start', { input: input(text), ...extra })
  const add = text => call('thread/queue/add', { input: input(text), clientUserMessageId: text })
  const list = () => call('thread/queue/list').data
  const prompts = () => calls.filter(call => call.request)
  const completed = () => notes.filter(note => note.method === 'turn/completed')
  return { bridge, session, agent, messages, calls, notes, idle, call, start, add, list, prompts, completed,
    admit: value => { admission = value }, resolve: value => { resolve = value },
    speedGate: value => { speedGate = value }, tier: () => tier }
}

for (const origin of ['voice', 'native', 'reopened voice']) {
  test(`desktop voice queues behind a running ${origin} turn and associates results when DSH starts them`, async () => {
    const alreadyRunning = origin === 'native'
    let socket
    class VoiceSocket extends EventEmitter {
      sent = []
      constructor() { super(); socket = this; queueMicrotask(() => this.emit('open')) }
      send(frame) { this.sent.push(JSON.parse(frame)) }
      close() { this.emit('close') }
      delegate(id, text) {
        this.emit('message', JSON.stringify({ type: 'delegation.created', item: { type: 'delegation', target: 'client', id, content: [{ type: 'input_text', text }] } }))
      }
    }
    const f = fixture({
      WebSocket: VoiceSocket,
      credentials: async () => ({ access: 'test', accountId: 'test' }),
      fetch: async () => new Response('v=0', { headers: { location: '/calls/rtc_test_test' } }),
    })
    const admission = deferred()
    const admitted = []
    f.admit(async request => {
      await admission.promise
      admitted.push(request)
      return { accepted: true }
    })
    const begin = request => {
      f.agent.status = 'running'
      f.bridge.onSessionEvent(f.session, { type: 'turn/start' })
      if (request) f.bridge.onSessionEvent(f.session, { type: 'user/message', data: { source: { kind: 'user', rpcId: request.requestId } } })
    }
    if (alreadyRunning) f.agent.status = 'running'
    try {
      await f.bridge.desktopVoice.start({ sessionId: 's', sdp: 'v=0', language: 'ja' })
      if (!alreadyRunning) {
        socket.delegate('first', 'Check the documentation')
        await until(() => f.prompts().length === 1)
      }
      if (origin === 'reopened voice') {
        admission.resolve()
        await until(() => admitted.length === 1)
        begin(admitted.shift())
        f.messages.push({ role: 'user', content: input('The chosen colour is blue. <system-reminder>internal secret</system-reminder>') }, { role: 'tool', content: input('private tool output') })
        f.agent.inject = () => assert.fail('the previous DSH task is still working')
        socket.emit('message', JSON.stringify({ type: 'turn.done', turn: { role: 'assistant', transcript: 'The last call was about the blue option.' } }))
        f.bridge.desktopVoice.stop('s')
        await f.bridge.desktopVoice.start({ sessionId: 's', sdp: 'v=0', language: 'ja' })
        const history = socket.sent.filter(event => event.channel === 'commentary').map(event => event.content[0].text).join('')
        assert.match(history, /chosen colour is blue/u)
        assert.match(history, /last call was about the blue option/u)
        assert.doesNotMatch(history, /internal secret|private tool output/u)
        assert.ok(!socket.sent.some(event => event.channel === 'speakable'))
        f.agent.inject = () => {}
      }
      socket.delegate('followup', 'Focus on the Windows setup')
      if (origin === 'voice') {
        assert.equal(f.prompts().length, 1, 'preserve the order of native queue admissions')
        admission.resolve()
        await until(() => admitted.length === 2)
        begin(admitted.shift())
      }
      if (alreadyRunning) admission.resolve()
      await until(() => socket.sent.some(event => event.delegation_item_id === 'followup' && event.channel === 'commentary'))
      assert.deepEqual(f.prompts().map(call => call.request.mode), alreadyRunning ? ['queue'] : ['queue', 'queue'])
      assert.equal(f.prompts().at(-1).request.content[0].text, 'Focus on the Windows setup')
      assert.equal(f.calls.some(call => call.cancel), false)
      assert.equal(f.bridge.desktopVoice.status('s').working, true)
      const lead = 'I found the Windows setup.'
      const detail = 'It needs one local configuration change.'
      const delta = text => f.bridge.onStream(f.session, { type: 'chunk', chunk: { type: 'text-delta', text } })
      const speech = () => socket.sent.filter(event => event.channel === 'speakable').map(event => event.content[0].text)
      const form = deferred()
      let forms = 0
      if (origin === 'voice') {
        const phone = Object.assign(async () => {}, { ask: async () => assert.fail('phone intercepted the desktop question') })
        await f.call('thread/resume', {}, { notify: phone })
      }
      const question = f.bridge.onQuestion({ agent: f.agent, questions: [{ id: 'choose', question: 'どちらの方式にしますか？', options: [{ label: '標準' }, { label: '詳細' }] }] }, () => { forms++; return form.promise })
      assert.match(speech().at(-1), /^\[SCREEN_CHOICE\]/u)
      assert.equal(f.bridge.desktopVoice.status('s').awaitingScreenAnswer, true)
      for (const text of ['2番でお願いします', '第二个', 'Option two', 'la deuxième option']) {
        socket.emit('message', JSON.stringify({ type: 'turn.done', turn: { role: 'user', transcript: text } }))
        socket.delegate('echo', text)
      }
      await tick()
      assert.equal(forms, 1)
      assert.equal(f.bridge.desktopVoice.status('s').awaitingScreenAnswer, true)
      assert.equal(speech().filter(text => text.startsWith('[SCREEN_CHOICE]')).length, 1)
      form.resolve({ answers: [{ id: 'choose', selected: ['詳細'] }] })
      assert.deepEqual(await question, { answers: [{ id: 'choose', selected: ['詳細'] }] })
      assert.equal(f.bridge.desktopVoice.status('s').awaitingScreenAnswer, false)
      assert.ok(socket.sent.some(event => event.channel === 'commentary' && event.content[0].text.includes('["詳細"]')))
      assert.equal(f.prompts().length, alreadyRunning ? 1 : 2)
      if (origin === 'native') {
        const send = socket.send
        const fallback = { answers: [{ id: 'fallback', selected: [], custom: 'typed on screen' }] }
        assert.equal(await f.bridge.onQuestion({ agent: f.agent, questions: [{ id: 'fallback', question: '長い質問です。'.repeat(40) }] }, () => fallback), fallback)
        socket.send = () => { throw Error('sideband unavailable') }
        assert.equal(await f.bridge.onQuestion({ agent: f.agent, questions: [{ id: 'fallback', question: 'What next?' }] }, () => fallback), fallback)
        socket.send = send
      }
      f.bridge.onStream(f.session, { type: 'start' })
      delta('I found the Windows')
      delta(' setup.')
      delta(' ' + detail)
      assert.ok(!speech().some(text => text.includes(lead)))
      f.bridge.onStream(f.session, { type: 'end', outcome: { eventType: 'assistant/message' } })
      f.bridge.onSessionEvent(f.session, { type: 'assistant/message', data: { message: { id: 'answer', role: 'assistant', content: [{ type: 'text', text: `${lead} ${detail}` }] } } })
      const results = socket.sent.filter(event => event.content?.[0]?.text.includes(lead))
      assert.equal(results.length, 1)
      assert.equal(results[0].channel, 'commentary')
      assert.match(results[0].content[0].text, /It needs one local configuration change/u)
      if (origin === 'voice') assert.equal(results[0].delegation_item_id, 'first')
      else assert.equal(results[0].delegation_item_id, undefined)
      f.agent.status = 'idle'
      f.bridge.onSessionEvent(f.session, { type: 'turn/end', data: {} })
      await until(() => !f.bridge.desktopVoice.status('s').working)
      assert.equal(admitted.length, 1)
      begin(admitted.shift())
      f.bridge.onSessionEvent(f.session, { type: 'assistant/message', data: { message: { role: 'assistant', content: input('Queued task finished') } } })
      assert.ok(socket.sent.some(event => event.delegation_item_id === 'followup' && event.content[0].text.includes('Queued task finished')))
      assert.ok(!f.calls.some(call => call.cancel))
    } finally {
      admission.resolve()
      f.idle[0]?.resolve()
      f.bridge.close()
    }
  })
}
async function retainedQueue(f, count = 1) {
  await f.start()
  const ids = []
  for (let n = 0; n < count; n++) ids.push((await f.add(`queued-${n}`)).queuedSubmission.id)
  f.admit(async () => { throw Error('admission refused') })
  f.idle[0].resolve()
  await until(() => f.completed().length === 2)
  await tick()
  f.admit(async () => ({ accepted: true }))
  return ids
}

test('steer requires the actual active turn and never dispatches stale, missing, empty or pre-cancelled input', async () => {
  const f = fixture()
  await assert.rejects(f.call('turn/steer', { expectedTurnId: 'absent', input: input('no') }), /not active/u)
  const { turn } = await f.start()
  for (const expectedTurnId of [undefined, '', 'other']) await assert.rejects(f.call('turn/steer', { expectedTurnId, input: input('no') }), /not active/u)
  await assert.rejects(f.call('turn/steer', { expectedTurnId: turn.id, input: [] }), /text or an image/u)
  const cancelled = new AbortController(); cancelled.abort()
  await assert.rejects(f.call('turn/steer', { expectedTurnId: turn.id, input: input('no') }, { signal: cancelled.signal }), { name: 'AbortError' })
  f.call('turn/interrupt')
  await assert.rejects(f.call('turn/steer', { expectedTurnId: turn.id, input: input('no') }), /not active/u)
  assert.equal(f.prompts().length, 1)
})

test('accepted steer returns the real turn identity without starting another turn', async () => {
  const f = fixture(), { turn } = await f.start()
  assert.deepEqual(await f.call('turn/steer', { expectedTurnId: turn.id, input: input('change this') }), { turnId: turn.id })
  assert.deepEqual(f.prompts().map(call => call.request.mode), ['queue', 'steer'])
  assert.equal(f.notes.filter(note => note.method === 'turn/started').length, 1)
  f.idle[0].resolve(); await until(() => f.completed().length === 1)
  await f.start('second')
  await assert.rejects(f.call('turn/steer', { expectedTurnId: turn.id, input: input('old target') }), /not active/u)
  assert.equal(f.prompts().filter(call => call.request.mode === 'steer').length, 1)
})

test('late accepted steer holds the target until admission settles and acknowledges that actual delivery', async () => {
  const f = fixture(), { turn } = await f.start(), gate = deferred()
  f.admit(() => gate.promise)
  const steering = f.call('turn/steer', { expectedTurnId: turn.id, input: input('late') })
  f.idle[0].resolve(); await tick(); await tick()
  await assert.rejects(f.start('must not overtake'), /already running/u)
  gate.resolve({ accepted: true })
  assert.deepEqual(await steering, { turnId: turn.id })
  await until(() => f.idle.length === 2)
  assert.equal(f.completed().length, 0, 'late host driver must settle before releasing the turn')
  f.idle[1].resolve()
  await until(() => f.completed().length === 1)
  assert.equal(f.calls.filter(call => call.cancel).length, 1)
  assert.equal(f.notes.filter(note => note.method === 'turn/started').length, 1)
})

test('interrupt during host admission is cancelled again after a late accepted prompt', async () => {
  const f = fixture(), gate = deferred()
  f.admit(() => gate.promise)
  const starting = f.start()
  await until(() => f.prompts().length === 1)
  f.call('turn/interrupt')
  assert.equal(f.prompts()[0].signal.aborted, true)
  gate.resolve({ accepted: true })
  await starting
  assert.equal(f.calls.filter(call => call.cancel).length, 2)
  f.idle[0].resolve(); await until(() => f.completed().length === 1)
  assert.equal(f.completed()[0].params.turn.status, 'interrupted')
})

test('a prompt rejecting on interrupt closes the turn as cancelled without an internal error', async () => {
  const f = fixture()
  f.admit((_request, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })))
  const starting = f.start()
  const rejected = assert.rejects(starting, error => error.code === -32800)
  await until(() => f.prompts().length === 1)
  f.call('turn/interrupt')
  await rejected
  assert.equal(f.completed().length, 1)
  assert.equal(f.completed()[0].params.turn.status, 'interrupted')
  assert.equal(f.completed()[0].params.turn.error, null)
})

test('an explicit host refusal retains a queue entry and ends the attempted turn as failed', async () => {
  const f = fixture(), [id] = await retainedQueue(f)
  f.admit(async () => ({ accepted: false }))
  await assert.rejects(f.call('thread/queue/start', { queuedSubmissionId: id }), /rejected/u)
  assert.equal(f.list()[0].id, id)
  assert.equal(f.completed().at(-1).params.turn.status, 'failed')
})

test('concurrent starts reserve before asynchronous agent resolution', async () => {
  const f = fixture(), gate = deferred()
  f.resolve(() => gate.promise)
  const first = f.start('first')
  await assert.rejects(f.start('second'), /already running/u)
  gate.resolve()
  await first
  assert.equal(f.prompts().length, 1)
})

test('a rejected automatic drain retains its queue item and ends its attempted turn once', async () => {
  const f = fixture(), [id] = await retainedQueue(f)
  assert.deepEqual(f.list().map(entry => entry.id), [id])
  assert.equal(f.prompts().length, 2)
  assert.equal(f.completed()[1].params.turn.status, 'failed')
  await tick(); await tick()
  assert.equal(f.prompts().length, 2, 'failed automatic admission must not spin')
})

test('manual queue start while busy preserves the item without dispatching another prompt', async () => {
  const f = fixture()
  await f.start()
  const { queuedSubmission } = await f.add('later')
  await assert.rejects(f.call('thread/queue/start', { queuedSubmissionId: queuedSubmission.id }), /already running/u)
  assert.equal(f.list()[0].id, queuedSubmission.id)
  assert.equal(f.prompts().length, 1)
})

test('lost acknowledgement retries use the same queue request ID so the host can deduplicate acceptance', async () => {
  const f = fixture(), [id] = await retainedQueue(f)
  const accepted = new Set(), applications = []
  f.admit(async request => {
    if (accepted.has(request.requestId)) return { accepted: true }
    accepted.add(request.requestId); applications.push(request.content)
    throw Error('accepted, but acknowledgement was lost')
  })
  await assert.rejects(f.call('thread/queue/start', { queuedSubmissionId: id }), /acknowledgement was lost/u)
  assert.equal(f.list()[0].id, id)
  const result = await f.call('thread/queue/start', { queuedSubmissionId: id })
  assert.ok(result.turn.id)
  assert.equal(f.list().length, 0)
  assert.equal(applications.length, 1)
  assert.deepEqual(f.prompts().slice(1).map(call => call.request.requestId), [id, id, id])
})

test('concurrent manual starts cannot duplicate admission and reordering does not resurrect deleted items', async () => {
  const f = fixture(), [first, second, third] = await retainedQueue(f, 3), gate = deferred()
  f.admit(() => gate.promise)
  const starting = f.call('thread/queue/start', { queuedSubmissionId: first })
  await until(() => f.prompts().length === 3)
  await assert.rejects(f.call('thread/queue/start', { queuedSubmissionId: first }), /already running/u)
  assert.throws(() => f.call('thread/queue/delete', { queuedSubmissionId: first }), /being accepted/u)
  f.call('thread/queue/reorder', { queuedSubmissionIds: [third, third, second, first] })
  f.call('thread/queue/delete', { queuedSubmissionId: second })
  gate.resolve({ accepted: true }); await starting
  assert.deepEqual(f.list().map(entry => entry.id), [third])
  assert.equal(f.prompts().length, 3)
})

test('deleting a queued item during preparation prevents its dispatch without losing other items', async () => {
  const f = fixture(), [first, second] = await retainedQueue(f, 2), gate = deferred()
  f.resolve(() => gate.promise)
  const starting = f.call('thread/queue/start', { queuedSubmissionId: first })
  assert.equal(f.call('thread/queue/delete', { queuedSubmissionId: first }).deleted, true)
  gate.resolve()
  await assert.rejects(starting, /deleted before starting/u)
  assert.deepEqual(f.list().map(entry => entry.id), [second])
  assert.equal(f.prompts().length, 2)
})

test('temporary speed is restored if an interrupt ends preparation before dispatch', async () => {
  const f = fixture(), gate = deferred()
  f.speedGate(gate)
  const starting = f.start('temporary speed', { serviceTierForTurn: 'priority' })
  await until(() => f.tier() === 'fast')
  f.call('turn/interrupt'); f.speedGate(undefined); gate.resolve()
  await assert.rejects(starting, error => error.code === -32800)
  assert.equal(f.tier(), 'default')
  assert.equal(f.prompts().length, 0)
})

test('empty or invalid image submissions cannot poison a busy thread queue', async () => {
  const f = fixture()
  await f.start()
  for (const parts of [[], [{ type: 'image', url: 'https://example.invalid/image.png' }]]) await assert.rejects(f.call('thread/queue/add', { input: parts }))
  assert.equal(f.list().length, 0)
})
