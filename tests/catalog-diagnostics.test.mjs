import test from 'node:test'
import assert from 'node:assert/strict'
import { createSubscriptionDiagnostics } from '../src/diagnostics.js'

test('support diagnostics exposes bounded capability identifiers without raw catalog metadata', async () => {
  const report = await createSubscriptionDiagnostics({
    auth: { status: async () => ({ authenticated: true, accountId: 'private-account' }) },
    preferences: { status: () => ({}) },
    modelCatalog: {
      status: () => ({ source: 'online', refresh: 'ok' }),
      capabilityGaps: () => [
        { model: 'gpt-next', reasoning: ['ultra', 'ultra', 'Bearer private-token'], inputs: ['audio'], description: 'private-description' },
        { model: 'https://private.invalid', inputs: ['video'] },
      ],
    },
  })
  assert.deepEqual(report.catalog.unsupported, [{ model: 'gpt-next', reasoning: ['ultra'], inputs: ['audio'] }])
  assert.deepEqual(report.issues, [{ code: 'catalog-capabilities-not-adapted' }])
  assert.doesNotMatch(JSON.stringify(report), /private-|Bearer|https:/)
})
