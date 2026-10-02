import assert from 'node:assert/strict'
import test from 'node:test'

import { creditExpiry, creditExpiryStatus, PRO_200_COMPENSATION } from '../src/credit-expiry.js'
import { parseCodexUsage } from '../src/usage.js'

const at = (y, m, d) => Date.UTC(y, m - 1, d, 12)

test('a Pro balance covering the compensation grant is estimated to expire on 2026-12-31', () => {
  const expiry = creditExpiry({ planType: 'pro', balance: '63561.07' }, at(2026, 10, 2))
  assert.deepEqual(expiry, { expiresAt: PRO_200_COMPENSATION.expiresAt, source: 'estimate' })
  for (const timeZone of ['Asia/Tokyo', 'Asia/Shanghai', 'UTC', 'America/Los_Angeles']) {
    assert.equal(new Date(expiry.expiresAt).toLocaleDateString('en-CA', { timeZone }), '2026-12-31', timeZone)
  }
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

test('the usage projection carries the expiry and drops malformed credit details quietly', () => {
  const usage = parseCodexUsage({ plan_type: 'pro', credits: { has_credits: true, unlimited: false, balance: '63561.07' } })
  assert.equal(usage.credits.expirySource, 'estimate')
  assert.equal(usage.credits.approxLocalMessages, undefined)
  const api = parseCodexUsage({ plan_type: 'plus', credits: { has_credits: true, unlimited: false, balance: '1', expires_at: '2099-01-01T00:00:00Z' } })
  assert.equal(api.credits.expirySource, 'api')
})
