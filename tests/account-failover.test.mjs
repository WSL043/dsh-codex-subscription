import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyFailoverFailure,
  createAccountFailover,
  createCapacityStreaks,
  orderAccountCandidates,
  usageLimitParkMs,
} from '../src/account-failover.js'

const USAGE_LIMIT = 'You have hit your ChatGPT usage limit (plus plan). Try again in ~42 min.'
const CAPACITY = 'Selected model is at capacity. Please try a different model.'

const accounts = [
  { id: 'account-a', label: 'Account 1' },
  { id: 'account-b', label: 'Account 2' },
  { id: 'account-c', label: 'Account 3' },
]

const signal = () => new AbortController().signal

/** A harness whose switching is observable and whose clock the test owns. */
function harness({ accountsForTest = accounts, active = 'account-a', failure, enabled = true, now } = {}) {
  const events = []
  const switched = []
  const logged = []
  let current = active
  const clock = now ?? (() => 1_000_000)
  const agent = { session: { id: 'session-1', append: (type, data) => events.push({ type, data }) } }
  const failover = createAccountFailover({
    enabled: () => typeof enabled === 'function' ? enabled() : enabled,
    listAccounts: async () => accountsForTest,
    activeAccountId: async () => current,
    switchAccount: async id => { switched.push(id); current = id },
    modelsReady: async () => true,
    onSwitched: () => {},
    now: clock,
    log: { info: (...args) => logged.push(['info', ...args]), warn: (...args) => logged.push(['warn', ...args]) },
  })
  const run = (failure, { agentForTest = agent, sessionId = 'session-1' } = {}) => {
    agentForTest.session.id = sessionId
    return failover({ agent: agentForTest, turn: 1, step: 1, provider: 'openai-codex', failure, signal: signal() }, async () => ({ kind: 'downstream' }))
  }
  return { failover, run, events, switched, logged, agent, current: () => current }
}

const payload = failure => ({ code: 'PI_AI_ERROR', ...failure })

test('a confirmed usage limit moves the turn to the next signed-in account', async () => {
  const { run, switched, events } = harness()
  assert.deepEqual(await run(payload({ message: USAGE_LIMIT })), { kind: 'retry' })
  assert.deepEqual(switched, ['account-b'])
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'llm/retry')
  assert.match(events[0].data.failure.message, /retrying on another signed-in account/u)
  assert.equal(events[0].data.delayMs, 0)
})

test('quota and account-quota codes also move the turn', async () => {
  for (const code of ['QUOTA', 'ACCOUNT_QUOTA', 'QUOTA_EXCEEDED']) {
    const { run, switched } = harness()
    assert.deepEqual(await run({ code, message: 'any' }), { kind: 'retry' })
    assert.deepEqual(switched, ['account-b'])
  }
})

test('a single capacity failure keeps the account; the second in a row moves it', async () => {
  const { run, switched } = harness()
  const downstream = { kind: 'downstream' }
  assert.deepEqual(await run(payload({ message: CAPACITY })), downstream)
  assert.deepEqual(switched, [])
  assert.deepEqual(await run(payload({ message: CAPACITY })), { kind: 'retry' })
  assert.deepEqual(switched, ['account-b'])
})

test('the capacity streak is per session and per account', async () => {
  const { run, switched } = harness()
  assert.deepEqual(await run(payload({ message: CAPACITY }), { sessionId: 'session-1' }), { kind: 'downstream' })
  // A second conversation on the same account must not finish the first one's streak.
  assert.deepEqual(await run(payload({ message: CAPACITY }), { sessionId: 'session-2' }), { kind: 'downstream' })
  assert.deepEqual(switched, [])
  assert.deepEqual(await run(payload({ message: CAPACITY }), { sessionId: 'session-1' }), { kind: 'retry' })
  assert.deepEqual(switched, ['account-b'])
})

test('a capacity streak that spans more than the window restarts', async () => {
  const minute = 60_000
  let clock = 1_000_000
  const { run, switched } = harness({ now: () => clock })
  assert.deepEqual(await run(payload({ message: CAPACITY })), { kind: 'downstream' })
  clock += 6 * minute
  assert.deepEqual(await run(payload({ message: CAPACITY })), { kind: 'downstream' })
  assert.deepEqual(switched, [])
})

test('a single signed-in account never rotates', async () => {
  const { run, switched, events } = harness({ accountsForTest: [accounts[0]] })
  assert.deepEqual(await run(payload({ message: USAGE_LIMIT })), { kind: 'downstream' })
  assert.deepEqual(switched, [])
  assert.deepEqual(events, [])
})

