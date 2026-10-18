import assert from 'node:assert/strict'
import test from 'node:test'
import { quotaPace, paceWords } from '../src/quota-pace.js'

const DAY = 86_400_000
const week = 7 * 86_400
const at = (now, resetIn) => ({ windowSeconds: week, resetsAt: Math.floor((now + resetIn) / 1000) })

test('a week that is burning faster than it refills is projected to run out before the reset', () => {
  const now = Date.UTC(2026, 9, 19, 12)
  // 3 days in, 61% used: 100% would come after 4.9 days, before the 4 days left have passed
  const pace = quotaPace({ remainingPercent: 39, ...at(now, 4 * DAY), now })
  assert.ok(pace)
  assert.ok(Math.abs(pace.runsOutAt - (now + 39 * 3 * DAY / 61)) < 1000)
  assert.ok(pace.runsOutAt < pace.resetsAt)
})

test('on pace, too early, barely used, hit, or short windows give no warning', () => {
  const now = Date.UTC(2026, 9, 19, 12)
  assert.equal(quotaPace({ remainingPercent: 70, ...at(now, 4 * DAY), now }), undefined, '30% in 3 days is on pace')
  assert.equal(quotaPace({ remainingPercent: 30, ...at(now, 6.8 * DAY), now }), undefined, 'under 12 hours in')
  assert.equal(quotaPace({ remainingPercent: 95, ...at(now, 3 * DAY), now }), undefined, 'under 10% used')
  assert.equal(quotaPace({ remainingPercent: 0, ...at(now, 3 * DAY), now }), undefined, 'already hit')
  assert.equal(quotaPace({ remainingPercent: 10, windowSeconds: 5 * 3600, resetsAt: Math.floor((now + 2 * 3600e3) / 1000), now }), undefined, 'five-hour windows are not projected')
})

test('the warning names the day and the part of the day', () => {
  const t = key => ({ paceWhen: '{day}{part}', paceResetOf: '{day}的重置', paceDay_today: '今天', paceDay_tomorrow: '明天', pacePart_morning: '早上', pacePart_night: '夜里' })[key] ?? key
  const now = new Date(2026, 9, 19, 12).getTime()
  const words = paceWords({ runsOutAt: new Date(2026, 9, 20, 8).getTime(), resetsAt: new Date(2026, 9, 23, 23).getTime() }, now, { t, locale: 'zh-CN' })
  assert.equal(words.runOut, '明天早上')
  assert.match(words.reset, /的重置$/u)
})
