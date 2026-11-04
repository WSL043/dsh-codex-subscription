import test from 'node:test'
import assert from 'node:assert/strict'
import { recoveryCall, clientDiagnostic } from '../src/client-recovery.js'
import { forecastUsage, observeQuotaForecast, estimateQuotaForecast } from '../src/quota-forecast.js'

test('quota RPC waits beyond the host deadline while ordinary RPC keeps its shorter deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const pending = [], signals = []
  const rpc = { call(...args) { signals.push(args[3]); return new Promise(resolve => pending.push(resolve)) } }
  const usage = recoveryCall(rpc, 'usage')
  const accounts = recoveryCall(rpc, 'usage/accounts')
  const status = recoveryCall(rpc, 'status')
  const rejected = assert.rejects(status, { code: 'timeout' })
  await Promise.resolve()
  t.mock.timers.tick(16_000)
  await rejected
  assert.equal(signals[0].aborted, false)
  assert.equal(signals[1].aborted, false)
  assert.equal(signals[2].aborted, true)
  pending[0]({ ok: true, value: { quota: 77 } })
  pending[1]({ ok: true, value: { accounts: [] } })
  assert.deepEqual(await usage, { quota: 77 })
  assert.deepEqual(await accounts, { accounts: [] })
})

test('a quota RPC that never returns still times out and cancels its work', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let signal
  const pending = recoveryCall({ call(...args) { signal = args[3]; return new Promise(() => {}) } }, 'usage')
  const rejected = assert.rejects(pending, { code: 'timeout' })
  await Promise.resolve()
  t.mock.timers.tick(30_000)
  await rejected
  assert.equal(signal.aborted, true)
})

test('recovery requests time out and diagnostics omit raw secrets', async () => {
  let signal
  await assert.rejects(recoveryCall({ call(...args) { signal = args[3]; return new Promise(() => {}) } }, 'logout', {}, 5), { code: 'timeout' })
  assert.equal(signal.aborted, true)
  const report = clientDiagnostic(Object.assign(new Error('secret-token user@example.com'), { code: 'ECONNRESET' }))
  assert.equal(report.error, 'transport')
  assert.doesNotMatch(JSON.stringify(report), /secret-token|user@example/)
  assert.equal(await recoveryCall({ call: async () => ({ ok: true, value: 'done' }) }, 'diagnostics'), 'done')
})

const start = 1_900_000_000_000
const window = remaining => ({ remainingPercent: remaining, windowSeconds: 604800, resetsAt: null })
test('raw fractional observations alone do not prove a finer reporting resolution', () => {
  let state
  for (const [minute, remaining] of [[0,80],[1,79.9],[2,79.8]]) state = observeQuotaForecast(state, [window(remaining)], start + minute * 60000).state
  const result = estimateQuotaForecast(state, window(79.8), start + 120000)
  assert.equal(result.reason, 'resolution')
  assert.equal(Object.values(state.windows)[0].samples.at(-1).remainingPercent, 79.8)
  let coarse
  for (const minute of [0,1,2]) coarse = observeQuotaForecast(coarse, [window(80)], start + minute * 60000).state
  assert.equal(estimateQuotaForecast(coarse, window(80), start + 120000).status, 'calibrating')
})
test('forecast ignores stale reads and does not resample a cached response', () => {
  const usage = { fetchedAt: start, rateLimits: [{ id: 'codex', windows: [window(80)] }] }
  const first = forecastUsage(usage, undefined, start)
  const cached = forecastUsage(usage, first.state, start + 120000)
  assert.equal(cached.changed, false)
  const stale = forecastUsage(usage, first.state, start + 360000)
  assert.equal(stale.changed, false)
  assert.equal(stale.usage.rateLimits[0].windows[0].forecast.reason, 'stale')
})

test('forecast forgets long gaps and does not mistake a missing reset for zero', () => {
  let state
  for (const [minute, remaining] of [[0,80],[10,78],[20,76]]) state = observeQuotaForecast(state, [window(remaining)], start + minute * 60000).state
  const result = estimateQuotaForecast(state, window(76), start + 20 * 60000)
  assert.equal(result.status, 'ready')
  assert.equal(result.survivesReset, false)
  assert.ok(result.runwayMaxSeconds > result.runwayMinSeconds)
  state = observeQuotaForecast(state, [window(75)], start + 150 * 60000).state
  assert.equal(estimateQuotaForecast(state, window(75), start + 150 * 60000).status, 'calibrating')
})

test('forecast adapts to a recent consumption acceleration', () => {
  let state
  for (const [minute, remaining] of [[0,100],[20,99],[40,98],[60,97],[80,96],[90,95],[100,90],[110,80]]) state = observeQuotaForecast(state, [window(remaining)], start + minute * 60000).state
  const result = estimateQuotaForecast(state, window(80), start + 110 * 60000)
  assert.equal(result.reason, 'changing-pace')
  assert.equal(result.changedIntensity, true)
  for (const [minute, remaining] of [[120,70],[130,60]]) state = observeQuotaForecast(state, [window(remaining)], start + minute * 60000).state
  const settled = estimateQuotaForecast(state, window(60), start + 130 * 60000)
  assert.equal(settled.status, 'ready')
  assert.ok(settled.lowerPacePerHour <= 60 && settled.upperPacePerHour >= 60)
})
