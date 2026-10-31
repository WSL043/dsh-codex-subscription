import test from 'node:test'
import assert from 'node:assert/strict'
import { createSubscriptionConnection } from '../src/subscription-connection.js'

function fixture(extra = {}) {
  let time = 0
  const states = new Map(), closed = [], resets = []
  const sdk = {
    stats: key => states.get(key),
    close: key => { assert.ok(key); closed.push(key) },
    reset: key => { assert.ok(key); resets.push(key); states.delete(key) },
  }
  const policy = createSubscriptionConnection({ resolveMode: () => 'websocket', resolveProxy: async () => undefined, sdk, now: () => time, random: () => 0.5, ...extra })
  const options = { sessionId: 'conversation', apiKey: 'PRIVATE_TOKEN' }
  const prepare = (value = options, settings) => policy.prepare(value, settings)
  const fail = async (value = options) => {
    const request = await prepare(value)
    states.set(request.options.sessionId, { requests: 1, connectionsCreated: 1, websocketFailures: 1, sseFallbacks: 1, websocketFallbackActive: true })
    request.finish({ status: 'ok', transports: ['websocket', 'sse'] })
    return request.options.sessionId
  }
  return { policy, states, closed, resets, options, prepare, fail, advance: ms => { time += ms } }
}

test('failure cools down; next real request alone probes, recovers and preserves counters', async () => {
  const f = fixture()
  const key = await f.fail()
  const fallback = await f.prepare()
  assert.equal(fallback.options.transport, 'sse')
  assert.equal(fallback.diagnostic.selectionReason, 'ws-cooldown')
  fallback.finish({ status: 'ok', transports: ['sse'] })
  f.advance(30000)
  assert.equal(f.policy.recoverySnapshot().sessions[0].cooldownMs, 0)
  assert.equal(f.resets.length, 0, 'no background probe')
  const probe = await f.prepare()
  assert.equal(probe.options.sessionId, key, 'stable prompt cache/session identity')
  assert.equal(probe.diagnostic.selectionReason, 'ws-probe')
  assert.deepEqual(f.resets, [key])
  const concurrent = await f.prepare()
  assert.equal(concurrent.options.transport, 'sse')
  assert.equal(concurrent.diagnostic.selectionReason, 'probe-busy')
  concurrent.finish({ status: 'ok', transports: ['sse'] })
  f.states.set(key, { requests: 1, connectionsCreated: 1, websocketFallbackActive: false })
  probe.finish({ status: 'ok', transports: ['websocket'] }); probe.finish({ status: 'ok' })
  const next = await f.prepare()
  assert.equal(next.diagnostic.selectionReason, 'websocket-preferred')
  f.states.set(key, { requests: 2, connectionsCreated: 1, connectionsReused: 1, deltaRequests: 1, websocketFallbackActive: false })
  next.finish({ status: 'ok', transports: ['websocket'] })
  const stats = f.policy.snapshot()
  assert.equal(stats.requests, 3); assert.equal(stats.websocketFailures, 1); assert.equal(stats.sseFallbacks, 1)
  assert.equal(stats.deltaRequests, 1); assert.equal(stats.recoverySuccesses, 1); assert.equal(stats.recoveryAttempts, 1)
  assert.doesNotMatch(JSON.stringify([stats, f.policy.recoverySnapshot()]), /PRIVATE_TOKEN|conversation/)
  f.policy.dispose()
})

test('ongoing requests prevent reset even after the cooldown deadline', async () => {
  const f = fixture(); await f.fail()
  const held = await f.prepare()
  f.advance(30000)
  const deferred = await f.prepare()
  assert.equal(deferred.diagnostic.selectionReason, 'probe-busy')
  assert.equal(f.resets.length, 0)
  deferred.finish({ status: 'ok', transports: ['sse'] })
  held.finish({ status: 'ok', transports: ['sse'] })
  const probe = await f.prepare()
  assert.equal(probe.diagnostic.selectionReason, 'ws-probe')
  probe.finish({ status: 'cancelled' }); f.policy.dispose()
})

test('repeated WS failures extend cooldown; SSE success and cancellation do not report recovery', async () => {
  const f = fixture(); const key = await f.fail()
  f.advance(30000)
  const probe = await f.prepare()
  f.states.set(key, { requests: 1, websocketFailures: 1, sseFallbacks: 1, websocketFallbackActive: true })
  probe.finish({ status: 'ok', transports: ['websocket', 'sse'] })
  assert.equal(f.policy.recoverySnapshot().sessions[0].cooldownMs, 60000)
  assert.equal(f.policy.snapshot().recoverySuccesses, 0)
  f.advance(60000)
  const cancelled = await f.prepare(); cancelled.finish({ status: 'cancelled', transports: ['websocket'] })
  assert.equal(f.policy.snapshot().websocketFailures, 2)
  assert.equal(f.policy.snapshot().recoverySuccesses, 0)
  assert.equal(f.policy.recoverySnapshot().sessions[0].cooldownMs, 60000)
  f.policy.dispose()
})

