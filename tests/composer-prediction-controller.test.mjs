import assert from 'node:assert/strict'
import test from 'node:test'
import { composerPredictionAccountKey, composerPredictionContext, createComposerPredictionController } from '../src/composer-prediction-controller.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const result = prediction => ({ ok: true, value: { prediction } })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const state = overrides => ({
  enabled: true, sessionId: 's1', accountKey: 'account-1', provider: 'openai-codex', model: 'gpt-6.1-sol',
  visible: true, focused: true, composing: false,
  input: { draft: '', draftRev: 1, phase: 'plain', attachmentIds: [], occurrences: [] },
  span: { start: 0, end: 0, draftRev: 1 },
  context: { turnId: '1', messages: [{ role: 'user', text: 'Hello' }, { role: 'assistant', text: 'Hello there' }] },
  ...overrides,
})
const chat = nodes => ({
  order: nodes.map((_, index) => String(index)), nodes: new Map(nodes.map((node, index) => [String(index), node])),
  timeline: { turnOrder: [1], turns: new Map([[1, { status: 'closed' }]]) },
})
const user = text => ({ kind: 'user', visibility: 'visible', data: { content: [{ type: 'text', text }] } })
const assistant = text => ({ kind: 'assistant-step', visibility: 'visible', data: { status: 'settled', turn: 1, finalNode: { turn: 1 }, blocks: [{ kind: 'text', text }] } })

test('context reads public visible chat text and excludes hidden, reasoning, tools and injected context', () => {
  const answer = assistant('Public answer')
  answer.data.blocks.push({ kind: 'reasoning', text: 'SECRET' }, { kind: 'tool-call', argsRaw: 'SECRET' })
  const input = user('Public question')
  input.data.content.push({ type: 'image', source: 'SECRET' })
  const value = composerPredictionContext(chat([
    { ...user('SECRET'), visibility: 'hidden' }, input,
    { kind: 'context', visibility: 'visible', data: { content: [{ type: 'text', text: 'SECRET' }] } }, answer,
  ]))
  assert.deepEqual(value, { turnId: '1', messages: [{ role: 'user', text: 'Public question' }, { role: 'assistant', text: 'Public answer' }] })
})

test('only a completed latest assistant turn admits prediction', () => {
  for (const mutate of [
    value => { value.timeline.turns.set(1, { status: 'open' }) },
    value => { value.timeline.turnOrder.push(2) },
    value => { value.nodes.get('1').data.status = 'running' },
    value => { value.nodes.get('1').data.finalNode.interrupted = true },
    value => { value.nodes.get('1').data.finalNode = undefined },
    value => { value.nodes.get('1').data.blocks = [{ kind: 'reasoning', text: 'Not a visible answer' }] },
  ]) {
    const value = chat([user('Hi'), assistant('Hello')]); mutate(value)
    assert.equal(composerPredictionContext(value), null)
  }
  assert.equal(composerPredictionContext(chat([assistant('Hi'), user('new question')])), null)
  assert.equal(composerPredictionContext(chat([assistant('orphan answer')])), null)
  assert.equal(composerPredictionContext(chat([user(''), assistant('image-only user input is not text context')])), null)
  assert.equal(composerPredictionContext(chat([assistant('older'), assistant('newer')])), null)
})

test('prediction context is bounded to 12 messages and 24000 text characters', () => {
  const many = Array.from({ length: 28 }, (_, index) => index % 2 ? assistant('a'.repeat(4000)) : user('u'.repeat(4000)))
  const value = composerPredictionContext(chat(many))
  assert.equal(value.messages.length, 6)
  assert.equal(value.messages.reduce((sum, message) => sum + message.text.length, 0), 24000)
  assert.equal(composerPredictionContext(chat(many.map((_, index) => index % 2 ? assistant('a') : user('u')))).messages.length, 12)
})

