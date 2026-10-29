import assert from 'node:assert/strict'
import test from 'node:test'
import { compactionThreshold, effectiveContextPercent, effectiveContextWindow } from '../src/context-budget.js'

test('official input headroom defaults safely and accepts only integer percentages in range', () => {
  for (const value of [undefined, null, 0, -1, 101, 95.5, '95', NaN, Infinity]) assert.equal(effectiveContextPercent(value), 95)
  for (const value of [1, 80, 95, 100]) assert.equal(effectiveContextPercent(value), value)
  for (const [raw, effective] of [[500000, 475000], [272000, 258400], [872000, 828400], [128000, 121600]]) {
    assert.equal(effectiveContextWindow(raw), effective)
    assert.equal(effectiveContextWindow(raw, 100), raw)
  }
  assert.equal(effectiveContextWindow(undefined), undefined)
  assert.equal(effectiveContextWindow(272001), 258400)
})

test('cloud pressure matches DSH defaults without deducting percentage or output twice', () => {
  assert.equal(compactionThreshold(475000), 380000)
  assert.equal(compactionThreshold(475000, 128000), 281464)
  assert.equal(compactionThreshold(258400), 192864)
  assert.equal(compactionThreshold(121600), 56064)
  assert.equal(compactionThreshold(828400, 128000), 634864)
  assert.equal(compactionThreshold(475000, 0), 380000)
  assert.equal(compactionThreshold(475000, 128000, 300000), 281464, 'an override cannot exceed the pressure budget')
  assert.equal(compactionThreshold(475000, 128000, 2000), 2000)
})

test('unsafe reservations fail before sending; missing model windows keep the existing fallback', () => {
  for (const value of [-1, '128000', NaN, Infinity, 1.5]) {
    assert.throws(() => compactionThreshold(475000, value), /output reservation/)
    assert.throws(() => compactionThreshold(undefined, value), /output reservation/)
  }
  for (const value of [1280, 1999, 65536]) assert.throws(() => compactionThreshold(value), /budget is too small/)
  for (const value of [0, -1, NaN, Infinity, 1.5]) assert.throws(() => compactionThreshold(value), /Invalid Codex context window/)
  for (const value of [410000, 475000, 500000]) assert.throws(() => compactionThreshold(475000, value), /budget is too small/)
  assert.equal(compactionThreshold(undefined), 100000)
  assert.equal(compactionThreshold(undefined, undefined, 2000), 2000)
  assert.throws(() => compactionThreshold(475000, 0, 999), /Invalid compaction threshold/)
})