test('recovery is single-flight across sessions on the same account and route, not across accounts', async () => {
  const f = fixture()
  const second = { ...f.options, sessionId: 'second' }, other = { ...f.options, sessionId: 'other', apiKey: 'OTHER' }
  await f.fail(); await f.fail(second); await f.fail(other); f.advance(30000)
  const a = await f.prepare(), b = await f.prepare(second), c = await f.prepare(other)
  assert.equal(a.diagnostic.selectionReason, 'ws-probe')
  assert.equal(b.diagnostic.selectionReason, 'probe-busy')
  assert.equal(c.diagnostic.selectionReason, 'ws-probe')
  for (const request of [a,b,c]) request.finish({ status: 'cancelled' })
  f.policy.dispose()
})

test('configured/forced SSE, missing sessions and no-cache calls never claim probes', async () => {
  let mode = 'websocket'
  const f = fixture({ resolveMode: () => mode }); await f.fail(); f.advance(30000)
  for (const [options, settings, reason] of [[f.options, { allowWebSocket: false }, 'forced-sse'], [{ apiKey: 'a' }, {}, 'no-session'], [{ ...f.options, cacheRetention: 'none' }, {}, 'no-session']]) {
    const request = await f.prepare(options, settings)
    assert.equal(request.options.transport, 'sse'); assert.equal(request.diagnostic.selectionReason, reason)
  }
  mode = 'sse'; assert.equal((await f.prepare()).diagnostic.selectionReason, 'configured-sse')
  assert.equal(f.resets.length, 0); f.policy.dispose()
})

test('endpoint isolation and bounded LRU never evict an active scope', async () => {
  const f = fixture({ maxSessions: 2 })
  const a = await f.prepare(f.options, { model: { baseUrl: 'https://chatgpt.com/one' } })
  f.advance(1)
  const b = await f.prepare(f.options, { model: { baseUrl: 'https://chatgpt.com/two' } })
  assert.notEqual(a.options.sessionId, b.options.sessionId)
  const blocked = await f.prepare({ ...f.options, sessionId: 'third' })
  assert.equal(blocked.diagnostic.selectionReason, 'capacity'); assert.equal(f.closed.length, 0)
  a.finish({ status: 'ok' })
  const c = await f.prepare({ ...f.options, sessionId: 'third' })
  assert.deepEqual(f.closed, [a.options.sessionId])
  assert.equal(f.policy.recoverySnapshot().sessions.length, 2)
  b.finish({ status: 'ok' }); c.finish({ status: 'ok' }); f.policy.dispose()
})

test('account cleanup rejects pending preparation and defers stats reset until old producer settles', async () => {
  let release
  const waiting = new Promise(resolve => { release = resolve })
  const f = fixture({ resolveProxy: () => waiting })
  const pending = f.prepare(); f.policy.dispose(); release(undefined)
  await assert.rejects(pending, { name: 'AbortError' })
  const active = await f.prepare()
  const key = active.options.sessionId
  f.policy.dispose()
  assert.deepEqual(f.closed, [key]); assert.equal(f.resets.length, 0)
  f.states.set(key, { requests: 1, websocketFailures: 1, websocketFallbackActive: true })
  active.finish({ status: 'cancelled' })
  assert.deepEqual(f.resets, [key]); assert.equal(f.policy.snapshot().requests, 1)
  assert.equal(f.policy.recoverySnapshot().sessions.length, 0)
})

test('jitter remains bounded and repeated failures never exceed the hard cooldown cap', async () => {
  const f = fixture({ random: () => 0.75 })
  const key = await f.fail()
  let expected = 33000
  assert.equal(f.policy.recoverySnapshot().sessions[0].cooldownMs, expected)
  for (let i = 0; i < 7; i++) {
    f.advance(expected)
    const probe = await f.prepare()
    assert.equal(probe.diagnostic.selectionReason, 'ws-probe')
    f.states.set(key, { requests: 1, websocketFailures: 1, websocketFallbackActive: true })
    probe.finish({ status: 'failed', transports: ['websocket'] })
    expected = Math.min(300000, expected * 2)
    assert.equal(f.policy.recoverySnapshot().sessions[0].cooldownMs, expected)
  }
  assert.equal(f.policy.snapshot().websocketFailures, 8)
  f.policy.dispose()
})

test('idle policy eviction is lazy, preserves totals and never evicts a live producer', async () => {
  const f = fixture({ idleMs: 100 })
  const held = await f.prepare()
  f.states.set(held.options.sessionId, { requests: 2 })
  f.advance(101)
  const next = await f.prepare({ ...f.options, sessionId: 'another' })
  assert.equal(f.closed.length, 0)
  held.finish({ status: 'ok', transports: ['websocket'] })
  f.advance(101)
  const third = await f.prepare({ ...f.options, sessionId: 'third' })
  assert.deepEqual(f.closed, [held.options.sessionId])
  assert.equal(f.policy.snapshot().requests, 2)
  next.finish({ status: 'ok' }); third.finish({ status: 'ok' }); f.policy.dispose()
})