test('disabled, other providers, nonempty drafts, attachments, references and initially hidden inputs do no work', async () => {
  const cases = [
    { enabled: false }, { accountKey: undefined }, { provider: 'deepseek' }, { model: 'gpt-5.6-terra' }, { visible: false }, { composing: true },
    { input: { draft: 'mine', draftRev: 1, phase: 'plain' } },
    { input: { draft: '', draftRev: 1, phase: 'plain', attachmentIds: ['file'] } },
    { input: { draft: '', draftRev: 1, phase: 'plain', occurrences: [{}] } },
    { input: { draft: '', draftRev: 1, phase: 'submitting' } }, { context: null },
    { span: { start: 1, end: 1, draftRev: 1 } },
  ]
  let calls = 0
  const controller = createComposerPredictionController({ call: async () => { calls += 1; return result('Hi') } })
  for (const value of cases) controller.update(state(value))
  await tick()
  assert.equal(calls, 0)
  controller.dispose()
})

test('prefetches a completed visible turn while reading; blur and hiding reuse one inference without accepting', async () => {
  const wait = deferred(); let calls = 0; let signal
  const controller = createComposerPredictionController({ call: (_c, _e, _p, value) => { calls++; signal = value; return wait.promise } })
  controller.update(state({ focused: false })); await tick()
  assert.equal(calls, 1)
  controller.update(state({ focused: false, visible: false }))
  assert.equal(signal.aborted, false)
  wait.resolve(result('Tomorrow?')); await tick()
  assert.equal(controller.getSnapshot().prediction, 'Tomorrow?')
  const actions = { captureInsertion: () => state().span, insertText: () => assert.fail('unfocused acceptance') }
  assert.equal(controller.accept(actions, state({ focused: false })), false)
  assert.equal(controller.accept(actions, state({ visible: false })), false)
  controller.update(state())
  assert.equal(calls, 1)
  assert.equal(controller.getSnapshot().prediction, 'Tomorrow?')
  controller.dispose()
})

test('blur during an in-flight request does not burn the turn; draft changes still cancel late output', async () => {
  const wait = deferred(); let signal; let calls = 0
  const controller = createComposerPredictionController({ call: (_c, _e, _p, value) => { calls++; signal = value; return wait.promise } })
  controller.update(state()); await tick()
  controller.update(state({ focused: false })); controller.update(state())
  assert.equal(signal.aborted, false)
  assert.equal(calls, 1)
  controller.update(state({ input: { ...state().input, draft: 'My draft', draftRev: 2 } }))
  assert.equal(signal.aborted, true)
  wait.resolve(result('Late')); await tick()
  assert.equal(controller.getSnapshot().prediction, null)
  controller.dispose()
})

test('one bounded RPC per completed turn, no retry after failure or empty result', async () => {
  for (const response of [result('Next question'), result(null), { ok: false, error: { message: 'failed' } }]) {
    const calls = []
    const controller = createComposerPredictionController({ call: async (...args) => { calls.push(args); return response } })
    controller.update(state()); await tick()
    controller.update(state()); controller.cancel(); controller.update(state()); await tick()
    assert.equal(calls.length, 1)
    assert.equal(calls[0][0], '/codex-subscription')
    assert.equal(calls[0][1], 'predictions/generate')
    assert.deepEqual(calls[0][2], { sessionId: 's1', model: 'gpt-6.1-sol', turnId: '1', messages: state().context.messages })
    assert.ok(calls[0][3] instanceof AbortSignal)
    controller.dispose()
  }
})

test('typing, IME, attachment changes, disabling and session switches abort pending work and reject late results', async () => {
  for (const overrides of [
    { composing: true }, { enabled: false },
    { input: { draft: 'my text', draftRev: 2, phase: 'plain' } },
    { input: { draft: '', draftRev: 1, phase: 'plain', attachmentIds: ['file'] } },
    { sessionId: 's2', visible: false },
  ]) {
    const wait = deferred(); let signal
    const controller = createComposerPredictionController({ call: (_c, _e, _p, nextSignal) => { signal = nextSignal; return wait.promise } })
    controller.update(state()); await tick()
    controller.update(state(overrides))
    assert.equal(signal.aborted, true)
    wait.resolve(result('late')); await tick()
    assert.equal(controller.getSnapshot().prediction, null)
    controller.dispose()
  }
})

