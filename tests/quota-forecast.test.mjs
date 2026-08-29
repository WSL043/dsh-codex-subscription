import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createQuotaForecastReader,
  estimateQuotaForecast,
  observeQuotaForecast,
} from '../src/quota-forecast.js'

const HOUR = 60 * 60 * 1000
const usage = (remainingPercent, resetsAt = 2_000_000_000) => ({
  rateLimits: [{ id: 'codex', windows: [{ remainingPercent, windowSeconds: 604_800, resetsAt }] }],
})

test('forecast calibrates from official percentage observations without session or token data', () => {
  const start = 1_900_000_000_000
  let state = { windows: {} }
  for (const [hours, remaining] of [[0, 80], [0.5, 78], [1, 76]]) {
    state = observeQuotaForecast(state, usage(remaining).rateLimits[0].windows, start + hours * HOUR).state
  }
  const result = estimateQuotaForecast(state, usage(76).rateLimits[0].windows[0], start + HOUR)
  assert.equal(result.status, 'ready')
  assert.ok(result.pacePerHour > 3.9 && result.pacePerHour < 4.1)
  assert.ok(result.runwaySeconds > 18.9 * 3600 && result.runwaySeconds < 19.1 * 3600)
  assert.doesNotMatch(JSON.stringify(state), /token|prompt|model|account/iu)
})

test('forecast remains quiet until it has enough span and consumption evidence', () => {
  const start = 1_900_000_000_000
  let state = observeQuotaForecast({ windows: {} }, usage(80).rateLimits[0].windows, start).state
  state = observeQuotaForecast(state, usage(79.5).rateLimits[0].windows, start + 31 * 60 * 1000).state
  const result = estimateQuotaForecast(state, usage(79.5).rateLimits[0].windows[0], start + 31 * 60 * 1000)
  assert.equal(result.status, 'calibrating')
})

test('reset or quota increase starts a fresh forecast epoch', () => {
  const start = 1_900_000_000_000
  let state = { windows: {} }
  for (const [hours, remaining] of [[0, 80], [0.5, 78], [1, 76]]) {
    state = observeQuotaForecast(state, usage(remaining).rateLimits[0].windows, start + hours * HOUR).state
  }
  state = observeQuotaForecast(state, usage(99, 2_000_086_400).rateLimits[0].windows, start + 2 * HOUR).state
  const result = estimateQuotaForecast(state, usage(99, 2_000_086_400).rateLimits[0].windows[0], start + 2 * HOUR)
  assert.equal(result.status, 'calibrating')
  assert.equal(result.sampleCount, 1)
})

test('reader collects only while opted in and clears its account-local memory on sign-out', async () => {
  let enabled = false
  let remaining = 80
  let now = 1_900_000_000_000
  let clears = 0
  const reader = createQuotaForecastReader({
    reader: { async read() { return usage(remaining) }, clear() { clears += 1 } },
    enabled: () => enabled,
    now: () => now,
  })
  assert.equal((await reader.read()).rateLimits[0].windows[0].forecast, undefined)
  enabled = true
  assert.equal((await reader.read()).rateLimits[0].windows[0].forecast.status, 'calibrating')
  remaining = 78; now += 30 * 60 * 1000; await reader.read()
  remaining = 76; now += 30 * 60 * 1000
  assert.equal((await reader.read()).rateLimits[0].windows[0].forecast.status, 'ready')
  enabled = false; await reader.read(); enabled = true
  assert.equal((await reader.read()).rateLimits[0].windows[0].forecast.status, 'calibrating')
  reader.clear()
  assert.equal(clears, 1)
  assert.equal((await reader.read()).rateLimits[0].windows[0].forecast.status, 'calibrating')
})