test('the disabled switch restores the previous behavior exactly', async () => {
  const { run, switched } = harness({ enabled: false })
  assert.deepEqual(await run(payload({ message: USAGE_LIMIT })), { kind: 'downstream' })
  assert.deepEqual(switched, [])
})

test('failures that another account cannot fix are left alone', async () => {
  const { run, switched } = harness()
  for (const failure of [
    { code: 'ABORTED', message: 'aborted' },
    { code: 'AUTH', message: 'ChatGPT sign-in needs to be renewed' },
    { code: 'INVALID_REQUEST', message: 'invalid' },
    { code: 'CONTEXT_WINDOW_EXCEEDED', message: 'context length exceeded' },
    { code: 'EMPTY_RESPONSE', message: 'empty' },
    { code: 'SERVER', message: 'internal failure' },
    { code: 'PI_AI_ERROR', message: 'something else entirely' },
  ]) {
    assert.deepEqual(await run(failure), { kind: 'downstream' }, failure.code)
  }
  assert.deepEqual(switched, [])
})

test('a parked account is skipped in favor of one that can still serve', async () => {
  const { run, switched } = harness()
  await run(payload({ message: USAGE_LIMIT })) // parks account-a, moves to account-b
  assert.deepEqual(switched, ['account-b'])
})

test('when every other account is parked the original failure stands', async () => {
  // Park account-b by exhausting it, then exhaust account-a: no account can serve.
  let clock = 1_000_000
  let current = 'account-b'
  const switched = []
  const failover = createAccountFailover({
    listAccounts: async () => accounts,
    activeAccountId: async () => current,
    switchAccount: async id => { switched.push(id); current = id },
    now: () => clock,
  })
  const agent = { session: { id: 'session-1', append() {} } }
  const run = () => failover(
    { agent, turn: 1, step: 1, provider: 'openai-codex', failure: payload({ message: USAGE_LIMIT }), signal: signal() },
    async () => ({ kind: 'downstream' }),
  )
  // account-b parks itself and moves to account-c.
  assert.deepEqual(await run(), { kind: 'retry' })
  assert.equal(current, 'account-c')
  // account-c parks itself; account-a is still usable, so it moves there.
  assert.deepEqual(await run(), { kind: 'retry' })
  assert.equal(current, 'account-a')
  // account-a is now the only unblocked account and just failed. Both others are
  // parked, so the turn keeps its original failure instead of burning the retry.
  assert.deepEqual(await run(), { kind: 'downstream' })
  assert.equal(current, 'account-a')
  assert.deepEqual(switched, ['account-c', 'account-a'])
})

test('rotation picks the account after the failing one and wraps around', async () => {
  assert.deepEqual(
    orderAccountCandidates({ accounts, failingId: 'account-b', parked: new Map(), now: 0 }).map(candidate => candidate.id),
    ['account-c', 'account-a', 'account-b'],
  )
  assert.deepEqual(
    orderAccountCandidates({ accounts, failingId: 'account-a', parked: new Map(), now: 0 }).map(candidate => candidate.id),
    ['account-b', 'account-c', 'account-a'],
  )
})

test('parked accounts go last and never precede a usable one', async () => {
  const parked = new Map([['account-b', 5_000]])
  const order = orderAccountCandidates({ accounts, failingId: 'account-a', parked, now: 1_000 })
  assert.deepEqual(order.map(candidate => candidate.id), ['account-c', 'account-b', 'account-a'])
  assert.deepEqual(order.map(candidate => candidate.parked), [false, true, false])
  // The account that just failed is never offered back as a parked candidate.
  const onlyFailingUsable = orderAccountCandidates({ accounts: accounts.slice(0, 2), failingId: 'account-a', parked: new Map([['account-a', 5_000]]), now: 1_000 })
  assert.deepEqual(onlyFailingUsable.map(candidate => candidate.id), ['account-b', 'account-a'])
})

test('an account park ends when the provider said it would', async () => {
  assert.equal(usageLimitParkMs({ message: USAGE_LIMIT }), 42 * 60_000)
  assert.equal(usageLimitParkMs({ message: 'You have hit your ChatGPT usage limit.' }), 10 * 60_000)
  // A bogus advertised wait cannot park forever or for less than a minute.
  assert.equal(usageLimitParkMs({ message: 'Try again in ~999999 min.' }), 6 * 60 * 60_000)
  // A zero-minute hint is not a usable wait; fall back to the bounded default.
  assert.equal(usageLimitParkMs({ message: 'Try again in ~0 min.' }), 10 * 60_000)
})

