import assert from 'node:assert/strict'
import test from 'node:test'
import { CODEX_PLAN_HISTORY_URL, createPlanHistoryReader, parsePlanHistory } from '../src/plan-history.js'
import { createSubscriptionRpcHandler } from '../src/index.js'
import { RPC_ENDPOINTS } from '../src/rpc-contract.js'

const period = {
  id: 'p1', window_minutes: 10080, plan_type: 'pro', starts_at: '2026-10-03T00:00:00Z', ends_at: '2026-10-10T00:00:00Z',
  accounting_complete: true, used_basis_points: 101,
  breakdowns: [
    { dimension: 'model', rows: [{ key: 'gpt-6.1-sol', basis_points: 85 }, { key: 'idle', basis_points: 0 }, { key: 'gpt-5.6-luna', basis_points: 4 }] },
    { dimension: 'surface', rows: [{ key: 'desktop_app', basis_points: 101 }] },
    { dimension: 'invented', rows: [{ key: 'x', basis_points: 5 }] },
  ],
}

test('the usage history keeps periods, hundredths of a percent and known breakdowns only', () => {
  const parsed = parsePlanHistory({ data_as_of: '2026-10-13T00:00:00Z', coverage_complete: false, periods: [period, { starts_at: 'nope' }, null, { ...period, id: 'p2', accounting_complete: false, used_basis_points: null, breakdowns: null }] })
  assert.equal(parsed.periods.length, 2)
  assert.equal(parsed.approximate, true)
  assert.equal(parsed.coverageComplete, false)
  const [done, open] = parsed.periods
  assert.equal(done.usedPercent, 1.01)
  assert.equal(done.complete, true)
  assert.deepEqual(done.breakdowns.model, [{ key: 'gpt-6.1-sol', percent: 0.85 }, { key: 'gpt-5.6-luna', percent: 0.04 }], 'zero rows and unknown dimensions are dropped')
  assert.equal(done.breakdowns.invented, undefined)
  assert.equal(open.usedPercent, undefined)
  assert.deepEqual(open.breakdowns, {})
  assert.throws(() => parsePlanHistory({}), /malformed/)
})

function reader(responses) {
  const calls = []
  let clock = 1_000
  const instance = createPlanHistoryReader({
    getAuth: async () => ({ auth: { apiKey: 'token' } }), readCredential: async () => ({ type: 'oauth', access: 'token', accountId: 'acct' }),
    now: () => clock,
    fetch: async (url, init) => { calls.push({ url, init }); return responses.shift() },
  })
  return { instance, calls, tick: ms => { clock += ms } }
}

test('the usage history reader sends the account headers once per cache lifetime and reads a missing route as unavailable', async () => {
  const body = { periods: [period], coverage_complete: true }
  const { instance, calls, tick } = reader([new Response(JSON.stringify(body)), new Response('{}', { status: 404 })])
  const first = await instance.read()
  assert.equal(first.available, true)
  assert.equal(calls[0].url, CODEX_PLAN_HISTORY_URL)
  assert.equal(calls[0].init.headers['chatgpt-account-id'], 'acct')
  assert.equal(calls[0].init.headers.authorization, 'Bearer token')
  await instance.read()
  assert.equal(calls.length, 1, 'cached')
  tick(10 * 60_000)
  assert.equal((await instance.read()).available, false)
})

test('a 403 says the account is not offered the report, only a 401 asks for a new sign-in', async () => {
  await assert.rejects(reader([new Response('x', { status: 403 })]).instance.read(), /does not offer the usage history to this account/)
  await assert.rejects(reader([new Response('x', { status: 401 })]).instance.read(), /sign-in needs to be renewed/)
})

test('usage/history is a public endpoint that only surfaces safe messages', async () => {
  assert.ok(RPC_ENDPOINTS.includes('usage/history'))
  const signal = new AbortController().signal
  const ok = createSubscriptionRpcHandler({ planHistoryReader: { read: async () => ({ available: true, periods: [] }), clear() {} } })
  assert.deepEqual((await ok('usage/history', {}, signal)).value, { available: true, periods: [] })
  const failing = createSubscriptionRpcHandler({ planHistoryReader: { read: async () => { throw new Error('secret https://host/token') }, clear() {} } })
  const result = await failing('usage/history', {}, signal)
  assert.equal(result.ok, false)
  assert.doesNotMatch(JSON.stringify(result), /secret|token/)
})

test('the usage profile keeps only statistics, never the name, picture or username', async () => {
  const { parseUsageProfile } = await import('../src/usage-profile.js')
  const parsed = parseUsageProfile({
    profile: { username: 'secret-name', display_name: 'Secret', profile_picture_url: 'https://x/y' },
    stats: {
      lifetime_tokens: 93_427_552_692, peak_daily_tokens: 2_530_870_522, current_streak_days: 115, longest_streak_days: 115, total_threads: 7013,
      longest_running_turn_sec: 115_668, fast_mode_usage_percentage: 4.4497, most_used_reasoning_effort: 'xhigh', most_used_reasoning_effort_percentage: 38.64,
      daily_usage_buckets: [{ start_date: '2026-03-10', tokens: 939_622 }, { start_date: 'bad', tokens: 5 }, { start_date: '2026-03-11', tokens: -1 }, null],
    },
  })
  assert.equal(parsed.lifetimeTokens, 93_427_552_692)
  assert.equal(parsed.fastModePercent, 4.4)
  assert.equal(parsed.mostUsedReasoningEffort, 'xhigh')
  assert.deepEqual(parsed.days, [{ date: '2026-03-10', tokens: 939_622 }])
  assert.doesNotMatch(JSON.stringify(parsed), /secret|Secret|https/)
  assert.throws(() => parseUsageProfile({}), /malformed/)
  assert.deepEqual(parseUsageProfile({ stats: {} }), { days: [] })
})
