import assert from 'node:assert/strict'
import test from 'node:test'
import { exhaustionOutlook, riskBand } from '../src/quota-exhaustion.js'
import { estimateQuotaForecast, observeQuotaForecast } from '../src/quota-forecast.js'
import { formatQuotaForecastLines } from '../src/client-shared.js'
import { en } from '../src/client-locales.js'
import ja from '../src/locales/ja.js'

const hour = 3_600_000
const start = Date.UTC(2026, 10, 20)
const now = start + 21 * hour
const resetsAt = (start + 168 * hour) / 1000
const windowSeconds = 604800
const history = percentages => percentages.map((remainingPercent, i) => ({ at: start + i * 7 * hour, remainingPercent }))

test('exhaustion memo separates equal-length readings, accounts and model settings', () => {
  const first = history([99, 90, 84, 80])
  const second = history([99, 98, 96, 95])
  const opts = { resetsAt, windowSeconds, particles: 350, batches: 2 }
  const high = exhaustionOutlook(first, { ...opts, remainingPercent: 80, memoScope: 'first' })
  const low = exhaustionOutlook(second, { ...opts, remainingPercent: 95, memoScope: 'first' })
  assert.equal(high.status, 'ready')
  assert.equal(low.status, 'ready')
  assert.ok(high.probability > low.probability)
  assert.equal(exhaustionOutlook(first, { ...opts, remainingPercent: 80, memoScope: 'first' }), high)
  assert.notEqual(exhaustionOutlook(first, { ...opts, remainingPercent: 80, memoScope: 'second' }), high)
  assert.notEqual(exhaustionOutlook(first, { ...opts, remainingPercent: 80, particles: 450, memoScope: 'first' }), high)
})

test('flat observations can coexist with reset risk without showing a stale result', () => {
  const readings = [...history([99, 90, 84, 80]), { at: now + hour, remainingPercent: 80 }]
  let state
  for (const s of readings) state = observeQuotaForecast(state, [{ ...s, windowSeconds, resetsAt }], s.at).state
  const fetchedAt = readings.at(-1).at
  const window = { windowSeconds, resetsAt, remainingPercent: 80 }
  const forecast = estimateQuotaForecast(state, window, fetchedAt)
  assert.equal(forecast.status, 'flat')
  assert.equal(forecast.risk.shown, 'likely')
  assert.equal(forecast.exhaustion.status, 'ready')
  assert.equal(forecast.exhaustion.runOutCurve.at(-1)[0], resetsAt * 1000)
  assert.ok(Math.abs(forecast.exhaustion.runOutCurve.at(-1)[1] - forecast.exhaustion.probability) < 1e-10)
  const t = key => en[key]
  const options = { ...window, now: fetchedAt, fetchedAt, locale: 'en-US' }
  const lines = formatQuotaForecastLines(forecast, t, options)
  assert.deepEqual(lines.map(row => row.role), ['outlook', 'budget'])
  assert.match(lines[0].text, /^If it runs out: [^(%]+$/)
  assert.match(lines[1].text, /Budget ≈/)
  assert.equal(formatQuotaForecastLines(forecast, t, { ...options, refreshError: true }).length, 1)
})

test('quota outlook shows the median weekday when the conditional range is wide', () => {
  const median = Date.UTC(2026, 10, 24, 14)
  const exhaustion = {
    status: 'ready', probability: 0.766, probabilityLow: 0.7, probabilityHigh: 0.82,
    elapsedHours: 22.9, usedPercent: 18, horizonHours: 145.1, needPacePerHour: 82 / 145.1,
  }
  const render = (halfWidth, extra = {}, shown = 'likely') => formatQuotaForecastLines({
    status: 'flat', observedSpanMs: 52 * 60_000, risk: { shown },
    exhaustion: { ...exhaustion, runOutAt: { q10: median - halfWidth * hour, q50: median, q90: median + halfWidth * hour }, ...extra },
  }, key => ja[key], { windowSeconds, remainingPercent: 82, now, fetchedAt: now, locale: 'ja-JP', timeZone: 'Asia/Tokyo' })
  assert.deepEqual(render(46).map(row => row.text), [
    '使い切るなら火曜ごろ',
    '1日平均 約19% · 目安 約14%',
  ])
  assert.match(render(12)[0].text, /^使い切るなら火曜の夜ごろ$/)
  assert.match(render(13)[0].text, /火曜.*水曜/)
  assert.equal(render(46, { probability: 0.35 }, 'possible')[0].text, '使い切るなら火曜ごろ')
  assert.equal(render(46, { probability: 0.99 }, 'very-likely')[0].text, '火曜ごろに使い切る見込み')
  assert.deepEqual(render(46, { probabilityLow: 0.4 }).map(row => row.role), ['outlook', 'budget'])
  assert.equal(render(46, { probabilityLow: 0.4 })[0].text, 'まだ判断できません')
  assert.equal(render(46, { horizonHours: 23 }).length, 1)
  assert.match(render(46, {}, 'hold')[0].text, /^この52\s*分、残量表示に変化なし$/)
})

test('a restored risk band continues a pending transition', () => {
  const outlook = { status: 'ready', probability: 0.6, probabilityHigh: 0.67 }
  const original = riskBand(outlook, { band: 'possible' }, now)
  assert.equal(original.pendingBand, 'likely')
  assert.equal(riskBand(outlook, original, now + 20 * 60_000).shown, 'likely')
})
