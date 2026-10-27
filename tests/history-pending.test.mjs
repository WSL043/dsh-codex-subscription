import assert from 'node:assert/strict'
import test from 'node:test'
import { historyPeriodKey, reportedHistoryPeriods, selectHistoryPeriod } from '../src/history-pending.js'
import { parsePlanHistory } from '../src/plan-history.js'

const period = {
  window_minutes: 10080, starts_at: '2026-10-25T04:52:53.879Z', ends_at: '2026-10-26T04:37:39Z',
  accounting_complete: false, used_basis_points: null, breakdowns: null,
}
const parse = periods => parsePlanHistory({ data_as_of: '2026-10-27T00:00:00Z', periods }).periods

test('a current real report with only null figures offers no usable history periods', () => {
  const periods = parse([period, { ...period, starts_at: '2026-10-22T00:00:00Z', ends_at: '2026-10-23T00:00:00Z' }])
  assert.equal(periods.length, 2, 'retain official boundaries without inventing figures')
  assert.deepEqual(reportedHistoryPeriods(periods), [])
  assert.equal(selectHistoryPeriod(reportedHistoryPeriods(periods)), undefined)
  assert.deepEqual(reportedHistoryPeriods(), [])
})

test('an explicitly reported zero is data, not an unsupported report', () => {
  const [zero] = reportedHistoryPeriods(parse([{ ...period, used_basis_points: 0 }]))
  assert.equal(zero.usedPercent, 0)
})

test('real breakdowns remain available when the official total is missing', () => {
  const [detail] = reportedHistoryPeriods(parse([{ ...period, breakdowns: [{ dimension: 'model', rows: [{ key: 'gpt-6.1-sol', basis_points: 0.125 }] }] }]))
  assert.equal(detail.usedPercent, undefined)
  assert.equal(detail.breakdowns.model[0].percent, 0.00125)
})

test('empty periods never hide a dated older report or impersonate current allowance', () => {
  const older = { ...period, starts_at: '2026-10-18T00:00:00Z', ends_at: '2026-10-24T00:00:00Z', used_basis_points: 101.205575 }
  const periods = reportedHistoryPeriods(parse([period, older]))
  assert.equal(periods.length, 1)
  assert.equal(selectHistoryPeriod(periods, undefined, Date.parse('2026-10-25')), periods[0])
  assert.equal(periods[0].startsAt, Date.parse(older.starts_at))
  assert.equal(periods[0].usedPercent, 1.01205575)
})

test('reported current and older periods preserve a valid explicit selection', () => {
  const a = { ...period, used_basis_points: 10 }
  const b = { ...period, starts_at: '2026-10-20T00:00:00Z', ends_at: '2026-10-24T00:00:00Z', used_basis_points: 20 }
  const periods = reportedHistoryPeriods(parse([b, a]))
  assert.equal(selectHistoryPeriod(periods, undefined, Date.parse('2026-10-25T12:00:00Z')), periods[0])
  assert.equal(selectHistoryPeriod(periods, historyPeriodKey(periods[1])), periods[1])
  assert.equal(selectHistoryPeriod(periods, 'expired-selection'), periods[0])
})

test('period identity includes the end and allowance length', () => {
  const [weekly] = parse([period])
  const short = { ...weekly, endsAt: weekly.startsAt + 300 * 60_000, windowMinutes: 300 }
  assert.notEqual(historyPeriodKey(weekly), historyPeriodKey(short))
  assert.equal(selectHistoryPeriod([weekly, short], historyPeriodKey(short)), short)
})
