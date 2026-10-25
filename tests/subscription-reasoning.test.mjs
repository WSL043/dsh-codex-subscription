import test from 'node:test'
import assert from 'node:assert/strict'
import { Session } from '@deepseek-ai/dsh-session'
import { createReasoningBridge } from '../src/subscription-reasoning.js'
import { REASONING_STATE_KEY } from '../src/reasoning-updates.js'

const model = { id: 'gpt-6.1-sol', provider: 'openai-codex', api: 'openai-codex-responses', baseUrl: 'https://chatgpt.com/backend-api', reasoning: true }
const user = text => ({ role: 'user', content: [{ type: 'text', text }] })
const block = { type: 'text', text: 'fixture answer' }
const native = { response: { kind: 'pi-ai', version: 2, untouched: true }, blocks: [{ type: 'text', textSignature: 'fixture' }] }
const assistant = finish => ({ role: 'assistant', source: { kind: 'model', provider: model.provider, model: model.id, replayState: structuredClone(finish.replayState) }, content: [block] })
function fixture({ enabled = true, cloud = false, unlimited = false, account = 'synthetic-account', finish = true, fail = false, supported = true, resolveSession } = {}) {
  const wires = [], reasons = []
  const bridge = createReasoningBridge({ enabled: () => enabled, cloud: () => cloud, unlimited: () => unlimited, supportsModel: () => supported, resolveSession, accountScope: async () => account, diagnostic: reason => reasons.push(reason) })
  const target = {
    marker: true,
    async *stream(options) {
      assert.equal(this, target)
      wires.push(bridge.preparePayload({ model: options.model, input: options.messages.map(({ role, content }) => ({ role, content })), reasoning: { effort: options.reasoningEffort ?? 'medium' } }, model, options.sessionId))
      options.abortAfterPayload?.abort()
      if (fail) throw Error('synthetic failure')
      yield { type: 'block-end', index: 0, block }
      if (finish) yield { type: 'finish', reason: { kind: 'stop' }, usage: { cachedInputTokens: 8 }, replayState: native }
    },
    async prepareCall(...args) { assert.equal(this, target); return { args, stream: options => target.stream(options) } },
    identity() { return this.marker },
  }
  const adapter = bridge.wrapAdapter(target)
  const run = async (messages, effort = 'medium', id = 'fixture-session', extra = {}) => {
    const events = []
    for await (const event of adapter.stream({ provider: model.provider, model: model.id, sessionId: id, messages, reasoningEffort: effort, ...extra })) events.push(event)
    return events.at(-1)
  }
  const created = (id = 'fixture-session') => bridge.sessionCreated(Session.create(id))
  return { bridge, adapter, wires, reasons, run, created, setEnabled: value => { enabled = value }, setCloud: value => { cloud = value }, setAccount: value => { account = value }, setFail: value => { fail = value } }
}

test('native creation proof is required, not input size; unknown existing histories remain unchanged', async () => {
  const f = fixture()
  f.bridge.sessionCreated({ id: 'fixture-session', firstLiveSeq: 0, inheritedEventCount: 0, header: { createdAt: 0, isSeeded: false } })
  await f.run([user('first')], 'high')
  assert.equal(f.wires[0].reasoning.effort, 'high'); assert.ok(f.reasons.includes('unknown-window'))
  f.created('new-session')
  const first = await f.run([user('first')], 'medium', 'new-session')
  assert.ok(first.replayState.response[REASONING_STATE_KEY])
  assert.deepEqual(first.replayState.blocks, native.blocks)
  assert.equal(first.replayState.response.untouched, true)
  assert.equal(f.adapter.identity(), true)
})

test('a missing account capability never injects updates, even with creation proof', async () => {
  const f = fixture({ supported: false }); f.created()
  const first = await f.run([user('first')])
  await f.run([user('first'), assistant(first), user('next')], 'high')
  assert.equal(f.wires.at(-1).reasoning.effort, 'high')
  assert.equal(first.replayState.response[REASONING_STATE_KEY], undefined)
})

