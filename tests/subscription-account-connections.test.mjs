import test from 'node:test'
import assert from 'node:assert/strict'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'

test('successful account changes discard live connections; failures and reads retain them', async () => {
  let closed = 0, ok = true
  const handler = createSubscriptionRpcHandler({
    authHandler: async () => ({ ok, value: {} }),
    closeConnections: () => { closed++ },
    usageReader: { clear() {}, clearScope() {}, clearCache() {} },
    resetCreditService: { clear() {} },
  })
  for (const endpoint of ['logout', 'account/select', 'account/remove']) {
    await handler(endpoint, { id: 'test-account' })
  }
  assert.equal(closed, 3)
  await handler('status', {})
  ok = false
  for (const endpoint of ['logout', 'account/select', 'account/remove']) await handler(endpoint, {})
  assert.equal(closed, 3)
})
