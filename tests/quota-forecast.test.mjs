import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createQuotaForecastReader,
  estimateQuotaForecast,
  forecastUsage,
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

test('forecast separates accounts and every official quota bucket', () => {
  const start = 1_900_000_000_000
  const snapshot = remaining => ({
    rateLimits: [
      { id: 'codex', windows: [{ remainingPercent: remaining, windowSeconds: 604_800, resetsAt: 2_000_000_000 }] },
      { id: 'codex_spark', windows: [{ remainingPercent: remaining / 2, windowSeconds: 18_000, resetsAt: 2_000_000_000 }] },
    ],
  })
  let state = { windows: {} }
  for (const [minutes, remaining] of [[0, 90], [5, 88], [10, 86]]) {
    const result = forecastUsage(snapshot(remaining), state, start + minutes * 60_000, { scope: 'local-a' })
    state = result.state
  }
  const accountA = forecastUsage(snapshot(86), state, start + 10 * 60_000, { scope: 'local-a' }).usage
  const accountB = forecastUsage(snapshot(86), state, start + 10 * 60_000, { scope: 'local-b' }).usage
  assert.equal(accountA.rateLimits[0].windows[0].forecast.status, 'ready')
  assert.equal(accountA.rateLimits[1].windows[0].forecast.status, 'ready')
  assert.equal(accountB.rateLimits[0].windows[0].forecast.status, 'calibrating')
})

test('reader restores persisted observations after restart and saves no provider secrets', async () => {
  let persisted
  const stateStore = {
    async load() { return structuredClone(persisted) },
    async save(value) { persisted = structuredClone(value) },
    async clear() { persisted = undefined },
  }
  let remaining = 80
  let now = 1_900_000_000_000
  const makeReader = () => createQuotaForecastReader({
    reader: { async read() { return usage(remaining) }, clear() {} },
    enabled: () => true,
    scope: () => 'local-a',
    stateStore,
    now: () => now,
  })
  let reader = makeReader()
  await reader.read()
  remaining = 78; now += 5 * 60_000; await reader.read()
  remaining = 76; now += 5 * 60_000; await reader.read()
  reader = makeReader()
  const restored = await reader.read()
  assert.equal(restored.rateLimits[0].windows[0].forecast.status, 'ready')
  assert.doesNotMatch(JSON.stringify(persisted), /access|refresh|accountId|prompt|token/iu)
  await reader.clearScope('local-a')
  assert.deepEqual(persisted, { windows: {} })
})