test('native committed compaction starts a new window, including restart before its first request', async () => {
  let session = Session.create('native-session')
  const events = []
  const append = (type, data, ...rest) => { const e = session.append(type, data, ...rest); events.push(e); return e }
  const addUser = (text, id) => append('user/message', { ...user(text), id, source: { kind: 'user' } }, { surfaceOp: 'append' })
  const addAssistant = (finish, id) => append('assistant/message', { turn: 1, step: 1, message: { ...assistant(finish), id }, stream: [] }, { surfaceOp: 'append' })
  const native = () => session
  const f = fixture({ resolveSession: native })
  addUser('first', 'user-1')
  const first = await f.run(session.deriveMessages(), 'medium', session.id)
  addAssistant(first, 'assistant-1'); addUser('second', 'user-2')
  const second = await f.run(session.deriveMessages(), 'high', session.id)
  assert.equal(f.wires.at(-1).reasoning.effort, 'medium')
  addAssistant(second, 'assistant-2')
  f.bridge.sessionEvent(session, { type: 'compaction/end', data: { error: 'failed summary' } })
  assert.equal(f.bridge.snapshot().pending, 1, 'failed compaction keeps pending state')
  const nodes = [...session.surface.nodes]
  append('user/message', { ...user('native compacted summary'), id: 'checkpoint', source: { kind: 'compact-checkpoint', compactionId: 'compact-1' } }, {
    surfaceOp: { op: 'replace', startSeq: nodes[0], endSeq: nodes.at(-1) }, sourceEventSeqs: nodes,
  })
  const end = append('compaction/end', { compactionId: 'compact-1', turn: null })
  f.bridge.sessionEvent(session, end)
  assert.equal(f.bridge.snapshot().pending, 0)
  session = Session.create(session.id, events, session.header)
  const restored = fixture({ resolveSession: native })
  const compacted = await restored.run(session.deriveMessages(), 'high', session.id)
  assert.equal(restored.wires[0].reasoning.effort, 'high')
  assert.equal(restored.wires[0].input.some(x => x.type === 'configuration_update'), false)
  assert.ok(compacted.replayState.response[REASONING_STATE_KEY].window)
  addAssistant(compacted, 'assistant-3'); addUser('after restore', 'user-3')
  const resumed = fixture({ resolveSession: native })
  await resumed.run(session.deriveMessages(), 'low', session.id)
  assert.equal(resumed.wires[0].reasoning.effort, 'high')
  assert.deepEqual(resumed.wires[0].input.filter(x => x.type === 'configuration_update').map(x => x.reasoning.effort), ['low'])
})

test('a forged summary or an auxiliary subset cannot establish a trusted replacement window', async () => {
  const f = fixture({ resolveSession: () => ({ surface: { contentGeneration: 2 }, deriveMessages: () => [user('native history')] }) })
  const result = await f.run([user('different summary input')])
  assert.equal(result.replayState.response[REASONING_STATE_KEY], undefined)
  assert.ok(f.reasons.includes('unknown-window'))
})

test('state roundtrips on new finishes, restores across bridge instances and forks from the last ancestor', async () => {
  const f = fixture(); f.created()
  const first = await f.run([user('first')]), history = [user('first'), assistant(first), user('next')]
  const second = await f.run(history, 'high')
  assert.equal(f.wires.at(-1).reasoning.effort, 'medium')
  assert.equal(f.wires.at(-1).input[2].type, 'configuration_update')
  const resumed = fixture()
  await resumed.run([...history, assistant(second), user('resume')], 'low')
  assert.deepEqual(resumed.wires[0].input.filter(item => item.type === 'configuration_update').map(item => item.reasoning.effort), ['high', 'low'])
  await resumed.run([user('first'), assistant(first), user('fork')], 'xhigh', 'fork')
  assert.deepEqual(resumed.wires.at(-1).input.filter(item => item.type === 'configuration_update').map(item => item.reasoning.effort), ['xhigh'])
})

test('failed request effort is frozen until input advances; no silent fallback or extra request', async () => {
  const f = fixture({ fail: true }); f.created()
  await assert.rejects(f.run([user('first')]), /synthetic failure/u)
  await assert.rejects(f.run([user('first')], 'high'), /same input/u)
  assert.equal(f.wires.length, 1)
  f.setFail(false)
  const finish = await f.run([user('first')])
  assert.ok(finish.replayState.response[REASONING_STATE_KEY])
  await f.run([user('first'), assistant(finish), user('advance')], 'high')
  assert.equal(f.wires.at(-1).input.find(item => item.type === 'configuration_update').reasoning.effort, 'high')
})

