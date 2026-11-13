import assert from 'node:assert/strict'
import test from 'node:test'
import { compactDiagnostic } from '../src/diagnostic-compact.js'
import { createDiagnosticEvents } from '../src/diagnostic-events.js'

test('support report retains per-operation failures and recovery even after unrelated success', () => {
  const report = compactDiagnostic({
    version: '3.2.14', runtime: { dsh: '0.2.2-rc.3', platform: 'win32', arch: 'x64' },
    configuration: { connectionMode: 'sse', compactionMode: 'dsh', token: 'SECRET' },
    requestHistory: { events: [
      { area: 'model', status: 'failed', observedAt: 1, stage: 'request', attemptId: 'private-id', fetchPath: 'dedicated-proxy', route: 'model-proxy', httpStatus: 400, failure: 'context-overflow' },
      { area: 'model', status: 'ok', observedAt: 2, fetchPath: 'host-fetch', checkpointInPayload: true },
      { area: 'quota', status: 'ok', observedAt: 3 },
    ] },
    operations: { events: [{ source: 'rpc', action: 'remote/pair', status: 'failed', code: 'unavailable', observedAt: 4 }] },
    log: { entries: [{ message: 'SECRET' }] },
    streamFailure: { request: { content: 'SECRET' } },
  })
  assert.equal(report.plugin, '3.2.14')
  assert.equal(report.dsh, '0.2.2-rc.3')
  assert.deepEqual(report.network.map(({ area, status, fetchPath }) => [area, status, fetchPath]), [
    ['model', 'failed', 'dedicated-proxy'], ['model', 'ok', 'host-fetch'], ['quota', 'ok', undefined],
  ])
  assert.equal(report.network[0].httpStatus, 400)
  assert.equal(report.network[1].checkpointInPayload, true)
  assert.equal(report.operations[0].code, 'unavailable')
  assert.doesNotMatch(JSON.stringify(report), /SECRET|private-id/)
})

test('client-only diagnostics keeps the client version and collection failure', () => {
  const report = compactDiagnostic({ pluginVersion: '3.2.14', serverDiagnostics: 'unavailable', error: 'timeout' })
  assert.equal(report.plugin, '3.2.14')
  assert.equal(report.serverDiagnostics, 'unavailable')
  assert.equal(report.error, 'timeout')
  assert.equal(report.network, undefined)
})

test('quota polling cannot erase the last stream failure, and its exported alias is report-local', () => {
  const attemptId = '12345678-abcd-4321-abcd-123456789abc'
  const events = createDiagnosticEvents()
  events.record('model', { status: 'failed', attemptId, stage: 'stream', contentDelivered: true })
  events.record('oauth', { status: 'failed', httpStatus: 401 })
  for (let index = 0; index < 50; index++) events.record('quota', { status: 'ok' })
  const requestHistory = events.snapshot()
  assert.equal(requestHistory.events.length, 34)
  const report = compactDiagnostic({ requestHistory, streamFailure: { attemptId, request: { content: 'private' } },
    compaction: { requests: 1, checkpointsSaved: 0, checkpointsReused: 0 } })
  assert.equal(report.network.find(event => event.area === 'model').attempt, 'op1')
  assert.equal(report.network.find(event => event.area === 'oauth').httpStatus, 401)
  assert.deepEqual(report.lastModelStreamFailure, { attempt: 'op1' })
  assert.equal(report.pluginCompaction.requests, 1)
  assert.doesNotMatch(JSON.stringify(report), /12345678|private/)
})
