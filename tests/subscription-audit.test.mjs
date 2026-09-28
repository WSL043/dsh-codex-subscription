import test from 'node:test'
import assert from 'node:assert/strict'
import { readSubscriptionCredentials } from '../src/subscription-credentials.js'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'
import { createDiagnosticOperations, safeOperations } from '../src/diagnostic-operations.js'
import { capabilityCoverage } from '../src/diagnostic-capabilities.js'
import { projectHostSlots, createHostDiagnostics } from '../src/diagnostic-host.js'
import { diagnosticSummary } from '../src/diagnostic-summary.js'

test('cancellation and unrelated success cannot clear a failure, even with browser clock skew', () => {
  const report = { generatedAt: new Date(100).toISOString(), inspection: { checks: [], capabilities: [] }, operations: { dropped: 1, events: [
    { capability: 'settings', source: 'rpc', action: 'preferences/update', status: 'failed', observedAt: 10 },
    { capability: 'settings', source: 'rpc', action: 'preferences/update', status: 'cancelled', observedAt: 20 },
    { capability: 'storage', source: 'rpc', action: 'storage/status', status: 'completed', observedAt: 30 },
  ] } }
  const summary = diagnosticSummary(report, 9_000_000)
  const failure = summary.findings.find(x => x.code === 'recent-failure')
  assert.equal(failure.evidence[0].action, 'preferences/update')
  assert.equal(failure.evidence[0].observedAt, 10)
  assert.equal(failure.next, 'reproduce')
  assert.ok(summary.findings.some(x => x.code === 'evidence-truncated'))
  const row = capabilityCoverage({ account: {}, preference: {}, checks: [], operations: report.operations, now: 100 }).find(x => x.id === 'settings')
  assert.equal(row.latest.status, 'cancelled')
  assert.equal(row.unresolved.length, 1)
  report.operations.events.push({ capability: 'settings', source: 'rpc', action: 'preferences/update', status: 'completed', observedAt: 40 })
  assert.equal(diagnosticSummary(report).findings.some(x => x.code === 'recent-failure'), false)
})

test('summary distinguishes missing collection, unsupported capabilities, failure and recovery', () => {
  assert.ok(diagnosticSummary({}).findings.some(x => x.code === 'collection-incomplete'))
  const report = { inspection: { checks: [], capabilities: [] }, catalog: { unsupported: [{ model: 'gpt-test' }] }, operations: { events: [
    { source: 'rpc', action: 'preferences/update', status: 'failed', observedAt: 1 },
    { source: 'rpc', action: 'preferences/update', status: 'completed', observedAt: 2 },
  ] } }
  assert.deepEqual(diagnosticSummary(report, 3).findings.map(x => x.code), ['catalog-gap'])
  report.operations.events.pop()
  assert.ok(diagnosticSummary(report, 3).findings.some(x => x.code === 'recent-failure'))
  assert.equal(diagnosticSummary(report, 1_000_000).findings.some(x => x.code === 'recent-failure'), false)
})

test('network evidence is available without claiming full execution or plugin identity', () => {
  const rows = capabilityCoverage({ account: {}, preference: {}, checks: [], now: 10,
    history: { events: [{ area: 'quota', status: 'ok', observedAt: 9 }] } })
  assert.equal(rows.find(x => x.id === 'quota').latest.source, 'network')
  assert.equal(rows.find(x => x.id === 'transport').execution, 'observed')
  assert.equal(rows.find(x => x.id === 'quota').readiness, 'unknown')
  const slots = projectHostSlots({ snapshot: name => [{ type: 'slot', name, occupants: [{ registrant: 'cf', active: true }] }] })
  assert.equal(slots[0].occupants[0].identity, 'unverified-host-label')
  assert.equal(slots[0].occupants[0].owner, undefined)
})

test('account switch never combines old token with the new account header', async () => {
  let calls = 0
  const value = await readSubscriptionCredentials(async () => ({ auth: { apiKey: ++calls === 1 ? 'A' : 'B' } }), async () => ({ type: 'oauth', access: 'B', accountId: 'account-B' }))
  assert.deepEqual(value, { access: 'B', accountId: 'account-B' })
  const unstable = await readSubscriptionCredentials(async () => ({ auth: { apiKey: 'A' } }), async () => ({ type: 'oauth', access: 'B', accountId: 'account-B' }))
  assert.equal(unstable.access, undefined)
})