test('cancelled or missing finish does not persist metadata, but keeps bounded retry state', async () => {
  for (const extra of [{ signal: AbortSignal.abort() }, {}]) {
    const f = fixture({ finish: false }); f.created()
    if (extra.signal) await assert.rejects(f.run([user('first')], 'medium', 'fixture-session', extra))
    else {
      const event = await f.run([user('first')])
      assert.equal(event.replayState, undefined)
      await assert.rejects(f.run([user('first')], 'high'), /same input/u)
    }
    assert.equal(f.bridge.snapshot().active, 0)
  }
})

test('cloud, unlimited retries, disabled, changed account, edited assistant and native summary do not misuse state', async () => {
  const f = fixture(); f.created(); const first = await f.run([user('first')])
  const history = [user('first'), assistant(first), user('next')]
  const edited = structuredClone(history); edited[1].content = [{ type: 'text', text: 'edited in the same process' }]
  const editedFinish = await f.run(edited, 'high')
  assert.equal(editedFinish.replayState.response[REASONING_STATE_KEY], undefined)
  assert.equal(f.wires.at(-1).reasoning.effort, 'high')
  for (const mode of ['account', 'edit', 'summary', 'cloud', 'disabled', 'unlimited']) {
    const g = fixture({ enabled: mode !== 'disabled', cloud: mode === 'cloud', unlimited: mode === 'unlimited', account: mode === 'account' ? 'other-account' : 'synthetic-account' })
    const messages = structuredClone(history)
    if (mode === 'edit') messages[1].content = [{ type: 'text', text: 'edited' }]
    if (mode === 'summary') messages.splice(0, 2, user('summary'))
    const done = await g.run(messages, 'high')
    assert.equal(g.wires[0].reasoning.effort, 'high')
    assert.ok(!g.wires[0].input.some(item => item.type === 'configuration_update'))
    assert.equal(done.replayState.response[REASONING_STATE_KEY], undefined)
  }
})

test('prepared calls, session isolation, disposal and bounded lifecycle preserve ownership', async () => {
  const f = fixture(); f.created('left'); f.created('right')
  const call = await f.adapter.prepareCall('provider', 'model', 'signal')
  assert.deepEqual(call.args, ['provider', 'model', 'signal'])
  for await (const _ of call.stream({ provider: model.provider, model: model.id, sessionId: 'left', messages: [user('left')], reasoningEffort: 'low' })) {}
  const right = await f.run([user('right')], 'high', 'right')
  assert.equal(right.replayState.response[REASONING_STATE_KEY].state.baseline, 'high')
  f.bridge.sessionDisposed({ id: 'left' })
  assert.equal(f.bridge.snapshot().pending, 1)
  for (let i = 0; i < 300; i++) f.created(`fresh-${i}`)
  assert.ok(f.bridge.snapshot().fresh <= 256)
})

test('without native history, existing or restored sessions and re-enabling never invent a baseline', async () => {
  const f = fixture({ enabled: false }); f.created(); f.setEnabled(true)
  await f.run([user('existing')], 'high')
  assert.ok(f.reasons.includes('unknown-window'))
  const restored = fixture()
  restored.bridge.sessionCreated({ id: 'fixture-session', firstLiveSeq: 0, inheritedEventCount: 0, header: { createdAt: 0, isSeeded: false } })
  await restored.run([user('restored empty')])
  assert.equal(restored.bridge.snapshot().pending, 0)
  const live = fixture(); live.created(); const first = await live.run([user('first')])
  live.setEnabled(false)
  const history = [user('first'), assistant(first), user('disabled')]
  const disabled = await live.run(history, 'high')
  live.setEnabled(true)
  const enabled = await live.run([...history, assistant(disabled), user('enabled')], 'low')
  assert.equal(enabled.replayState.response[REASONING_STATE_KEY], undefined)
  assert.equal(live.wires.at(-1).reasoning.effort, 'low')
})

test('cancellation after payload preserves pending effort but never stamps a successful checkpoint', async () => {
  const f = fixture(); f.created(); const controller = new AbortController()
  const result = await f.run([user('first')], 'medium', 'fixture-session', { signal: controller.signal, abortAfterPayload: controller })
  assert.equal(result.replayState.response[REASONING_STATE_KEY], undefined)
  assert.equal(f.bridge.snapshot().pending, 1)
  await assert.rejects(f.run([user('first')], 'high'), /same input/u)
})

