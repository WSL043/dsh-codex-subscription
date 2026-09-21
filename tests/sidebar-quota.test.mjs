import assert from 'node:assert/strict'
import test from 'node:test'

import { selectModelQuota, selectModelQuotaWindows } from '../src/sidebar-quota.js'
import { parseCodexUsage } from '../src/usage.js'

test('separate backend Reserve quota survives parsing and is selected without ordinary quota', () => {
  const usage = parseCodexUsage({
    rate_limit: { primary_window: { used_percent: 100, limit_window_seconds: 18000 } },
    additional_rate_limits: [{ metered_feature: 'gpt_reserve', limit_name: 'GPT-Reserve',
      rate_limit: { primary_window: { used_percent: 25, limit_window_seconds: 604800 } } }],
  })
  assert.equal(usage.rateLimits.length, 2)
  assert.deepEqual(selectModelQuotaWindows(usage, 'gpt-reserve'), [
    { remainingPercent: 75, windowSeconds: 604800 },
  ])
  assert.equal(selectModelQuota(usage, 'gpt-5.6-luna').remainingPercent, 0)
})

test('Reserve never borrows ordinary quota when its bucket is absent or invalid', () => {
  const ordinary = { id: 'codex', windows: [{ remainingPercent: 80, windowSeconds: 604800 }] }
  for (const extra of [[], [{ id: 'gpt-reserve', windows: [] }],
    [{ id: 'gpt-reserve', windows: [{ remainingPercent: NaN, windowSeconds: 604800 }] }],
    [{ id: 'another-reserve', windows: ordinary.windows }]]) {
    assert.deepEqual(selectModelQuotaWindows({ rateLimits: [ordinary, ...extra] }, 'gpt-reserve'), [])
  }
})

test('an exact model quota takes priority over shared Codex quota', () => {
  const usage = { rateLimits: [
    { id: 'codex', windows: [{ remainingPercent: 10, windowSeconds: 604800 }] },
    { id: 'model-specific', name: 'GPT-6-Astra', windows: [{ remainingPercent: 90, windowSeconds: 604800 }] },
  ] }
  assert.equal(selectModelQuota(usage, 'gpt-6-astra').remainingPercent, 90)
  assert.equal(selectModelQuota(usage, 'gpt-5.6-luna').remainingPercent, 10)
})

test('composer retains both Plus five-hour and weekly quotas regardless of which is lower', () => {
  for (const [shortRemaining, weeklyRemaining] of [[90, 20], [10, 80]]) {
    const usage = { rateLimits: [{ id: 'codex', windows: [
      { windowSeconds: 604_800, remainingPercent: weeklyRemaining, resetsAt: 222 },
      { windowSeconds: 18_000, remainingPercent: shortRemaining, resetsAt: 111 },
    ] }] }
    assert.deepEqual(selectModelQuotaWindows(usage, 'gpt-5.6-luna'), [
      { windowSeconds: 18_000, remainingPercent: shortRemaining, resetsAt: 111 },
      { windowSeconds: 604_800, remainingPercent: weeklyRemaining, resetsAt: 222 },
    ])
    assert.equal(usage.rateLimits[0].windows[0].windowSeconds, 604_800, 'source order is not mutated')
  }
})

test('composer does not invent a five-hour quota and keeps Spark limits separate', () => {
  const usage = { rateLimits: [
    { id: 'codex', windows: [{ windowSeconds: 604_800, remainingPercent: 0 }] },
    { id: 'codex_spark', windows: [{ windowSeconds: 18_000, remainingPercent: 35 }] },
  ] }
  assert.deepEqual(selectModelQuotaWindows(usage, 'gpt-5.6-luna'), [{ windowSeconds: 604_800, remainingPercent: 0 }])
  assert.deepEqual(selectModelQuotaWindows(usage, 'gpt-5.3-codex-spark'), [{ windowSeconds: 18_000, remainingPercent: 35 }])
  assert.deepEqual(selectModelQuotaWindows(undefined, 'gpt-5.6-luna'), [])
})

test('each composer window retains its own forecast and reset metadata', () => {
  const shortForecast = { status: 'ready', runwaySeconds: 1200, survivesReset: false }
  const weeklyForecast = { status: 'calibrating' }
  const result = selectModelQuotaWindows({ rateLimits: [{ id: 'codex', windows: [
    { remainingPercent: 30, windowSeconds: 18_000, resetsAt: 100, forecast: shortForecast },
    { remainingPercent: 60, windowSeconds: 604_800, resetsAt: 200, forecast: weeklyForecast },
    { remainingPercent: NaN, windowSeconds: 18_000 },
  ] }] }, 'gpt-5.6-luna')
  assert.equal(result.length, 2)
  assert.equal(result[0].forecast, shortForecast)
  assert.equal(result[1].forecast, weeklyForecast)
  assert.deepEqual(result.map(window => window.resetsAt), [100, 200])
})

test('model quota selects the most constrained standard Codex window', () => {
  const selected = selectModelQuota({
    rateLimits: [
      { id: 'codex_spark', windows: [{ remainingPercent: 12, windowSeconds: 604_800 }] },
      {
        id: 'codex',
        windows: [
          { remainingPercent: 81, windowSeconds: 18_000, resetsAt: 100 },
          { remainingPercent: 46.5, windowSeconds: 604_800, resetsAt: 200 },
        ],
      },
    ],
    credits: { balance: '12.50' },
    individualLimit: { remainingPercent: 65 },
  }, 'gpt-5.6-luna')

  assert.deepEqual(selected, {
    remainingPercent: 46.5,
    windowSeconds: 604_800,
    resetsAt: 200,
  })
})

test('model quota accepts a weekly-only response and ignores invalid windows', () => {
  assert.deepEqual(selectModelQuota({
    rateLimits: [{
      id: 'codex',
      windows: [
        { remainingPercent: Number.NaN, windowSeconds: 18_000 },
        { remainingPercent: 72, windowSeconds: 604_800 },
      ],
    }],
  }, 'gpt-5.6-luna'), {
    remainingPercent: 72,
    windowSeconds: 604_800,
  })
})

test('model quota selects the backend-named Spark bucket for a Spark model', () => {
  assert.deepEqual(selectModelQuota({
    rateLimits: [
      { id: 'codex', name: 'Codex', windows: [{ remainingPercent: 42, windowSeconds: 604_800 }] },
      { id: 'feature-x', name: 'GPT-5.3-Codex-Spark', windows: [{ remainingPercent: 88, windowSeconds: 604_800 }] },
    ],
  }, 'gpt-5.3-codex-spark'), {
    remainingPercent: 88,
    windowSeconds: 604_800,
  })
})

test('model quota fails closed for missing, unmatched, or malformed data', () => {
  assert.equal(selectModelQuota(undefined, 'gpt-5.6-luna'), undefined)
  assert.equal(selectModelQuota({ rateLimits: [] }, 'gpt-5.6-luna'), undefined)
  assert.equal(selectModelQuota({
    rateLimits: [{ id: 'codex_spark', windows: [{ remainingPercent: 10, windowSeconds: 604_800 }] }],
  }, 'gpt-5.6-luna'), undefined)
  assert.equal(selectModelQuota({
    rateLimits: [{ id: 'codex', windows: [{ remainingPercent: -1, windowSeconds: 604_800 }] }],
  }, 'gpt-5.6-luna'), undefined)
})
