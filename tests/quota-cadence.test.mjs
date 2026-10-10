import assert from 'node:assert/strict'
import test from 'node:test'
import { highestUsed, quotaRefreshMs } from '../src/quota-cadence.js'
import { createCodexUsageReader } from '../src/usage.js'

test('the quota is read faster as it runs out', () => {
  assert.deepEqual([0, 74, 75, 89, 90, 98, 99, 100].map(quotaRefreshMs), [60_000, 60_000, 30_000, 30_000, 15_000, 15_000, 5_000, 5_000])
  assert.equal(quotaRefreshMs(undefined), 60_000)
  assert.equal(highestUsed([{ usedPercent: 10 }, { usedPercent: 92 }, {}]), 92)
  assert.equal(highestUsed(undefined), undefined)
})

test('a cached reading ages with the quota that was left', async () => {
  let clock = 1_000_000
  let calls = 0
  let used = 95
  const reader = createCodexUsageReader({
    getAuth: async () => ({ auth: { apiKey: 'a' } }), readCredential: async () => ({ type: 'oauth', access: 'a', accountId: 'b' }), now: () => clock,
    fetch: async () => { calls += 1; return new Response(JSON.stringify({ rate_limit: { primary_window: { used_percent: used, limit_window_seconds: 18000, reset_at: 2_000_000 } } }), { status: 200 }) },
  })
  await reader.read()
  clock += 10_000
  await reader.read()
  assert.equal(calls, 1, 'within 15 s at 95 %')
  clock += 6_000
  await reader.read()
  assert.equal(calls, 2, 'after 15 s at 95 %')
  used = 10
  clock += 20_000
  await reader.read({ force: true })
  clock += 30_000
  await reader.read()
  assert.equal(calls, 3, 'at 10 % a reading lasts a minute')
})
