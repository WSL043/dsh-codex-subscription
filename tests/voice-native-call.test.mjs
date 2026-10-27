import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeVoiceEligible, openNativeVoiceCall } from '../src/voice-native-call.js'
import { createSubscriptionRpcHandler } from '../src/subscription-rpc.js'
import { registerSubscriptionTransport } from '../src/subscription-transport.js'

test('only a local native desktop can select host audio', () => {
  const local = { isSecureContext: true, __dshWebRtcFallback: true, location: { hostname: 'localhost' } }
  assert.equal(nativeVoiceEligible(local), true)
  assert.equal(nativeVoiceEligible({ ...local, __dshWebRtcFallback: false }), false)
  assert.equal(nativeVoiceEligible({ ...local, __dshWebRtcFallback: false, dshDesktop: { protocolVersion: 1 } }), true)
  assert.equal(nativeVoiceEligible({ ...local, location: { hostname: 'remote.example' } }), false)
  assert.equal(nativeVoiceEligible({ ...local, isSecureContext: false }), false)
  assert.equal(nativeVoiceEligible({ ...local, __dshWebRtcFallback: false, navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 Safari/605.1.15' } }), true)
  assert.equal(nativeVoiceEligible({ ...local, __dshWebRtcFallback: false, navigator: { userAgent: 'Mozilla/5.0 (Windows) AppleWebKit/537.36 Chrome/130.0' } }), false)
})

test('native microphone RPC rejects remote and missing origins before invoking the host', async () => {
  const routes = new Map()
  let calls = 0
  registerSubscriptionTransport({ fetch: { register(route) { routes.set(route.path, route); return () => {} } } }, () => { calls++; return { ok: true } })
  const method = 'codex-subscription/voice/native/start'
  const route = routes.get('/api/' + method)
  const request = (host, origin) => new Request(host + '/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify({ type: 'client-request', rpcId: 'a', method, payload: {} }) })
  for (const [host, origin] of [['http://remote.example', 'http://remote.example'], ['http://localhost', 'https://remote.example'], ['http://localhost', undefined]]) {
    assert.equal((await route.fetch(request(host, origin))).status, 403)
  }
  assert.equal(calls, 0)
  assert.equal((await route.fetch(request('http://localhost', 'http://localhost'))).status, 200)
  assert.equal(calls, 1)
  const internal = new Request('http://dsh.internal/api/' + method, { method: 'POST', headers: {
    'content-type': 'application/json', host: '127.0.0.1:24440', origin: 'http://127.0.0.1:24440',
  }, body: JSON.stringify({ type: 'client-request', rpcId: 'b', method, payload: {} }) })
  const remote = new Request(internal.clone(), { headers: { 'content-type': 'application/json', host: 'remote.example', origin: 'http://127.0.0.1:24440' } })
  assert.equal((await route.fetch(internal)).status, 200, 'DSH virtual routing preserves the original local Host')
  assert.equal(calls, 2)
  assert.equal((await route.fetch(remote)).status, 403)
})

test('native RPC requires enabled calls, capture consent and control ownership', async () => {
  let started = 0, controlled = 0, enabled = false
  const handler = createSubscriptionRpcHandler({ preferences: { status: () => ({ voiceCall: enabled ? 'on' : 'off', voiceVoice: 'maple' }) }, nativeVoice: {
    probe: async () => ({ available: true }),
    start: async params => { started++; assert.equal(params.voice, 'maple'); return { leaseToken: 'owner-owner-owner' } },
    mute: async () => { controlled++; return {} },
  } })
  const invoke = (action, payload) => handler('voice/native/' + action, payload, new AbortController().signal)
  assert.equal((await invoke('probe', {})).value.available, true)
  assert.equal((await invoke('start', { sessionId: 's', captureAllowed: true })).ok, false)
  enabled = true
  assert.equal((await invoke('start', { sessionId: 's' })).ok, false)
  assert.equal(started, 0)
  assert.equal((await invoke('start', { sessionId: 's', captureAllowed: true })).ok, true)
  assert.equal((await invoke('control', { sessionId: 's', action: 'mute', muted: true })).ok, false)
  assert.equal((await invoke('control', { sessionId: 's', leaseToken: 'owner-owner-owner', action: 'mute', muted: 'true' })).ok, false)
  assert.equal(controlled, 0)
})

test('native handle abort stops its lease once and cannot send later controls', async () => {
  const calls = [], abort = new AbortController()
  let ended = 0
  const rpc = { async call(_channel, endpoint, payload) {
    calls.push({ endpoint, payload })
    if (endpoint.endsWith('/start')) return { ok: true, value: { leaseToken: 'owner-owner-owner' } }
    if (endpoint.endsWith('/status')) return { ok: true, value: { active: true, levels: { mic: 0.2, assistant: 0.4 } } }
    return { ok: true, value: {} }
  } }
  await assert.rejects(openNativeVoiceCall({ rpc, sessionId: 's' }), { name: 'NotAllowedError' })
  assert.equal(calls.length, 0)
  const handle = await openNativeVoiceCall({ rpc, sessionId: 's', captureAllowed: true, signal: abort.signal, onEnd: () => { ended++ } })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(handle.levels(), { mic: 0.2, assistant: 0.4 })
  handle.setMuted(true)
  assert.equal(handle.levels().mic, 0)
  abort.abort()
  await handle.stop()
  await new Promise(resolve => setImmediate(resolve))
  handle.setMuted(false)
  assert.equal(calls.filter(call => call.endpoint.endsWith('/stop')).length, 1)
  assert.equal(calls.filter(call => call.endpoint.endsWith('/control')).length, 1)
  assert.equal(ended, 1)
  assert.ok(calls.filter(call => !call.endpoint.endsWith('/start')).every(call => call.payload.leaseToken === 'owner-owner-owner'))
})
