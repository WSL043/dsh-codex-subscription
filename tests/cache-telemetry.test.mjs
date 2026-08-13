import assert from 'node:assert/strict'
import test from 'node:test'

import { CodexCacheTelemetry, prefixFingerprint } from '../src/cache-telemetry.js'

const request = (overrides = {}) => ({
  provider: 'openai-codex',
  model: 'gpt-5.6-sol',
  sessionId: 'session-a',
  system: 'Stable system prompt',
  tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object' } }],
  ...overrides,
})

test('prefix fingerprint ignores conversation growth but changes for model-visible prefix changes', () => {
  const base = request({ messages: [{ role: 'user', content: [{ type: 'text', text: 'first' }] }] })
  const nextTurn = request({ messages: [{ role: 'user', content: [{ type: 'text', text: 'second' }] }] })
  assert.equal(prefixFingerprint(base), prefixFingerprint(nextTurn))
  assert.notEqual(prefixFingerprint(base), prefixFingerprint(request({ system: 'Changed system prompt' })))
  assert.notEqual(prefixFingerprint(base), prefixFingerprint(request({ tools: [] })))
})

test('telemetry separates server token-cache hits from websocket continuation reuse', () => {
  const telemetry = new CodexCacheTelemetry({ now: () => 1234 })
  telemetry.begin(request())
  telemetry.finish(request(), {
    inputTokens: 100,
    cacheReadTokens: 900,
    cacheWriteTokens: 0,
    outputTokens: 50,
  }, {
    requests: 2,
    connectionsCreated: 1,
    connectionsReused: 1,
    cachedContextRequests: 2,
    fullContextRequests: 1,
    deltaRequests: 1,
    websocketFailures: 0,
    sseFallbacks: 0,
  })
  const view = telemetry.snapshot()
  assert.equal(view.serverCache.hitPercent, 90)
  assert.equal(view.transport.deltaPercent, 50)
  assert.equal(view.prefix.changes, 0)
  assert.equal(view.requests, 1)
  assert.doesNotMatch(JSON.stringify(view), /session-a|Stable system prompt|read_file/)
})

test('telemetry reports prefix churn without returning hashes or prompt content', () => {
  const telemetry = new CodexCacheTelemetry({ now: () => 1234 })
  telemetry.begin(request())
  telemetry.begin(request({ system: 'sensitive-prefix-text' }))
  const view = telemetry.snapshot()
  assert.equal(view.prefix.changes, 1)
  assert.equal(view.prefix.state, 'changed')
  assert.equal(view.prefix.lastChangedComponent, 'system')
  assert.doesNotMatch(JSON.stringify(view), /sensitive-prefix-text|[a-f0-9]{64}/i)
})

test('telemetry bounds per-session fingerprints for long-running hosts', () => {
  const telemetry = new CodexCacheTelemetry({ now: () => 1234, maxSessions: 2 })
  telemetry.begin(request({ sessionId: 'session-a' }))
  telemetry.begin(request({ sessionId: 'session-b' }))
  telemetry.begin(request({ sessionId: 'session-c' }))

  const view = telemetry.snapshot()
  assert.equal(view.trackedSessions, 2)
  assert.equal(view.sessionCapacity, 2)
  assert.equal(view.evictedSessions, 1)
  assert.doesNotMatch(JSON.stringify(view), /session-a|session-b|session-c/)
})
