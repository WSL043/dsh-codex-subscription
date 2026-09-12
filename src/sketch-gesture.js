import {
  SKETCH_SIZE,
  MAX_STROKE_POINTS,
  sketchPoint
} from './sketch-document.js'
import { strokeHit } from './sketch-layers.js'
import { objectBounds, transformObject } from './sketch-objects.js'
import { snapLine } from './sketch-input.js'

// Hot path: no React state, storage, image decoding or canvas layout reads.
// The gesture owns its mutable working layer; history checkpoints are taken before it starts.
export function updateSketchGesture(
  doc,
  gesture,
  samples,
  rect,
  width,
  shiftKey = false
) {
  if (!samples.length) return doc
  if (gesture.object) {
    const point = sketchPoint(
      samples.at(-1).clientX,
      samples.at(-1).clientY,
      rect
    )
    if (!point) return doc
    const box = objectBounds(gesture.object)
    const stroke =
      gesture.handle === 'end'
        ? { ...gesture.object, points: [gesture.object.points[0], point] }
        : gesture.handle === 'size'
          ? transformObject(gesture.object, {
              scaleX:
                Math.max(0.001, point.x - box.x) / Math.max(0.001, box.width),
              scaleY:
                Math.max(0.001, point.y - box.y) / Math.max(0.001, box.height)
            })
          : transformObject(gesture.object, {
              dx: point.x - gesture.start.x,
              dy: point.y - gesture.start.y
            })
    doc = {
      ...doc,
      layers: doc.layers.map((l) =>
        l.id === gesture.layer
          ? {
              ...l,
              strokes: l.strokes.map((s) =>
                s.id === gesture.object.id ? stroke : s
              )
            }
          : l
      )
    }
    return doc
  }
  for (const sample of samples) {
    let point = sketchPoint(sample.clientX, sample.clientY, rect)
    if (!point) continue
    const layer = doc.layers.find((layer) => layer.id === gesture.layer)
    if (!layer) return doc
    if (gesture.eraseStroke) {
      const previous = gesture.last ?? point
      const steps = Math.min(
        256,
        Math.max(
          1,
          Math.ceil(
            (Math.hypot(point.x - previous.x, point.y - previous.y) *
              SKETCH_SIZE) /
              Math.max(2, width / 2)
          )
        )
      )
      layer.strokes = layer.strokes.filter((stroke) => {
        for (let i = 1; i <= steps; i++) {
          const p = {
            x: previous.x + ((point.x - previous.x) * i) / steps,
            y: previous.y + ((point.y - previous.y) * i) / steps
          }
          if (strokeHit(stroke, p, width / 2, doc.width, doc.height))
            return false
        }
        return true
      })
    } else {
      const stroke = layer.strokes.at(-1)
      if (!stroke) return doc
      if (['line', 'arrow', 'rectangle', 'circle'].includes(stroke.shape)) {
        if (stroke.shape === 'line' && shiftKey) {
          const w = doc.width ?? SKETCH_SIZE,
            h = doc.height ?? SKETCH_SIZE,
            a = stroke.points[0]
          const snapped = snapLine(
            { x: a.x * w, y: a.y * h },
            { x: point.x * w, y: point.y * h }
          )
          point = { x: snapped.x / w, y: snapped.y / h }
        }
        stroke.points = [stroke.points[0], point]
      } else {
        const last = stroke.points.at(-1)
        if (Math.hypot(last.x - point.x, last.y - point.y) < 0.0001) continue
        if (stroke.points.length >= MAX_STROKE_POINTS)
          stroke.points = stroke.points.filter((_, i) => i % 2 === 0)
        stroke.points.push(point)
      }
    }
    gesture.last = point
  }
  return doc
}
