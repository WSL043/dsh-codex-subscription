import test from 'node:test'
import assert from 'node:assert/strict'
import { updateSketchGesture } from '../src/sketch-gesture.js'
import { MAX_STROKE_POINTS } from '../src/sketch-document.js'

const rect = { left: 0, top: 0, width: 1000, height: 500 }
const document = (shape = 'pen') => ({ width: 1000, height: 500, layers: [{ id: 'layer', strokes: [{ id: 'stroke', shape, width: 4, points: [{ x: .1, y: .2 }] }] }] })
const trace = Array.from({ length: 480 }, (_, i) => ({ clientX: 100 + i, clientY: 100 + Math.sin(i / 20) * 40 }))
const points = doc => doc.layers[0].strokes[0].points

test('coalesced and individual pointer samples preserve the same unsmoothed trajectory', () => {
  const batched = document(), individual = document()
  updateSketchGesture(batched, { layer: 'layer' }, trace, rect, 4)
  const gesture = { layer: 'layer' }
  for (const sample of trace) updateSketchGesture(individual, gesture, [sample], rect, 4)
  assert.deepEqual(points(batched), points(individual))
  assert.deepEqual(points(batched).at(-1), { x: trace.at(-1).clientX / 1000, y: trace.at(-1).clientY / 500 })
  assert.equal(points(batched)[20].y, trace[20].clientY / 500)
})

test('Shift constrains a line in pixels on a non-square canvas', () => {
  const doc = document('line')
  updateSketchGesture(doc, { layer: 'layer' }, [{ clientX: 200, clientY: 180 }], rect, 4, true)
  const [a, b] = points(doc)
  assert.ok(Math.abs((b.x - a.x) * 1000 - (b.y - a.y) * 500) < 1e-8)
})

test('moving a selected object always uses its original geometry without accumulated drift', () => {
  const original = document('line')
  const object = structuredClone(original.layers[0].strokes[0])
  const gesture = { layer: 'layer', object, start: { x: .1, y: .2 } }
  const first = updateSketchGesture(original, gesture, [{ clientX: 200, clientY: 150 }], rect, 4)
  const second = updateSketchGesture(first, gesture, [{ clientX: 300, clientY: 200 }], rect, 4)
  assert.ok(Math.abs(points(second)[0].x - .3) < 1e-8)
  assert.ok(Math.abs(points(second)[0].y - .4) < 1e-8)
  assert.deepEqual(points(original), [{ x: .1, y: .2 }])
})

test('stroke eraser hits between events while pixel eraser records its own path', () => {
  const doc = document('line')
  doc.layers[0].strokes[0].points = [{ x: .5, y: .1 }, { x: .5, y: .9 }]
  updateSketchGesture(doc, { layer: 'layer', eraseStroke: true, last: { x: .1, y: .5 } }, [{ clientX: 900, clientY: 250 }], rect, 12)
  assert.equal(doc.layers[0].strokes.length, 0)
  const pixel = document('eraser')
  updateSketchGesture(pixel, { layer: 'layer' }, trace, rect, 12)
  assert.equal(pixel.layers[0].strokes[0].shape, 'eraser')
  assert.ok(points(pixel).length > 400)
})

test('long strokes remain bounded and retain their final point', () => {
  const doc = document()
  const samples = Array.from({ length: MAX_STROKE_POINTS * 5 }, (_, i) => ({ clientX: 100 + i % 800, clientY: 100 + i % 300 }))
  updateSketchGesture(doc, { layer: 'layer' }, samples, rect, 4)
  assert.ok(points(doc).length <= MAX_STROKE_POINTS)
  assert.deepEqual(points(doc).at(-1), { x: samples.at(-1).clientX / 1000, y: samples.at(-1).clientY / 500 })
})
