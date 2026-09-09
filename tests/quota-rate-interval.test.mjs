import test from 'node:test'
import assert from 'node:assert/strict'
import { quotaRateInterval } from '../src/quota-rate-interval.js'
import { observeQuotaForecast, estimateQuotaForecast } from '../src/quota-forecast.js'

test('known floor example encloses the true 0.2 rate and rejects the last-step spike', () => {
  const samples = Array.from({ length: 11 }, (_, minute) => ({ at: minute * 60_000, remainingPercent: 100 - Math.floor(40 + minute * 0.2) }))
  const range = quotaRateInterval(samples, { rounding: 'floor' })
  assert.ok(Math.abs(range.min - 1 / 6) < 1e-9)
  assert.ok(Math.abs(range.max - 2 / 9) < 1e-9)
  assert.ok(range.min <= 0.2 && range.max >= 0.2)
  assert.ok(range.max < 1)
})

test('fresh plateaus constrain speed, cached observations do not multiply evidence', () => {
  let state
  const window = { remainingPercent: 60, windowSeconds: 18000, resetsAt: null }
  for (let minute = 0; minute <= 10; minute++) state = observeQuotaForecast(state, [window], minute * 60_000).state
  assert.equal(Object.values(state.windows)[0].samples.length, 11)
  const cached = observeQuotaForecast(state, [window], 600_000)
  assert.equal(cached.changed, false)
  const estimate = estimateQuotaForecast(state, window, 600_000)
  assert.equal(estimate.reason, 'resolution')
  assert.equal(estimate.lowerPacePerHour, 0)
  assert.ok(estimate.upperPacePerHour <= 12)
})

test('unknown rounding covers floor, nearest and ceiling on time-ordered constant-rate traces', () => {
  for (const quantize of [Math.floor, Math.round, Math.ceil]) {
    for (const rate of [0.02, 0.2, 0.7]) {
      const samples = Array.from({ length: 50 }, (_, minute) => ({ at: minute * 60_000, remainingPercent: 100 - quantize(30 + minute * rate) }))
      for (let end = 2; end <= samples.length; end++) {
        const range = quotaRateInterval(samples.slice(0, end))
        assert.ok(range.feasible && range.min <= rate + 1e-9 && range.max >= rate - 1e-9)
      }
    }
  }
})

test('finer precision requires an explicit quantum, raw decimals are not rounded in storage', () => {
  const samples = [0, 1, 2].map(minute => ({ at: minute * 60000, remainingPercent: 80 - minute * 0.1 }))
  const range = quotaRateInterval(samples, { quantum: 0.01 })
  assert.ok(range.min > 0 && range.min <= 0.1 && range.max >= 0.1)
  const exact = 79.123456789
  const state = observeQuotaForecast(undefined, [{ remainingPercent: exact }], 0).state
  assert.equal(Object.values(state.windows)[0].samples[0].remainingPercent, exact)
})
