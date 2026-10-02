import assert from 'node:assert/strict'
import test from 'node:test'

import { creditExpiry, creditExpiryStatus, PRO_200_COMPENSATION } from '../src/credit-expiry.js'
import { parseCodexUsage } from '../src/usage.js'

const at = (y, m, d) => Date.UTC(y, m - 1, d, 12)

test('a Pro balance covering the compensation grant is estimated to expire on 2026-12-31', () => {
  const expiry = creditExpiry({ planType: 'pro', balance: '63561.07' }, at(2026, 10, 2))
  assert.deepEqual(expiry, { expiresAt: PRO_200_COMPENSATION.expiresAt, source: 'estimate' })
  assert.equal(new Date(expiry.expiresAt).toISOString().slice(0, 10), '2026-12-31')
})

test('no estimate for other plans, small balances or after the date; the API value always wins', () => {
  assert.equal(creditExpiry({ planType: 'plus', balance: '70000' }, at(2026, 10, 2)), undefined)
  assert.equal(creditExpiry({ planType: 'pro', balance: '1200' }, at(2026, 10, 2)), undefined)
  assert.equal(creditExpiry({ planType: 'pro', balance: '70000' }, at(2027, 1, 2)), undefined)
  const api = at(2026, 11, 15)
  assert.deepEqual(creditExpiry({ planType: 'pro', balance: '70000', apiExpiresAt: api }, at(2026, 10, 2)), { expiresAt: api, source: 'api' })
})

test('status counts days and calls out the last 30', () => {
  const expiry = { expiresAt: at(2026, 12, 31) }
  assert.deepEqual(creditExpiryStatus(expiry, at(2026, 10, 2)), { daysLeft: 90, soon: false })
  assert.equal(creditExpiryStatus(expiry, at(2026, 12, 10)).soon, true)
  assert.equal(creditExpiryStatus(undefined), undefined)
})

test('the usage projection carries expiry, message estimates and ChatPass without touching rate limits', () => {
  const usage = parseCodexUsage({
    plan_type: 'pro',
    chatpass: { windows: [{ used_percent: 10, limit_window_seconds: 604800, reset_at: 1791503997 }] },
    credits: { has_credits: true, unlimited: false, balance: '63561.07', approx_local_messages: [15890, 82629], approx_cloud_messages: [2542, 15890] },
  })
  assert.deepEqual(usage.rateLimits, [])
  assert.equal(usage.chatPass.windows[0].remainingPercent, 90)
  assert.equal(usage.credits.expirySource, 'estimate')
  assert.deepEqual(usage.credits.approxLocalMessages, [15890, 82629])
  const odd = parseCodexUsage({ credits: { has_credits: true, unlimited: false, balance: '1', approx_local_messages: 'x' }, chatpass: { windows: 'x' } })
  assert.equal(odd.credits.approxLocalMessages, undefined)
  assert.equal(odd.chatPass, undefined)
})