test('two simultaneous failures agree on one replacement account', async () => {
  const switched = []
  let current = 'account-a'
  const agents = [1, 2].map(index => ({ session: { id: `session-${index}`, append: () => {} } }))
  const failover = createAccountFailover({
    listAccounts: async () => accounts,
    activeAccountId: async () => current,
    switchAccount: async id => {
      // Yield between reads so both turns really do enter the decision together.
      await new Promise(resolve => setTimeout(resolve, 0))
      switched.push(id)
      current = id
    },
    now: () => 1_000_000,
  })
  const run = agent => failover(
    { agent, turn: 1, step: 1, provider: 'openai-codex', failure: payload({ message: USAGE_LIMIT }), signal: signal() },
    async () => ({ kind: 'downstream' }),
  )
  const results = await Promise.all(agents.map(run))
  assert.deepEqual(results, [{ kind: 'retry' }, { kind: 'retry' }])
  // One switch, chosen once: the second turn reuses it instead of advancing again.
  assert.deepEqual(switched, ['account-b'])
  assert.equal(current, 'account-b')
})

test('a failed switch falls back to the original failure instead of retrying blind', async () => {
  const failover = createAccountFailover({
    listAccounts: async () => accounts,
    activeAccountId: async () => 'account-a',
    switchAccount: async () => { throw new Error('vault is locked') },
    now: () => 1_000_000,
  })
  const agent = { session: { id: 'session-1', append() {} } }
  assert.deepEqual(
    await failover({ agent, turn: 1, step: 1, provider: 'openai-codex', failure: payload({ message: USAGE_LIMIT }), signal: signal() }, async () => ({ kind: 'downstream' })),
    { kind: 'downstream' },
  )
})

test('a host that rejects the retry notice leaves the original failure', async () => {
  const failover = createAccountFailover({
    listAccounts: async () => accounts,
    activeAccountId: async () => 'account-a',
    switchAccount: async () => {},
    now: () => 1_000_000,
  })
  const agent = { session: { id: 'session-1', append() { throw new Error('host rejected the event') } } }
  assert.deepEqual(
    await failover({ agent, turn: 1, step: 1, provider: 'openai-codex', failure: payload({ message: USAGE_LIMIT }), signal: signal() }, async () => ({ kind: 'downstream' })),
    { kind: 'downstream' },
  )
})

test('a slow catalogue barely delays the retry, which the adapter then gates itself', async () => {
  const switched = []
  const started = Date.now()
  const failover = createAccountFailover({
    listAccounts: async () => accounts,
    activeAccountId: async () => 'account-a',
    switchAccount: async id => { switched.push(id) },
    // Never resolves: the bounded wait has to be what ends it.
    modelsReady: () => new Promise(() => {}),
    modelReadyMs: 25,
    now: () => 1_000_000,
  })
  const agent = { session: { id: 'session-1', append() {} } }
  assert.deepEqual(
    await failover({ agent, turn: 1, step: 1, provider: 'openai-codex', failure: payload({ message: USAGE_LIMIT }), signal: signal() }, async () => ({ kind: 'downstream' })),
    { kind: 'retry' },
  )
  assert.deepEqual(switched, ['account-b'])
  assert.ok(Date.now() - started < 2_000, 'the wait is bounded, not open-ended')
})

test('a catalogue failure is not a reason to withhold the retry', async () => {
  const failover = createAccountFailover({
    listAccounts: async () => accounts,
    activeAccountId: async () => 'account-a',
    switchAccount: async () => {},
    modelsReady: async () => { throw new Error('catalogue read failed') },
    now: () => 1_000_000,
  })
  const agent = { session: { id: 'session-1', append() {} } }
  assert.deepEqual(
    await failover({ agent, turn: 1, step: 1, provider: 'openai-codex', failure: payload({ message: USAGE_LIMIT }), signal: signal() }, async () => ({ kind: 'downstream' })),
    { kind: 'retry' },
  )
})

test('another provider is never routed through the account pool', async () => {
  const { failover, switched } = harness()
  assert.deepEqual(
    await failover({ agent: { session: { id: 's', append() {} } }, turn: 1, step: 1, provider: 'deepseek-official', failure: payload({ message: USAGE_LIMIT }), signal: signal() }, async () => ({ kind: 'downstream' })),
    { kind: 'downstream' },
  )
  assert.deepEqual(switched, [])
})