test('a newer turn supersedes old work even if the old transport ignores cancellation', async () => {
  const first = deferred(); const second = deferred(); let count = 0
  const controller = createComposerPredictionController({ call: () => (++count === 1 ? first : second).promise })
  controller.update(state()); await tick()
  controller.update(state({ context: { ...state().context, turnId: '2' } })); await tick()
  second.resolve(result('new')); await tick()
  first.resolve(result('old')); await tick()
  assert.equal(controller.getSnapshot().prediction, 'new')
  controller.dispose()
})

test('acceptance only inserts through the captured public span, persists once and never sends', async () => {
  const controller = createComposerPredictionController({ call: async () => result('Next question') })
  const current = state(); const inserted = []; let persisted = 0
  const actions = { captureInsertion: () => current.span, insertText: (...args) => { inserted.push(args); return true }, persistDraft: () => { persisted += 1 }, submit: () => assert.fail('must never submit') }
  controller.update(current); await tick()
  assert.equal(controller.accept(actions, current), true)
  assert.deepEqual(inserted, [['Next question', current.span]])
  assert.equal(persisted, 1)
  assert.equal(controller.accept(actions, current), false)
  controller.dispose()
})

test('undoing or clearing an unsent accepted draft restores the same cached suggestion without another RPC', async () => {
  let calls = 0
  const controller = createComposerPredictionController({ call: async () => { calls++; return result('Tomorrow?') } })
  const current = state()
  controller.update(current); await tick()
  const actions = { captureInsertion: () => current.span, insertText: () => true, persistDraft: () => {}, submit: () => assert.fail('never send') }
  assert.equal(controller.accept(actions, current), true)
  controller.update(state({ input: { ...current.input, draft: 'Tomorrow?', draftRev: 2 }, span: { start: 9, end: 9, draftRev: 2 } }))
  assert.equal(controller.getSnapshot().prediction, null)
  const undone = state({ input: { ...current.input, draftRev: 3 }, span: { start: 0, end: 0, draftRev: 3 } })
  controller.update(undone); await tick()
  assert.equal(controller.getSnapshot().prediction, 'Tomorrow?')
  assert.equal(calls, 1)
  assert.equal(controller.accept({ ...actions, captureInsertion: () => undone.span }, undone), true)
  controller.dispose()
})

test('cached suggestions expire without timers or new requests and are discarded on context changes', async () => {
  let clock = 0, calls = 0
  const controller = createComposerPredictionController({ call: async () => { calls++; return result('Next') } }, { now: () => clock })
  controller.update(state()); await tick()
  clock = 300001
  controller.update(state()); await tick()
  assert.equal(controller.getSnapshot().prediction, null)
  assert.equal(calls, 1)
  controller.update(state({ context: null }))
  controller.update(state()); await tick()
  assert.equal(controller.getSnapshot().prediction, null)
  controller.dispose()
})

test('acceptance rejects a stale selection or revision and respects host CAS rejection', async () => {
  for (const span of [{ start: 0, end: 0, draftRev: 2 }, { start: 0, end: 1, draftRev: 1 }]) {
    const controller = createComposerPredictionController({ call: async () => result('Next') })
    controller.update(state()); await tick()
    assert.equal(controller.accept({ captureInsertion: () => span, insertText: () => assert.fail('stale insertion') }, state()), false)
    assert.equal(controller.getSnapshot().prediction, null)
    controller.dispose()
  }
  const controller = createComposerPredictionController({ call: async () => result('Next') })
  controller.update(state()); await tick()
  assert.equal(controller.accept({ captureInsertion: () => state().span, insertText: () => false, persistDraft: () => assert.fail('failed insertion must not persist') }, state()), false)
  controller.dispose()
})

test('acceptance guards edits, references, attachments and sessions even before update effects run', async () => {
  const controller = createComposerPredictionController({ call: async () => result('Next') })
  controller.update(state()); await tick()
  const actions = { captureInsertion: () => state().span, insertText: () => assert.fail('unsafe insertion') }
  for (const next of [{ sessionId: 'elsewhere' }, { focused: false }, { composing: true }, { input: { ...state().input, attachmentIds: ['file'] } }, { input: { ...state().input, draft: 'mine' } }]) {
    assert.equal(controller.accept(actions, state(next)), false)
  }
  controller.dispose()
})

