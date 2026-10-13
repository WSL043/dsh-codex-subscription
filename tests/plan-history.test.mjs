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
