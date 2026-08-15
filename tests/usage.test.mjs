import assert from 'node:assert/strict'
import test from 'node:test'

import { createCodexUsageReader, parseCodexUsage } from '../src/usage.js'

test('usage parser returns secret-free remaining quota windows and exact disclosed balances', () => {
  const parsed = parseCodexUsage({
    rate_limit: {
      primary_window: {
        used_percent: 25,
        limit_window_seconds: 18_000,
        reset_after_seconds: 3_600,
        reset_at: 1_800_003_600,
      },
      secondary_window: {
        used_percent: 80,
        limit_window_seconds: 604_800,
        reset_after_seconds: 86_400,
        reset_at: 1_800_086_400,
      },
    },
    additional_rate_limits: [{
      metered_feature: 'code_review',
      limit_name: 'Code review',
      rate_limit: {
        primary_window: {
          used_percent: 10,
          limit_window_seconds: 86_400,
          reset_after_seconds: 7_200,
          reset_at: 1_800_007_200,
        },
      },
    }],
    credits: { has_credits: true, unlimited: false, balance: '12.50' },
    spend_control: {
      reached: false,
      individual_limit: {
        limit: '100',
        used: '35',
        remaining: '65',
        remaining_percent: 65,
        reset_at: 1_802_592_000,
      },
    },
    rate_limit_reset_credits: { available_count: 2 },
    access_token: 'must-not-leak',
  })
  assert.deepEqual(parsed.rateLimits[0].windows, [
    {
      usedPercent: 25,
      remainingPercent: 75,
      windowSeconds: 18_000,
      resetsAt: 1_800_003_600,
    },
    {
      usedPercent: 80,
      remainingPercent: 20,
      windowSeconds: 604_800,
      resetsAt: 1_800_086_400,
    },
  ])
  assert.equal(parsed.rateLimits[1].id, 'code_review')
  assert.deepEqual(parsed.credits, { unlimited: false, balance: '12.50' })
  assert.deepEqual(parsed.individualLimit, {
    limit: '100',
    used: '35',
    remainingPercent: 65,
    resetsAt: 1_802_592_000,
  })
  assert.equal(parsed.spendControlReached, false)
  assert.deepEqual(parsed.resetCredits, { availableCount: 2 })
  assert.doesNotMatch(JSON.stringify(parsed), /must-not-leak|access_token/)
})

test('usage parser preserves the legacy standalone code-review bucket', () => {
  const parsed = parseCodexUsage({
    code_review_rate_limit: {
      primary_window: { used_percent: 20, limit_window_seconds: 604_800 },
    },
  })
  assert.deepEqual(parsed.rateLimits, [{
    id: 'code_review',
    name: 'Code review',
    windows: [{ usedPercent: 20, remainingPercent: 80, windowSeconds: 604_800 }],
  }])
})

test('usage parser keeps current weekly-only Codex and Spark buckets without inventing a short window', () => {
  const parsed = parseCodexUsage({
    rate_limit: {
      primary_window: {
        used_percent: 34,
        limit_window_seconds: 604_800,
        reset_at: 1_800_086_400,
      },
    },
    additional_rate_limits: [{
      metered_feature: 'codex_bengalfox',
      limit_name: 'GPT-5.3-Codex-Spark',
      rate_limit: {
        primary_window: {
          used_percent: 12,
          limit_window_seconds: 604_800,
          reset_at: 1_800_172_800,
        },
      },
    }],
  })

  assert.deepEqual(parsed.rateLimits, [
    {
      id: 'codex',
      name: 'Codex',
      windows: [{
        usedPercent: 34,
        remainingPercent: 66,
        windowSeconds: 604_800,
        resetsAt: 1_800_086_400,
      }],
    },
    {
      id: 'codex_bengalfox',
      name: 'GPT-5.3-Codex-Spark',
      windows: [{
        usedPercent: 12,
        remainingPercent: 88,
        windowSeconds: 604_800,
        resetsAt: 1_800_172_800,
      }],
    },
  ])
})

test('usage parser automatically exposes a short window when the backend returns it again', () => {
  const parsed = parseCodexUsage({
    rate_limit: {
      primary_window: { used_percent: 5, limit_window_seconds: 18_000 },
      secondary_window: { used_percent: 20, limit_window_seconds: 604_800 },
    },
  })
  assert.deepEqual(parsed.rateLimits[0].windows.map(window => window.windowSeconds), [18_000, 604_800])
})

test('usage parser fails closed on malformed provider values', () => {
  assert.throws(() => parseCodexUsage({ rate_limit: { primary_window: { used_percent: 101, limit_window_seconds: 1 } } }), /percentage/i)
  assert.throws(() => parseCodexUsage({ rate_limit: { primary_window: { used_percent: 1, limit_window_seconds: 1, reset_at: 'soon' } } }), /reset time/i)
  assert.throws(() => parseCodexUsage({ additional_rate_limits: {} }), /additional/i)
  assert.throws(() => parseCodexUsage({ credits: { has_credits: true, unlimited: false, balance: 'NaN' } }), /balance/i)
  assert.throws(() => parseCodexUsage({ spend_control: { reached: 'yes' } }), /spend-control/i)
  assert.throws(() => parseCodexUsage({ rate_limit_reset_credits: { available_count: -1 } }), /reset credit/i)
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
