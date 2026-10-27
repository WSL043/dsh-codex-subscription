import assert from 'node:assert/strict'
import test from 'node:test'
import { createClientFeature, createFeatureReadiness } from '../src/client-feature.js'

test('unused features do no work, concurrent first use shares arrival, and completed use is memoized', async () => {
  let calls = 0, finish
  const feature = createClientFeature(() => { calls++; return new Promise(resolve => { finish = resolve }) })
  assert.equal(calls, 0)
  const first = feature.load(), second = feature.load()
  assert.equal(first, second)
  await Promise.resolve()
  assert.equal(calls, 1)
  const module = { value: 'synthetic' }
  finish(module)
  assert.equal(await first, module)
  assert.equal(await feature.load(), module)
  assert.equal(calls, 1)
})

test('failed imports can be retried and released subscribers see no later notifications', async () => {
  let calls = 0, notices = 0
  const feature = createClientFeature(() => { if (++calls === 1) throw Error('synthetic arrival failure'); return { ok: true } })
  const release = feature.subscribe(() => notices++)
  await assert.rejects(feature.load(), /arrival failure/)
  assert.equal(feature.getSnapshot().status, 'error')
  release()
  const before = notices
  assert.deepEqual(await feature.load(), { ok: true })
  assert.equal(feature.getSnapshot().status, 'ready')
  assert.equal(notices, before)
})

test('editor readiness waits for restoration and rejects pending commands on session disposal', async () => {
  const readiness = createFeatureReadiness()
  const first = readiness.wait(), second = readiness.wait()
  const api = { execute() {} }
  readiness.set(api)
  assert.equal(await first, api)
  assert.equal(await second, api)
  readiness.set(undefined)
  const pending = readiness.wait()
  readiness.cancel(Error('session disposed'))
  await assert.rejects(pending, /session disposed/)
})

test('failed restoration cannot leave a deferred Agent command waiting forever', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const readiness = createFeatureReadiness()
  const rejected = assert.rejects(readiness.wait(100), /not ready/)
  t.mock.timers.tick(100)
  await rejected
})

test('a known restoration failure rejects immediately and a restored editor can recover', async () => {
  const readiness = createFeatureReadiness()
  readiness.fail(Error('synthetic storage blocked'))
  await assert.rejects(readiness.wait(), /storage blocked/)
  const api = { restored: true }
  readiness.set(api)
  assert.equal(await readiness.wait(), api)
})
