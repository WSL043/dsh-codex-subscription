import test from 'node:test'
import assert from 'node:assert/strict'
import { collectChecks, diagnosticCapabilities } from '../src/diagnostic-checks.js'
import { createDiagnosticEvents } from '../src/diagnostic-events.js'
import { createSubscriptionDiagnostics } from '../src/diagnostics.js'

test('one throwing or hung source cannot destroy or hold the report', async () => {
  const results = await collectChecks([
    { id: 'good', capability: 'settings', run: () => ({ status: 'pass', reason: 'inspection-completed' }) },
    { id: 'bad', capability: 'models', run: () => { throw Error('Bearer secret') } },
    { id: 'hung', capability: 'account', run: () => new Promise(() => {}) },
    { id: 'missing', capability: 'storage' },
  ], { timeoutMs: 10 })
  assert.deepEqual(results.map(x => x.reason), ['inspection-completed', 'inspection-failed', 'inspection-timeout', 'not-instrumented'])
  assert.doesNotMatch(JSON.stringify(results), /Bearer|secret/)
})

test('request history preserves failure then recovery with timestamps and bounded retention', () => {
  let time = 100
  const store = createDiagnosticEvents({ limit: 2, now: () => time++ })
  store.record('quota', { status: 'failed', code: 'timeout', token: 'secret' })
  store.record('quota', { status: 'ok', url: 'private' })
  assert.deepEqual(store.snapshot().events.map(x => [x.status, x.observedAt]), [['failed', 100], ['ok', 101]])
  store.record('private-url', { status: 'ok' })
  store.record('model', { status: 'ok' })
  assert.equal(store.snapshot().events.length, 2)
  assert.equal(store.snapshot().dropped, 1)
  const copy = store.snapshot(); copy.events[0].status = 'failed'
  assert.equal(store.snapshot().events[0].status, 'ok')
  assert.doesNotMatch(JSON.stringify(store.snapshot()), /secret|private|token|url/)
})

test('service report survives unavailable preferences and catalog, without pretending storage or tools were tested', async () => {
  const result = await createSubscriptionDiagnostics({
    auth: { status: async () => ({ authenticated: true, email: 'private' }) },
    preferences: { status: () => { throw Error('private') } },
    modelCatalog: { status: () => { throw Error('private') }, capabilityGaps: () => [] },
  })
  assert.equal(result.account.status, 'signed-in')
  assert.equal(result.inspection.checks.find(x => x.id === 'preferences').status, 'unknown')
  assert.equal('writable' in result.configuration, false)
  assert.deepEqual(result.inspection.capabilities.map(x => x.id), diagnosticCapabilities)
  assert.ok(result.inspection.capabilities.every(x => x.execution === 'not-verified'))
  assert.doesNotMatch(JSON.stringify(result), /private/)
})

test('report reprojects history and isolates throwing service getters', async () => {
  const result = await createSubscriptionDiagnostics({
    auth: { status: async () => ({ authenticated: true }) }, preferences: { status: () => ({}) },
    modelCatalog: { get status() { throw Error('private') } },
    network: { history: () => ({ secret: 'private', events: [
      { area: 'quota', status: 'ok', sequence: 1, observedAt: 123, secret: 'private' },
      { area: 'private', status: 'ok', sequence: 2, observedAt: 124 },
    ] }) },
  })
  assert.equal(result.inspection.checks.find(x => x.id === 'catalog').reason, 'inspection-failed')
  assert.equal(result.requestHistory.events.length, 1)
  assert.doesNotMatch(JSON.stringify(result), /private|secret/)
})

test('late source completion does not mutate an already returned report', async () => {
  let finish
  const report = await createSubscriptionDiagnostics({
    auth: { status: () => new Promise(resolve => { finish = resolve }) },
    preferences: { status: () => ({ writable: true }) }, inspectionOptions: { timeoutMs: 10 },
  })
  const before = JSON.stringify(report)
  finish({ authenticated: true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(JSON.stringify(report), before)
  assert.equal(report.account.status, 'unknown')
  assert.equal(report.inspection.checks.find(x => x.id === 'account').reason, 'inspection-timeout')
})
