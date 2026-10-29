import test from 'node:test'
import assert from 'node:assert/strict'
import { createModelStreamHealth, safeStreamHealth } from '../src/model-stream-health.js'
import { createDiagnosticLog } from '../src/diagnostic-log.js'

test('whole-response timing is not the per-next timer; no body or session identity reaches diagnostics', () => {
  let time = 0
  const logs = [], health = createModelStreamHealth({ now: () => time, log: (...v) => logs.push(v) })
  const request = health.begin({ sessionId: 'PRIVATE-SESSION', configured: 'websocket-cached', selected: 'sse' })
  time = 100; request.response({ status: 200, headers: { authorization: 'SECRET' } })
  time = 1000; request.providerEvent()
  time = 220000; request.providerEvent(); request.observe({ type: 'text_delta', delta: 'PRIVATE-TEXT' })
  time = 235000; request.finish('failed', { errorMessage: 'Network transport failure (ECONNRESET): PRIVATE-TEXT Bearer SECRET' })
  request.finish('completed')
  assert.deepEqual(health.snapshot(), [{ status: 'failed', configured: 'websocket', selected: 'sse', effective: 'sse',
    durationMs: 235000, eventCount: 2, eventSource: 'provider', outputStarted: true, firstEventMs: 1000, lastEventAgoMs: 15000,
    httpStatus: 200, code: 'ECONNRESET', consecutiveFailures: 1 }])
  assert.match(logs[0][1], /duration_ms=235000/)
  assert.doesNotMatch(JSON.stringify([logs, health.snapshot()]), /PRIVATE|SECRET|Bearer/)
  const diagnostic = createDiagnosticLog()
  diagnostic.log(logs[0][0], 'model-stream', logs[0][1])
  assert.match(diagnostic.snapshot().entries[0].message, /failure=ECONNRESET/, 'safe failure categories must survive credential redaction')
})

test('SSE fallback is observed, repeated failures stay per session, success and stop reset the streak', () => {
  const health = createModelStreamHealth()
  const run = (sessionId, status, response = true) => {
    const r = health.begin({ sessionId, configured: 'websocket-cached', selected: 'websocket-cached' })
    if (response) r.response({ status: 200 })
    r.providerEvent(); r.finish(status, { code: 'ECONNRESET' })
    return health.snapshot().at(-1)
  }
  for (let n = 1; n <= 3; n++) assert.equal(run('one', 'failed').consecutiveFailures, n)
  assert.equal(run('two', 'failed').consecutiveFailures, 1)
  assert.equal(run('one', 'completed').effective, 'sse')
  assert.equal(run('one', 'failed').consecutiveFailures, 1)
  run('one', 'cancelled')
  assert.equal(run('one', 'failed', false).effective, 'websocket')
  assert.equal(health.snapshot().at(-1).consecutiveFailures, 1)
})

test('older SDKs use adapter events; retention and copied diagnostics are bounded and allowlisted', () => {
  const health = createModelStreamHealth()
  for (let n = 0; n < 140; n++) {
    const r = health.begin({ sessionId: String(n), selected: 'websocket-cached' })
    r.observe({ type: 'text_delta', delta: 'secret' }); r.finish('completed')
  }
  assert.equal(health.snapshot().length, 20)
  assert.equal(health.snapshot()[0].effective, 'websocket')
  assert.equal(health.snapshot()[0].eventSource, 'adapter')
  const original = health.snapshot()[0]; original.durationMs = -99
  assert.notEqual(health.snapshot()[0].durationMs, -99)
  assert.deepEqual(safeStreamHealth([{ status: 'failed', effective: 'sse', durationMs: 235000, apiKey: 'secret', request: 'secret', code: 'Bearer secret' }]),
    [{ status: 'failed', effective: 'sse', durationMs: 235000 }])
})