test('committed account removal survives cache failure and invalidates remaining services', async () => {
  const seen = []
  const rpc = createSubscriptionRpcHandler({
    authHandler: async () => ({ ok: true, value: { authenticated: false } }),
    usageReader: { clearScope: async () => { throw Error('disk') }, clearCache: () => seen.push('memory') },
    resetCreditService: { clear: () => seen.push('reset') },
    modelCatalog: { clear: () => seen.push('catalog'), refresh: async () => {} },
    onAccountChanged: () => seen.push('changed'), onCleanupFailure: () => seen.push('cleanup-failed'),
  })
  assert.equal((await rpc('account/remove', { id: 'private' }, new AbortController().signal)).ok, true)
  assert.deepEqual(seen, ['memory', 'reset', 'catalog', 'changed', 'cleanup-failed'])
})

test('operation recording preserves failures and recovery without inputs or outputs', async () => {
  const store = createDiagnosticOperations({ now: () => 100 })
  const rpc = store.wrap(async () => ({ ok: true, value: 'private' }))
  store.record('preferences/update', 'failed')
  await rpc('preferences/update', { password: 'private' })
  store.tool({ name: 'unknown-private', arguments: 'private' }, { isError: false })
  assert.deepEqual(store.snapshot().events.map(x => x.status), ['failed', 'completed'])
  assert.doesNotMatch(JSON.stringify(store.snapshot()), /private|password/)
  assert.equal(safeOperations({ events: [{ action: 'private' }] }).events.length, 0)
  const rows = capabilityCoverage({ account: { status: 'signed-in' }, preference: {}, checks: [], operations: store.snapshot(), now: 101 })
  assert.equal(rows.find(x => x.id === 'settings').latest.status, 'completed')
  assert.equal(capabilityCoverage({ account: {}, preference: {}, checks: [], operations: store.snapshot(), now: 1_000_000 }).find(x => x.id === 'settings').execution, 'not-verified')
})

test('host inspection uses official topology, excludes labels and degrades on unsupported hosts', async () => {
  assert.equal(projectHostSlots({}), undefined)
  const slots = { snapshot: name => [{ type: 'slot', name, occupants: [{ registrant: 'dsh-other', active: true, label: 'private' }, { registrant: 'C:/private', active: false }] }] }
  assert.doesNotMatch(JSON.stringify(projectHostSlots(slots)), /private|"label"\s*:/)
  const health = createHostDiagnostics(), stop = health.register(slots)
  assert.equal((await health.collect()).topology.length, 1)
  stop()
  assert.equal((await health.collect()).topology.length, 0)
})

test('disabled capabilities and old evidence do not report working features', () => {
  const rows = capabilityCoverage({ account: { status: 'signed-out' },
    preference: { imageGeneration: false, imageEditing: false, subagentBackend: 'dsh' },
    runtime: { installed: true }, checks: [], operations: { events: [] } })
  assert.equal(rows.find(x => x.id === 'images').readiness, 'not-applicable')
  assert.equal(rows.find(x => x.id === 'subagents').readiness, 'not-applicable')
  assert.equal(rows.find(x => x.id === 'models').blockedBy, 'account')
  assert.ok(rows.every(x => x.execution === 'not-verified'))
})

test('tool cancellation and failure stay distinct and operation history is bounded', async () => {
  const store = createDiagnosticOperations()
  const controller = new AbortController(); controller.abort()
  store.tool({ name: 'codex_sketch', signal: controller.signal }, { isError: false })
  store.tool({ name: 'codex_image_generate' }, { isError: true, content: 'private' })
  assert.deepEqual(store.snapshot().events.map(x => x.status), ['cancelled', 'failed'])
  for (let i = 0; i < 40; i++) store.record('preferences/update', 'completed')
  assert.equal(store.snapshot().events.length, 32)
  assert.equal(store.snapshot().dropped, 10)
})

test('a failing host scope does not hide other scopes or an unsupported host', async () => {
  const health = createHostDiagnostics()
  health.register({ snapshot: () => { throw Error('private') } })
  health.register({ snapshot: () => [] })
  health.register({})
  const report = await health.collect()
  assert.equal(report.topology.length, 1)
  assert.deepEqual(report.checks.map(x => x.status), ['unknown', 'pass', 'unknown'])
  assert.equal(report.checks[0].reason, 'inspection-failed')
  assert.doesNotMatch(JSON.stringify(report), /private/)
})
