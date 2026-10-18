import assert from 'node:assert/strict'
import test from 'node:test'
import { partialStroke, planReplay, recordReplayState, replayFrame, replaySteps } from '../src/sketch-replay.js'

const layer = strokes => ({ id: 1, name: 'L', visible: true, strokes })
const doc = strokes => ({ width: 1000, height: 1000, active: 1, layers: [layer(strokes)] })
const pen = (id, x) => ({ id, shape: 'pen', color: '#000000', width: 4, opacity: 1, fill: false, brush: 'pen', points: [{ x, y: .1 }, { x, y: .9 }] })
const box = id => ({ id, shape: 'rectangle', color: '#ff0000', width: 2, opacity: 1, fill: true, brush: 'pen', points: [{ x: .1, y: .1 }, { x: .5, y: .5 }] })

test('states are recorded once and capped', () => {
  const states = [], a = doc([]), b = doc([pen('a', .2)])
  recordReplayState(states, a); recordReplayState(states, a); recordReplayState(states, b)
  assert.deepEqual(states, [a, b])
})

test('appended strokes become drawing steps; edits become jumps', () => {
  const p1 = pen('a', .2), p2 = pen('b', .4)
  const s0 = doc([]), s1 = doc([p1]), s2 = doc([p1, p2]), s3 = doc([p2])
  const steps = replaySteps([s0, s1, s2, s3])
  assert.deepEqual(steps.map(step => step.type), ['draw', 'draw', 'jump'])
  assert.equal(steps[1].added[0].stroke, p2)
})

test('a stroke is drawn along its path; a fill is outlined, then painted in from the top', () => {
  const half = partialStroke(pen('a', .5), .5)
  assert.equal(half.points.length, 2)
  assert.ok(Math.abs(half.points[1].y - .5) < 1e-9)
  assert.equal(partialStroke(pen('a', .5), 1).points.length, 2)
  const outlining = partialStroke(box('f'), .15)
  assert.equal(outlining.shape, 'pen')
  assert.equal(outlining.fill, false)
  const painting = partialStroke(box('f'), .65)
  assert.equal(painting.shape, 'rectangle')
  assert.equal(painting.gradient.type, 'linear')
  assert.ok(Math.abs(painting.gradient.stops[1].offset - .5) < 1e-9)
  assert.equal(painting.gradient.stops[2].opacity, 0)
  const outline = partialStroke({ ...box('o'), fill: false }, .3)
  assert.equal(outline.shape, 'pen')
})

test('strokes added together with a new layer are still drawn one after another', () => {
  const p1 = pen('a', .2), p2 = pen('b', .4)
  const before = doc([p1])
  const after = { ...doc([p1]), layers: [layer([p1]), { id: 2, name: 'New', visible: true, strokes: [p2] }] }
  const steps = replaySteps([before, after])
  assert.equal(steps[0].type, 'draw')
  const plan = planReplay(steps, 4000)
  const frame = replayFrame(plan, plan[0].strokes[0].start + 1)
  assert.equal(frame.doc.layers.length, 2)
  assert.equal(frame.moving, 2)
  assert.equal(frame.doc.layers[0].strokes.length, 1)
})

test('the replay plan fills the chosen duration and frames show the strokes drawn so far', () => {
  const p1 = pen('a', .2), p2 = pen('b', .4), p3 = pen('c', .6)
  const steps = replaySteps([doc([]), doc([p1, p2]), doc([p1, p2, p3])])
  const plan = planReplay(steps, 10_000)
  assert.ok(Math.abs(plan.at(-1).end - 10_000) < 1e-6)
  assert.equal(replayFrame(plan, 0).doc.layers[0].strokes[0].opacity, 0)
  const mid = replayFrame(plan, plan[0].strokes[0].end + 1)
  assert.equal(mid.doc.layers[0].strokes.length, 2)
  assert.equal(mid.moving, 1)
  assert.equal(replayFrame(plan, 20_000).doc, steps.at(-1).after)
})
