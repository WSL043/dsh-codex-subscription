import assert from 'node:assert/strict'
import test from 'node:test'
import { historyPeriodKey, pendingReason, selectHistoryPeriod } from '../src/history-pending.js'
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
  assert.equal(c.usedPercent, 1.01205575)
  assert.equal(pendingReason(a, Date.parse('2026-10-15T00:00:00Z')), 'current')
  assert.equal(pendingReason(a, Date.parse('2026-10-19T00:00:00Z')), 'past')
  assert.equal(pendingReason(b, Date.parse('2026-10-19T00:00:00Z')), 'past')
  assert.equal(pendingReason(c, Date.parse('2026-10-19T00:00:00Z')), undefined)
})

test('all pending periods remain selectable instead of being reported as empty', () => {
  const periods = parsePlanHistory(live).periods.slice(0, 2)
  assert.equal(selectHistoryPeriod(periods, undefined, Date.parse('2026-10-15')), periods[0])
  assert.equal(selectHistoryPeriod(periods, historyPeriodKey(periods[1])), periods[1])
  assert.equal(selectHistoryPeriod([]), undefined)
})

test('current pending period is the default even when old periods have figures', () => {
  const periods = parsePlanHistory(live).periods
  const now = Date.parse('2026-10-15')
  assert.equal(selectHistoryPeriod(periods, undefined, now), periods[0])
  assert.equal(selectHistoryPeriod(periods, historyPeriodKey(periods[2]), now), periods[2])
  assert.equal(selectHistoryPeriod(periods, 'expired-selection', now), periods[0])
})

test('period identity includes its end and allowance length, not just its start', () => {
  const [weekly] = parsePlanHistory(live).periods
  const short = { ...weekly, endsAt: weekly.startsAt + 300 * 60_000, windowMinutes: 300 }
  assert.notEqual(historyPeriodKey(weekly), historyPeriodKey(short))
  assert.equal(selectHistoryPeriod([weekly, short], historyPeriodKey(short)), short)
})

test('a period that really used nothing (0 basis points) is a figure, not pending', () => {
  const [p] = parsePlanHistory({ periods: [{ ...live.periods[2], used_basis_points: 0 }] }).periods
  assert.equal(p.usedPercent, 0)
  assert.equal(pendingReason(p), undefined)
})