test('dispose is idempotent, aborts pending calls and releases listeners without late notifications', async () => {
  const wait = deferred(); let signal; let notifications = 0
  const controller = createComposerPredictionController({ call: (_a, _b, _c, next) => { signal = next; return wait.promise } })
  controller.subscribe(() => { notifications += 1 })
  controller.update(state()); await tick()
  const before = notifications
  controller.dispose(); controller.dispose()
  assert.equal(signal.aborted, true)
  controller.subscribe(() => assert.fail('disposed subscription retained'))
  controller.update(state({ sessionId: 'other' }))
  wait.resolve(result('late')); await tick()
  assert.equal(notifications, before)
})

test('disable inside a loading subscriber prevents initial network dispatch', async () => {
  let calls = 0
  const controller = createComposerPredictionController({ call: async () => { calls += 1; return result('No') } })
  controller.subscribe(() => { if (controller.getSnapshot().status === 'loading') controller.update(state({ enabled: false })) })
  controller.update(state()); await tick()
  assert.equal(calls, 0)
  controller.dispose()
})

test('StrictMode-like setup cleanup setup neither disposes the controller nor burns an undispatched turn', async () => {
  let calls = 0
  const controller = createComposerPredictionController({ call: async () => { calls += 1; return result('Next') } })
  const firstUnsubscribe = controller.subscribe(() => {})
  controller.update(state())
  controller.cancel()
  firstUnsubscribe()
  const nextUnsubscribe = controller.subscribe(() => {})
  controller.update(state())
  await tick()
  assert.equal(calls, 1)
  assert.equal(controller.getSnapshot().prediction, 'Next')
  nextUnsubscribe()
  controller.cancel()
  controller.dispose()
})

test('an assistant answer exceeding the context budget cannot dispatch without user context', () => {
  assert.equal(composerPredictionContext(chat([user('Hello'), assistant('x'.repeat(24001))])), null)
})

test('account admission requires a ready authenticated snapshot and uses the active identity', () => {
  assert.equal(composerPredictionAccountKey({ status: 'loading', account: { authenticated: true } }), undefined)
  assert.equal(composerPredictionAccountKey({ status: 'ready', account: { authenticated: false } }), undefined)
  assert.equal(composerPredictionAccountKey({ status: 'ready', account: { authenticated: true } }), 'authenticated')
  assert.equal(composerPredictionAccountKey({ status: 'ready', account: { authenticated: true, accounts: [{ id: 'a', active: false }, { id: 'b', active: true }] } }), 'b')
  assert.equal(composerPredictionAccountKey({ status: 'ready', account: { authenticated: true, accounts: [{ id: 'a' }, { id: 'b' }] } }), undefined)
})

test('switching accounts aborts old work, permits the same turn on the new account and rejects old suggestions', async () => {
  const waits = [deferred(), deferred(), deferred()]
  const signals = []
  let calls = 0
  const controller = createComposerPredictionController({ call: (_c, _e, _p, signal) => { signals.push(signal); return waits[calls++].promise } })
  controller.update(state()); await tick()
  const second = state({ accountKey: 'account-2' })
  controller.update(second); await tick()
  assert.equal(signals[0].aborted, true)
  waits[1].resolve(result('Account two suggestion')); await tick()
  waits[0].resolve(result('Late account one suggestion')); await tick()
  assert.equal(controller.getSnapshot().prediction, 'Account two suggestion')
  const actions = { captureInsertion: () => state().span, insertText: () => assert.fail('old account suggestion accepted') }
  assert.equal(controller.accept(actions, state({ accountKey: 'account-3' })), false)
  controller.update(state({ accountKey: 'account-3' })); await tick()
  assert.equal(controller.getSnapshot().prediction, null)
  assert.equal(calls, 3, 'each account may generate the same completed turn once')
  waits[2].resolve(result('Account three suggestion')); await tick()
  assert.equal(controller.getSnapshot().prediction, 'Account three suggestion')
  controller.dispose()
})
