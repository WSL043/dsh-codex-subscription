import test from 'node:test'
import assert from 'node:assert/strict'
import { smoothStrokePoints, snapLine } from '../src/sketch-input.js'

test('completed-stroke smoothing preserves endpoints and reduces interior jitter without mutation', () => {
  const points=Array.from({length:100},(_,i)=>({x:i/100,y:.5+(i%2?.01:-.01)}))
  const before=structuredClone(points),result=smoothStrokePoints(points,75)
  assert.deepEqual(result[0],points[0]);assert.deepEqual(result.at(-1),points.at(-1))
  assert.deepEqual(points,before)
  assert.ok(result.slice(5,-5).reduce((n,p)=>n+Math.abs(p.y-.5),0)<.3)
})

test('disabled smoothing retains the exact raw path, including short strokes', () => {
  const points=[{x:0,y:0},{x:.1,y:.8},{x:1,y:1}]
  assert.equal(smoothStrokePoints(points,0),points)
  assert.equal(smoothStrokePoints(points.slice(0,1),75).length,1)
})

test('straight line snapping uses pixel geometry', () => {
  const point = snapLine({x:0,y:0},{x:100,y:8})
  assert.equal(point.y,0)
  const diagonal = snapLine({x:10,y:20},{x:110,y:100})
  assert.ok(Math.abs((diagonal.x-10)-(diagonal.y-20)) < .00001)
})
