import assert from 'node:assert/strict'
import test from 'node:test'
import { installCompactionPressure } from '../src/compaction-pressure.js'

const measurement = { totalTokens: 300_000, nodes: [{ seq: 1, heuristicTokens: 1 }] }
const session = { requestHeader: () => ({ config: { provider: 'openai-codex', model: 'm' } }) }

test('the meter reports the effective size while the adjustment applies, and is restored afterwards', () => {
  const meter = { measure() { return measurement } }
  const original = meter.measure
  const restore = installCompactionPressure({ meter, compaction: { effectivePressure: ({ route }) => route.model === 'm' ? 60_000 : undefined }, contextWindowOf: () => 272_000 })
  const adjusted = meter.measure(session)
  assert.equal(adjusted.totalTokens, 60_000)
  assert.equal(adjusted.nodes, measurement.nodes, 'nodes stay as the meter had them')
  assert.equal(measurement.totalTokens, 300_000, 'the original measurement is untouched')
  assert.equal(meter.measure({ requestHeader: () => ({ config: { provider: 'x', model: 'other' } }) }).totalTokens, 300_000)
  restore()
  assert.equal(meter.measure, original)
})

test('a figure that is not smaller, or a failure, leaves the meter result as it was', () => {
  for (const effective of [undefined, NaN, -5, 300_000, 400_000, () => { throw new Error('boom') }]) {
    const meter = { measure() { return measurement } }
    installCompactionPressure({ meter, compaction: { effectivePressure: () => typeof effective === 'function' ? effective() : effective } })
    assert.equal(meter.measure(session), measurement)
  }
})

test('a meter without measure, or no compaction bridge, is left alone', () => {
  assert.equal(typeof installCompactionPressure({ meter: {}, compaction: { effectivePressure() {} } }), 'function')
  const meter = { measure() { return measurement } }
  const original = meter.measure
  installCompactionPressure({ meter, compaction: {} })
  assert.equal(meter.measure, original)
})
