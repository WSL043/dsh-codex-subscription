import assert from 'node:assert/strict'
import test from 'node:test'

import { selectModelQuota } from '../src/sidebar-quota.js'

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