test('pending ledger never evicts an uncheckpointed retry to admit an unbounded number of sessions', async () => {
  const f = fixture({ finish: false })
  for (let i = 0; i < 260; i++) {
    const id = `pending-${i}`; f.created(id); await f.run([user(id)], 'medium', id)
  }
  assert.equal(f.bridge.snapshot().pending, 256)
  assert.ok(f.reasons.includes('session-limit'))
  await assert.rejects(f.run([user('pending-0')], 'high', 'pending-0'), /same input/u)
  const concurrent = fixture({ finish: false })
  await Promise.all(Array.from({ length: 270 }, (_, i) => {
    const id = `parallel-${i}`; concurrent.created(id); return concurrent.run([user(id)], 'medium', id)
  }))
  assert.ok(concurrent.bridge.snapshot().pending <= 256)
  assert.equal(concurrent.bridge.snapshot().active, 0)
})

test('an ineligible nested request cannot overwrite an outer request checkpoint', async () => {
  for (const mode of ['disabled', 'review', 'title']) {
  let enabled = true, adapter
  const bridge = createReasoningBridge({ enabled: () => enabled, supportsModel: () => true, accountScope: async () => 'synthetic-account' })
  bridge.sessionCreated(Session.create('outer'))
  const target = { async *stream(options) {
    const payload = bridge.preparePayload({ model: model.id, input: [user(options.sessionId)], reasoning: { effort: options.reasoningEffort } }, model)
    assert.equal(payload.reasoning.effort, options.reasoningEffort)
    if (options.sessionId === 'outer' && !options.nested) {
      enabled = mode !== 'disabled'
      const messages = mode === 'review' ? [{ role: 'system', content: [{ type: 'text', text: 'REVIEW_POLICY\nYou are the final authorization reviewer' }] }] : options.messages
      for await (const _ of adapter.stream({ ...options, messages, sessionId: mode === 'disabled' ? 'nested' : 'outer', ...(mode === 'title' ? { purpose: 'session-title' } : {}), reasoningEffort: 'high', nested: true })) {}
      enabled = true
    }
    yield { type: 'block-end', index: 0, block }
    yield { type: 'finish', reason: { kind: 'stop' }, replayState: native }
  } }
  adapter = bridge.wrapAdapter(target)
  let finish
  for await (const event of adapter.stream({ provider: model.provider, model: model.id, sessionId: 'outer', reasoningEffort: 'medium', messages: [user('outer')] })) finish = event
  assert.equal(finish.replayState.response[REASONING_STATE_KEY].state.baseline, 'medium')
  assert.equal(bridge.snapshot().pending, 1)
  }
})

test('overlapping session titles bypass checkpoint writes without allowing concurrent conversation writers', async () => {
  for (const prepared of [false, true]) {
    const f = fixture()
    f.created()
    const call = prepared ? await f.adapter.prepareCall() : f.adapter
    const options = { provider: model.provider, model: model.id, sessionId: 'fixture-session', messages: [user('first')], reasoningEffort: 'medium' }
    const main = call.stream(options)
    try {
      assert.equal((await main.next()).done, false)
      const before = f.bridge.snapshot()
      const titleOptions = { ...options, purpose: 'session-title', messages: [user('summarize title')], reasoningEffort: 'high' }
      let titleFinish
      for await (const event of call.stream(titleOptions)) titleFinish = event
      assert.deepEqual(f.bridge.snapshot(), before, 'the title must not clear or replace the main checkpoint')
      assert.equal(titleFinish.replayState.response[REASONING_STATE_KEY], undefined)
      assert.equal(f.wires.at(-1).reasoning.effort, 'high')
      assert.equal(f.wires.at(-1).input.some(item => item.type === 'configuration_update'), false)
      const conflicting = call.stream(options)
      await assert.rejects(conflicting.next(), error => error.code === 'UNSUPPORTED_OPTION' && /concurrent/.test(error.message))
      const mainFinish = (await main.next()).value
      assert.equal(mainFinish.replayState.response[REASONING_STATE_KEY].state.baseline, 'medium')
    } finally { await main.return() }
    assert.equal(f.bridge.snapshot().active, 0)
    // A title that runs first must not consume the new-session proof either.
    const early = fixture(); early.created()
    await early.run([user('title only')], 'high', 'fixture-session', { purpose: 'session-title' })
    assert.equal(early.bridge.snapshot().fresh, 1)
    const finish = await early.run([user('actual first')], 'medium')
    assert.equal(finish.replayState.response[REASONING_STATE_KEY].state.baseline, 'medium')
  }
})
