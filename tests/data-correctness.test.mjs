import assert from 'node:assert/strict'
import test from 'node:test'

import { creditExpiry, creditExpiryDateText } from '../src/credit-expiry.js'
import { creditAmount, formatQuotaForecast, windowLabel } from '../src/client-shared.js'
import { estimateQuotaForecast, observeQuotaForecast } from '../src/quota-forecast.js'
import { forecastRunway, roundRunwaySeconds } from '../src/quota-pace.js'
import { formatDuration, heatmapCells } from '../src/usage-heatmap.js'
import { zh as zhStrings, en as enStrings } from '../src/client-locales.js'
const zh = key => zhStrings[key]
const en = key => enStrings[key]

const HOUR = 3_600_000
const win = (remainingPercent, windowSeconds, resetsAt) => ({ remainingPercent, windowSeconds, resetsAt })

function observed(windowSeconds, resetsAt, points, start = 1_900_000_000_000) {
  let state
  for (const [hours, remaining] of points) state = observeQuotaForecast(state, [win(remaining, windowSeconds, resetsAt)], start + hours * HOUR).state
  return { state, start }
}

test('the same snapshot gives the same forecast however long after it is read', () => {
  const { state, start } = observed(604_800, 2_000_000_000, [[0, 80], [0.5, 78], [1, 76]])
  const at = start + HOUR
  const first = estimateQuotaForecast(state, win(76, 604_800, 2_000_000_000), at + 60_000)
  const second = estimateQuotaForecast(state, win(76, 604_800, 2_000_000_000), at + 6 * 60_000)
  assert.equal(first.status, 'ready')
  assert.equal(second.pacePerHour, first.pacePerHour)
  assert.equal(second.runwaySeconds, first.runwaySeconds)
})

test('every place rounds the runway the same way', () => {
  assert.equal(roundRunwaySeconds(20.4 * 3600), 20 * 3600)
  assert.equal(roundRunwaySeconds(21.6 * 3600), 22 * 3600)
  assert.equal(roundRunwaySeconds(100 * 3600), 102 * 3600)
  assert.equal(roundRunwaySeconds(1000), 900)
  const raw = { status: 'ready', provisional: true, runwaySeconds: 20.4 * 3600 }
  const t = key => ({ quotaForecast: '{symbol}{duration}', runwayHours: '{hours}h' })[key]
  assert.deepEqual(forecastRunway(raw), { kind: 'point', seconds: 20 * 3600 })
  assert.equal(formatQuotaForecast(raw, t), '≈20h')
  assert.equal(formatQuotaForecast({ status: 'ready', runwaySeconds: 20.4 * 3600 }, t), '≈20h')
})

test('a provisional estimate that outlasts the reset reads as enough until reset', () => {
  const start = 1_900_000_000_000
  const resetsAt = start / 1000 + 3 * 3600 + 3600
  // 2% in 1 h at 80% left would last 40 h, far beyond the 3 h to reset.
  const { state } = observed(18_000, resetsAt, [[0, 82], [0.5, 81], [1, 80]], start)
  const forecast = estimateQuotaForecast(state, win(80, 18_000, resetsAt), start + HOUR)
  assert.equal(forecast.status, 'ready')
  assert.equal(forecast.survivesReset, true)
  assert.deepEqual(forecastRunway(forecast), { kind: 'reset' })
})

test('heatmap keeps the newest report day on the grid and honours the first weekday', () => {
  const now = new Date(2026, 9, 18, 20, 0)
  const days = [{ date: '2026-10-19', tokens: 5 }, { date: '2026-10-18', tokens: 7 }]
  const cells = heatmapCells(days, { now, firstDay: 1 })
  assert.equal(cells.at(-1).date, '2026-10-19')
  assert.equal(cells.at(-1).tokens, 5)
  assert.equal(cells.at(-1).row, 0, '2026-10-19 is a Monday and starts a Monday-first column')
  assert.equal(heatmapCells(days, { now, firstDay: 0 }).at(-1).row, 1)
  assert.equal(heatmapCells([{ date: '2026-10-18', tokens: 7 }], { now }).at(-1).date, '2026-10-18')
})

test('durations use the interface language units', () => {
  assert.equal(formatDuration(115_668, zh), '32.1 小时')
  assert.equal(formatDuration(115_668, en), '32.1 h')
  assert.equal(formatDuration(90, zh), '2 分钟')
})

test('a Pro balance far above the grant gets no expiry estimate', () => {
  const now = Date.UTC(2026, 9, 2, 12)
  assert.equal(creditExpiry({ planType: 'pro', balance: '70000' }, now), undefined)
  assert.equal(creditExpiry({ planType: 'pro', balance: '63561.07' }, now).source, 'estimate')
})

test('the estimated expiry date is a UTC calendar day in every time zone', () => {
  const expiresAt = Date.UTC(2026, 11, 31, 12)
  const original = process.env.TZ
  try {
    for (const zone of ['Pacific/Kiritimati', 'Asia/Shanghai', 'America/Los_Angeles']) {
      process.env.TZ = zone
      assert.match(creditExpiryDateText(expiresAt, 'estimate', 'en-US'), /^12\/31\/2026$/u, zone)
    }
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
})

test('spend-limit amounts are shortened like the balance', () => {
  assert.equal(creditAmount('1234.56789012'), (1234.57).toLocaleString(undefined, { maximumFractionDigits: 2 }))
  assert.equal(creditAmount('5000'), (5000).toLocaleString(undefined, { maximumFractionDigits: 2 }))
})

test('windows of two days or more are labelled in days with one decimal', () => {
  const t = key => ({ windowDays: '{value} days', windowHours: '{value} hours' })[key]
  assert.equal(windowLabel(108 * 3600, t), '4.5 days')
  assert.equal(windowLabel(3 * 86_400, t), '3 days')
  assert.equal(windowLabel(36 * 3600, t), '36 hours')
})
