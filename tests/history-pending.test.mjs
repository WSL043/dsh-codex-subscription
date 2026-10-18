import assert from 'node:assert/strict'
import test from 'node:test'
import { pendingReason } from '../src/history-pending.js'
import { parsePlanHistory } from '../src/plan-history.js'

// Shape seen on a real Pro account: the two newest periods carry null figures, data_as_of trails by days.
const live = {
  data_as_of: '2026-10-13T00:00:00Z', coverage_complete: false, approximate: true,
  periods: [
    { id: 'a', window_minutes: 10080, plan_type: 'pro', starts_at: '2026-10-11T04:22:24.427000Z', ends_at: '2026-10-18T04:22:24.427000Z', accounting_complete: false, used_basis_points: null, breakdowns: null },
    { id: 'b', window_minutes: 10080, plan_type: 'pro', starts_at: '2026-10-07T09:22:01Z', ends_at: '2026-10-11T03:56:55Z', accounting_complete: false, used_basis_points: null, breakdowns: null },
    { id: 'c', window_minutes: 10080, plan_type: 'pro', starts_at: '2026-10-03T07:20:24Z', ends_at: '2026-10-07T03:27:24Z', accounting_complete: true, used_basis_points: 101.205575, breakdowns: [] },
  ],
}

test('periods the report left null have no figure and say whether they are running or not yet counted', () => {
  const [a, b, c] = parsePlanHistory(live).periods
  assert.equal(a.usedPercent, undefined)
  assert.equal(c.usedPercent, 1.01)
  assert.equal(pendingReason(a, Date.parse('2026-10-15T00:00:00Z')), 'current')
  assert.equal(pendingReason(a, Date.parse('2026-10-19T00:00:00Z')), 'past')
  assert.equal(pendingReason(b, Date.parse('2026-10-19T00:00:00Z')), 'past')
  assert.equal(pendingReason(c, Date.parse('2026-10-19T00:00:00Z')), undefined)
})

test('a period that really used nothing (0 basis points) is a figure, not pending', () => {
  const [p] = parsePlanHistory({ periods: [{ ...live.periods[2], used_basis_points: 0 }] }).periods
  assert.equal(p.usedPercent, 0)
  assert.equal(pendingReason(p), undefined)
})
