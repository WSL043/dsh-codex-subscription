import assert from 'node:assert/strict'
import test from 'node:test'
import { createClientIncidentDiagnostics } from '../src/client-incident-diagnostics.js'
import { createHostDiagnostics } from '../src/diagnostic-host.js'
import { compactDiagnostic } from '../src/diagnostic-compact.js'
import { CHANNEL, createSubscriptionRpcClient } from '../src/rpc-contract.js'

test('the exported report preserves a rejected operation, a stalled request and later success', async () => {
  let clock = 10, respond
  const observer = createClientIncidentDiagnostics(() => clock)
  const host = createHostDiagnostics(observer)
  const report = async () => compactDiagnostic({ client: await host.collect() }).clientIncidents
  const client = createSubscriptionRpcClient({ call: () => new Promise(resolve => { respond = resolve }) }, observer)
  const request = (endpoint, signal) => client.call(CHANNEL, endpoint, { text: 'SECRET' }, signal)
  const first = request('preferences/update')
  clock = 30
  assert.deepEqual((await report()).inFlight, [{ endpoint: 'preferences/update', ageMs: 20 }])
  respond({ ok: false, error: { code: 'invalid-input', message: 'SECRET' } })
  await first
  const next = request('preferences/update')
  respond({ ok: true }); await next
  for (let n = 0; n < 40; n++) { const poll = request('usage'); respond({ ok: true }); await poll }
  assert.deepEqual((await report()).rpcFailures, [{ endpoint: 'preferences/update', kind: 'rpc-rejected',
    at: 30, durationMs: 20, code: 'invalid-input', nextSuccessAt: 30 }])
  const controller = new AbortController()
  const waiting = request('voice/status', controller.signal)
  controller.abort(Object.assign(Error('SECRET'), { code: 'timeout' }))
  assert.equal((await report()).rpcFailures.at(-1).kind, 'timeout')
  respond({ ok: true }); await waiting
  assert.equal((await report()).inFlight, undefined)
  const failure = Error('SECRET')
  await assert.rejects(observer.observeRpc('remote/pair', () => { throw failure }), e => e === failure)
  const cancelled = new AbortController()
  const stopped = request('sketch/poll', cancelled.signal)
  cancelled.abort(); respond({ ok: false }); await stopped
  const value = await report()
  assert.equal(value.rpcFailures.at(-1).kind, 'transport-threw')
  assert.doesNotMatch(JSON.stringify(value), /SECRET|sketch\/poll/)
})