test('cancellation before handling never switches', async () => {
  const { failover, switched } = harness()
  const aborted = new AbortController()
  aborted.abort()
  assert.deepEqual(
    await failover({ agent: { session: { id: 's', append() {} } }, turn: 1, step: 1, provider: 'openai-codex', failure: payload({ message: USAGE_LIMIT }), signal: aborted.signal }, async () => ({ kind: 'downstream' })),
    { kind: 'downstream' },
  )
  assert.deepEqual(switched, [])
})

test('a parked account returns to the pool once its advertised reset has passed', async () => {
  let clock = 1_000_000
  const switched = []
  let current = 'account-a'
  const failover = createAccountFailover({
    listAccounts: async () => [{ id: 'account-a' }, { id: 'account-b' }],
    activeAccountId: async () => current,
    switchAccount: async id => { switched.push(id); current = id },
    now: () => clock,
  })
  const agent = { session: { id: 'session-1', append() {} } }
  const run = step => failover(
    { agent, turn: 1, step, provider: 'openai-codex', failure: payload({ message: USAGE_LIMIT }), signal: signal() },
    async () => ({ kind: 'downstream' }),
  )
  // The account that just failed is parked, so the next failure moves across.
  assert.deepEqual(await run(1), { kind: 'retry' })
  assert.deepEqual(switched, ['account-b'])
  // The provider advertised ~42 minutes; before then the spent account is skipped.
  clock += 41 * 60_000
  assert.deepEqual(await run(2), { kind: 'downstream' }, 'a parked account is never spent a retry')
  // After the advertised reset it is a first-class candidate again.
  clock += 2 * 60_000
  assert.deepEqual(await run(3), { kind: 'retry' })
  assert.deepEqual(switched, ['account-b', 'account-a'])
})

test('the capacity streak store reports its own bookkeeping', () => {
  const streaks = createCapacityStreaks({ streak: 3 })
  assert.deepEqual(streaks.observe({ sessionId: 's', accountId: 'a', now: 0 }), { count: 1, escalate: false })
  assert.deepEqual(streaks.observe({ sessionId: 's', accountId: 'a', now: 1 }), { count: 2, escalate: false })
  assert.deepEqual(streaks.observe({ sessionId: 's', accountId: 'a', now: 2 }), { count: 3, escalate: true })
  streaks.clear({ sessionId: 's', accountId: 'a' })
  assert.deepEqual(streaks.observe({ sessionId: 's', accountId: 'a', now: 3 }), { count: 1, escalate: false })
})

test('classification reads the provider text the transports actually send', () => {
  assert.equal(classifyFailoverFailure({ code: 'PI_AI_ERROR', message: USAGE_LIMIT }), 'quota')
  assert.equal(classifyFailoverFailure({ code: 'PI_AI_ERROR', message: 'You have hit your ChatGPT usage limit.' }), 'quota')
  assert.equal(classifyFailoverFailure({ code: 'RATE_LIMIT', message: 'usage_limit_reached' }), 'quota')
  assert.equal(classifyFailoverFailure({ code: 'PI_AI_ERROR', message: CAPACITY }), 'capacity')
  assert.equal(classifyFailoverFailure({ code: 'SERVER', message: 'Our servers are currently overloaded. Please try again later.' }), 'capacity')
  assert.equal(classifyFailoverFailure({ code: 'RATE_LIMIT', message: 'servers are currently busy' }), 'capacity')
  assert.equal(classifyFailoverFailure({ code: 'SERVER', message: 'model is at capacity' }), 'capacity')
  // Load wording inside a code the transport never uses for load is not enough.
  assert.equal(classifyFailoverFailure({ code: 'PI_AI_ERROR', message: 'not a load message' }), undefined)
  assert.equal(classifyFailoverFailure(undefined), undefined)
  assert.equal(classifyFailoverFailure({}), undefined)
})

// The real refusal users hit: OpenAI answers a 5xx with an explicit invitation to
// retry. model-retry-hint.js files it as PI_AI_ERROR because a status was received,
// so DSH's own retry policy stops the turn and a two-failure rule could never run.
const UPSTREAM_ASKED_RETRY = 'Codex error: An error occurred while processing your request. You can retry your request, or contact us through our help center at help.openai.com if the error persists. Please include the request ID 392b492c-6c02-42f6-8a41-ebdd131048c9 in your message.'

