import assert from 'node:assert/strict'
import test from 'node:test'

import { selectSidebarQuota } from '../src/sidebar-quota.js'

test('sidebar quota selects the most constrained standard Codex window', () => {
  const selected = selectSidebarQuota({
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
  })

  assert.deepEqual(selected, {
    remainingPercent: 46.5,
    windowSeconds: 604_800,
    resetsAt: 200,
  })
})

test('sidebar quota accepts a weekly-only response and ignores invalid windows', () => {
  assert.deepEqual(selectSidebarQuota({
    rateLimits: [{
      id: 'codex',
      windows: [
        { remainingPercent: Number.NaN, windowSeconds: 18_000 },
        { remainingPercent: 72, windowSeconds: 604_800 },
      ],
    }],
  }), {
    remainingPercent: 72,
    windowSeconds: 604_800,
  })
})

test('sidebar quota fails closed for missing, nonstandard, or malformed data', () => {
  assert.equal(selectSidebarQuota(undefined), undefined)
  assert.equal(selectSidebarQuota({ rateLimits: [] }), undefined)
  assert.equal(selectSidebarQuota({
    rateLimits: [{ id: 'codex_spark', windows: [{ remainingPercent: 10, windowSeconds: 604_800 }] }],
  }), undefined)
  assert.equal(selectSidebarQuota({
    rateLimits: [{ id: 'codex', windows: [{ remainingPercent: -1, windowSeconds: 604_800 }] }],
  }), undefined)
})
