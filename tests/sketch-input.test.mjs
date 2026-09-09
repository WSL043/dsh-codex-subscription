import test from 'node:test'
import assert from 'node:assert/strict'
import { createStrokeFilter, snapLine } from '../src/sketch-input.js'

test('stabilization preserves raw input when disabled and reduces stationary jitter', () => {
  const raw = createStrokeFilter(0), smooth = createStrokeFilter(75)
  let rawError = 0, filteredError = 0
  for (let i = 0; i < 120; i++) {
    const point = { x: .5 + (i % 2 ? .002 : -.002), y: .5 }
    assert.deepEqual(raw(point, i * 8), point)
    const filtered = smooth(point, i * 8)
    if (i > 10) {rawError += Math.abs(point.x-.5);filteredError += Math.abs(filtered.x-.5)}
  }
  assert.ok(filteredError < rawError / 2)
})

test('adaptive filter follows sustained fast motion rather than freezing the stroke', () => {
  const filter = createStrokeFilter(75)
  let point
  for (let i = 0; i <= 60; i++) point = filter({x:i/60,y:.5}, i*8)
  assert.ok(point.x > .94 && point.x <= 1)
  assert.equal(point.y,.5)
})

test('straight line snapping uses pixel geometry', () => {
  const point = snapLine({x:0,y:0},{x:100,y:8})
  assert.equal(point.y,0)
  const diagonal = snapLine({x:10,y:20},{x:110,y:100})
  assert.ok(Math.abs((diagonal.x-10)-(diagonal.y-20)) < .00001)
})