test('a provider-invited retry rotates on the first failure instead of needing a second', async () => {
  const { run, switched, events } = harness()
  assert.deepEqual(await run(payload({ message: UPSTREAM_ASKED_RETRY })), { kind: 'retry' })
  assert.deepEqual(switched, ['account-b'], 'the pool moved immediately')
  assert.equal(events.length, 1)
  assert.match(events[0].data.failure.message, /another signed-in account/u)
})

test('the provider-invited retry is only recognised when the provider invited it', async () => {
  const { isTerminalProviderFailure } = await import('../src/account-failover.js')
  const invited = { code: 'PI_AI_ERROR', message: UPSTREAM_ASKED_RETRY }
  assert.equal(isTerminalProviderFailure(invited), true)
  // Same non-retryable code, but no invitation: keep the two-failure escalation.
  assert.equal(isTerminalProviderFailure({ code: 'PI_AI_ERROR', message: 'Selected model is at capacity.' }), false)
  // Quota never repeats on the same spent account; it moves instead.
  assert.equal(isTerminalProviderFailure({ code: 'PI_AI_ERROR', message: 'You have hit your ChatGPT usage limit.' }), false)
  assert.equal(isTerminalProviderFailure({ code: 'AUTH', message: UPSTREAM_ASKED_RETRY }), false)
})

test('with one account an invited retry is spent in place, exactly once', async () => {
  const one = [{ id: 'account-a', label: 'Account 1' }]
  const events = []
  const agent = { session: { id: 'session-1', append: (type, data) => events.push({ type, data }) } }
  let switched = 0
  const failover = createAccountFailover({
    listAccounts: async () => one,
    activeAccountId: async () => 'account-a',
    switchAccount: async () => { switched++ },
    now: () => 1_000_000,
  })
  const run = () => failover(
    { agent, turn: 4, step: 2, provider: 'openai-codex', failure: payload({ message: UPSTREAM_ASKED_RETRY }), signal: signal() },
    async () => ({ kind: 'downstream' }),
  )
  assert.equal(switched, 0)
  assert.deepEqual(await run(), { kind: 'retry' })
  assert.match(events[0].data.failure.message, /retrying on the current account/u)
  // The budget is one per turn+step: a repeat of the same failure is now terminal.
  assert.deepEqual(await run(), { kind: 'downstream' })
  assert.equal(events.length, 1)
})

test('the in-place budget is per step, so the next step still gets its own retry', async () => {
  const events = []
  const agent = { session: { id: 'session-1', append: () => events.push(1) } }
  const failover = createAccountFailover({
    listAccounts: async () => [{ id: 'account-a' }],
    activeAccountId: async () => 'account-a',
    switchAccount: async () => {},
    now: () => 1_000_000,
  })
  const run = step => failover(
    { agent, turn: 4, step, provider: 'openai-codex', failure: payload({ message: UPSTREAM_ASKED_RETRY }), signal: signal() },
    async () => ({ kind: 'downstream' }),
  )
  assert.deepEqual(await run(1), { kind: 'retry' })
  assert.deepEqual(await run(1), { kind: 'downstream' })
  assert.deepEqual(await run(2), { kind: 'retry' }, 'a new step is a new request boundary')
})

test('an invited retry with several accounts does not silently reuse the spent one', async () => {
  const events = []
  const agent = { session: { id: 'session-1', append: (type, data) => events.push({ type, data }) } }
  const switched = []
  let current = 'account-a'
  const failover = createAccountFailover({
    listAccounts: async () => accounts,
    activeAccountId: async () => current,
    switchAccount: async id => { switched.push(id); current = id },
    now: () => 1_000_000,
  })
  assert.deepEqual(
    await failover({ agent, turn: 1, step: 1, provider: 'openai-codex', failure: payload({ message: UPSTREAM_ASKED_RETRY }), signal: signal() }, async () => ({ kind: 'downstream' })),
    { kind: 'retry' },
  )
  assert.deepEqual(switched, ['account-b'])
  assert.equal(events.length, 1)
})

test('the in-place retry respects the off switch', async () => {
  const failover = createAccountFailover({
    enabled: () => false,
    listAccounts: async () => [{ id: 'account-a' }],
    activeAccountId: async () => 'account-a',
    switchAccount: async () => {},
    now: () => 1_000_000,
  })
  assert.deepEqual(
    await failover({ agent: { session: { id: 's', append() {} } }, turn: 1, step: 1, provider: 'openai-codex', failure: payload({ message: UPSTREAM_ASKED_RETRY }), signal: signal() }, async () => ({ kind: 'downstream' })),
    { kind: 'downstream' },
  )
})

