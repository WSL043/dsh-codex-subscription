import assert from 'node:assert/strict'
import test from 'node:test'

import { createCodexUsageReader, parseCodexUsage } from '../src/usage.js'

test('usage parser returns secret-free remaining quota windows and exact disclosed balances', () => {
  const parsed = parseCodexUsage({
    rate_limit: {
      primary_window: { used_percent: 25, limit_window_seconds: 18_000 },
      secondary_window: { used_percent: 80, limit_window_seconds: 604_800 },
    },
    additional_rate_limits: [{
      metered_feature: 'code_review',
      limit_name: 'Code review',
      rate_limit: { primary_window: { used_percent: 10, limit_window_seconds: 86_400 } },
    }],
    credits: { has_credits: true, unlimited: false, balance: '12.50' },
    spend_control: {
      individual_limit: { limit: '100', used: '35', remaining: '65', remaining_percent: 65 },
    },
    access_token: 'must-not-leak',
  })
  assert.deepEqual(parsed.rateLimits[0].windows.map(window => window.remainingPercent), [75, 20])
  assert.equal(parsed.rateLimits[1].id, 'code_review')
  assert.deepEqual(parsed.credits, { unlimited: false, balance: '12.50' })
  assert.equal(parsed.individualLimit.remainingPercent, 65)
  assert.doesNotMatch(JSON.stringify(parsed), /must-not-leak|access_token/)
})

test('usage parser fails closed on malformed provider values', () => {
  assert.throws(() => parseCodexUsage({ rate_limit: { primary_window: { used_percent: 101, limit_window_seconds: 1 } } }), /percentage/i)
  assert.throws(() => parseCodexUsage({ additional_rate_limits: {} }), /additional/i)
  assert.throws(() => parseCodexUsage({ credits: { has_credits: true, unlimited: false, balance: 'NaN' } }), /balance/i)
})

test('usage reader is single-flight, short cached, and never exposes bearer or account id', async () => {
  let now = 1_000
  let requests = 0
  let release
  const pending = new Promise(resolve => { release = resolve })
  const seen = []
  const reader = createCodexUsageReader({
    now: () => now,
    ttlMs: 60_000,
    async getAuth() { return { auth: { apiKey: 'bearer-secret' } } },
    async readCredential() { return { type: 'oauth', accountId: 'account-secret' } },
    async fetch(url, init) {
      requests += 1
      seen.push({ url, init })
      await pending
      return {
        ok: true,
        async json() {
          return {
            rate_limit: {
              primary_window: { used_percent: 25, limit_window_seconds: 18_000 },
            },
          }
        },
      }
    },
  })

  const first = reader.read()
  const concurrent = reader.read()
  release()
  const [a, b] = await Promise.all([first, concurrent])
  assert.deepEqual(a, b)
  assert.equal(requests, 1)
  assert.equal(seen[0].url, 'https://chatgpt.com/backend-api/wham/usage')
  assert.equal(seen[0].init.redirect, 'error')
  assert.equal(seen[0].init.headers.authorization, 'Bearer bearer-secret')
  assert.equal(seen[0].init.headers['chatgpt-account-id'], 'account-secret')
  assert.doesNotMatch(JSON.stringify(a), /bearer-secret|account-secret/)

  now += 59_000
  assert.deepEqual(await reader.read(), a)
  assert.equal(requests, 1)
})

test('usage reader fails closed with bounded public errors', async () => {
  const signedOut = createCodexUsageReader({
    async getAuth() { return { auth: {} } },
    async readCredential() { return undefined },
    async fetch() { throw new Error('must not fetch') },
  })
  await assert.rejects(signedOut.read(), /^Error: ChatGPT subscription is not signed in$/)

  const failed = createCodexUsageReader({
    async getAuth() { return { auth: { apiKey: 'access-secret' } } },
    async readCredential() { return { type: 'oauth', accountId: 'account-secret' } },
    async fetch() { return { ok: false, status: 503 } },
  })
  await assert.rejects(failed.read(), error => {
    assert.equal(error.message, 'ChatGPT usage request failed (HTTP 503)')
    assert.doesNotMatch(error.message, /access-secret|account-secret/)
    return true
  })
})