test('an invited retry stays spent for its step across repeated failures, never alternating back to a retry', async () => {
  // One account: there is nothing to rotate to, so every attempt is an in-place one.
  const { run, events } = harness({ accountsForTest: [{ id: 'account-a', label: 'Account 1' }] })
  const outcomes = []
  for (let attempt = 0; attempt < 4; attempt++) outcomes.push((await run(payload({ message: UPSTREAM_ASKED_RETRY }))).kind)
  // A single attempt per turn+step: the first failure retries, every later one of
  // the same step falls through. The old code re-armed the budget every other call.
  assert.deepEqual(outcomes, ['retry', 'downstream', 'downstream', 'downstream'])
  assert.equal(events.length, 1)
})

test('an invited retry still gets its in-place attempt when the rotation itself cannot switch', async () => {
  const events = []
  const agent = { session: { id: 'session-1', append: (type, data) => events.push({ type, data }) } }
  const failover = createAccountFailover({
    listAccounts: async () => [{ id: 'account-a' }, { id: 'account-b' }],
    activeAccountId: async () => 'account-a',
    switchAccount: async () => { throw new Error('vault is locked') },
    now: () => 1_000_000,
  })
  const outcome = await failover(
    { agent, turn: 9, step: 1, provider: 'openai-codex', failure: payload({ message: UPSTREAM_ASKED_RETRY }), signal: signal() },
    async () => ({ kind: 'downstream' }),
  )
  assert.deepEqual(outcome, { kind: 'retry' }, 'a failed switch must not strand an invited retry')
  assert.equal(events.length, 1)
  assert.match(events[0].data.failure.message, /retrying on the current account/u)
})

test('a provider outage cannot rotate the pool forever', async () => {
  // The host re-runs the step for every `{ kind: 'retry' }` and puts no cap on
  // those rounds, so a provider that keeps answering with an invited retry would
  // otherwise ping-pong a three-account pool without end. Each account is left
  // once, then the same-account attempt, then the original failure stands.
  const switched = []
  let current = 'account-a'
  const events = []
  const agent = { session: { id: 'session-1', append: (type, data) => events.push({ type, data }) } }
  const failover = createAccountFailover({
    listAccounts: async () => accounts,
    activeAccountId: async () => current,
    switchAccount: async id => { switched.push(id); current = id },
    now: () => 1_000_000,
  })
  const run = () => failover(
    { agent, turn: 1, step: 1, provider: 'openai-codex', failure: payload({ message: UPSTREAM_ASKED_RETRY }), signal: signal() },
    async () => ({ kind: 'downstream' }),
  )
  const outcomes = []
  for (let attempt = 0; attempt < 6; attempt++) outcomes.push((await run()).kind)
  assert.deepEqual(outcomes, ['retry', 'retry', 'retry', 'downstream', 'downstream', 'downstream'])
  assert.deepEqual(switched, ['account-b', 'account-c'], 'each account is left at most once')
  assert.equal(events.length, 3, 'two rotations and one in-place attempt, no more notices')
})

test('the repeat budget is per conversation, so a parallel turn keeps its own', async () => {
  const events = []
  const failover = createAccountFailover({
    listAccounts: async () => [{ id: 'account-a' }],
    activeAccountId: async () => 'account-a',
    switchAccount: async () => {},
    now: () => 1_000_000,
  })
  const agentFor = id => ({ session: { id, append: () => events.push(id) } })
  const run = id => failover(
    { agent: agentFor(id), turn: 7, step: 3, provider: 'openai-codex', failure: payload({ message: UPSTREAM_ASKED_RETRY }), signal: signal() },
    async () => ({ kind: 'downstream' }),
  )
  // Turn numbers restart at 1 for every agent, so an agent-blind key would let one
  // conversation swallow the other's only attempt.
  assert.deepEqual(await run('session-1'), { kind: 'retry' })
  assert.deepEqual(await run('session-2'), { kind: 'retry' })
  // Each conversation still spends its attempt exactly once.
  assert.deepEqual(await run('session-1'), { kind: 'downstream' })
  assert.deepEqual(await run('session-2'), { kind: 'downstream' })
})
