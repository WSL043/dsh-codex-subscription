import { flattenSketchCurve } from './sketch-curves.js'

// Replays how a drawing came to be. The board keeps every earlier state of the document (they share their strokes), so the
// replay needs no extra recording: strokes that appear between two states are drawn one after another, like a hand would,
// and anything else (an edit, a deletion, an undo) just snaps to the new state.
export const MAX_REPLAY_STATES = 2000

export function recordReplayState(states, doc) {
  if (states.at(-1) === doc) return
  states.push(doc)
  if (states.length > MAX_REPLAY_STATES) states.splice(0, states.length - MAX_REPLAY_STATES)
}

// Strokes that were only added since `before` (layers may be new too), in painting order; undefined when anything else changed.
function appendedStrokes(before, after) {
  for (const layer of before.layers) {
    const next = after.layers.find(item => item.id === layer.id)
    if (!next || next.image !== layer.image || layer.strokes.length > next.strokes.length || layer.strokes.some((stroke, i) => stroke !== next.strokes[i])) return undefined
  }
  const added = []
  for (const layer of after.layers) {
    const old = before.layers.find(item => item.id === layer.id)?.strokes.length ?? 0
    for (let i = old; i < layer.strokes.length; i++) added.push({ layer: layer.id, stroke: layer.strokes[i] })
  }
  return added
}

// Steps between consecutive states: either strokes appended to layers (animated) or a jump to the new state.
export function replaySteps(states) {
  const steps = []
  for (let index = 1; index < states.length; index++) {
    const before = states[index - 1], after = states[index]
    if (before === after) continue
    const added = appendedStrokes(before, after)
    steps.push(added?.length ? { type: 'draw', before, after, added } : { type: 'jump', before, after, added: [] })
  }
  return steps
}

const lengthOf = (stroke, width, height) => {
  const points = stroke.points
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot((points[i].x - points[i - 1].x) * width, (points[i].y - points[i - 1].y) * height)
  return total
}

const OUTLINE_SHARE = 0.3

// The path a stroke follows when it is drawn, as normalised points; undefined when it simply fades in.
export function strokePath(stroke) {
  const [first, last] = [stroke.points[0], stroke.points.at(-1)]
  if (!first || stroke.shape === 'text' || stroke.shape === 'eraser') return undefined
  switch (stroke.shape) {
    case 'line': case 'arrow': return [first, last]
    case 'bezier': return flattenSketchCurve(stroke, 1024, 1024)
    case 'polygon': return [...stroke.points, first]
    case 'rectangle': return [first, { x: last.x, y: first.y }, last, { x: first.x, y: last.y }, first]
    case 'circle': {
      const cx = (first.x + last.x) / 2, cy = (first.y + last.y) / 2, rx = Math.abs(last.x - first.x) / 2, ry = Math.abs(last.y - first.y) / 2
      return Array.from({ length: 49 }, (_, i) => ({ x: cx + rx * Math.cos(i / 48 * Math.PI * 2), y: cy + ry * Math.sin(i / 48 * Math.PI * 2) }))
    }
    default: return stroke.points
  }
}

// The stroke as it looks when `fraction` (0–1) of it has been drawn. A filled shape is first outlined, then painted in from top to bottom.
export function partialStroke(stroke, fraction) {
  if (fraction >= 1) return stroke
  if (!(fraction > 0)) return { ...stroke, opacity: 0 }
  const filled = stroke.fill && stroke.shape !== 'pen'
  if (filled && !stroke.gradient && fraction >= OUTLINE_SHARE && stroke.shape !== 'text') {
    const reveal = (fraction - OUTLINE_SHARE) / (1 - OUTLINE_SHARE)
    const stops = [{ offset: 0, color: stroke.color }, { offset: reveal, color: stroke.color }, { offset: Math.min(1, reveal + 0.002), color: stroke.color, opacity: 0 }, { offset: 1, color: stroke.color, opacity: 0 }]
    return { ...stroke, gradient: { type: 'linear', x1: 0, y1: 0, x2: 0, y2: 1, stops } }
  }
  const path = strokePath(stroke)
  if (!path || path.length < 2) return { ...stroke, opacity: (stroke.opacity ?? 1) * Math.max(0, fraction) }
  const share = filled ? fraction / OUTLINE_SHARE : fraction
  const lengths = path.slice(1).map((point, i) => Math.hypot(point.x - path[i].x, point.y - path[i].y))
  const total = lengths.reduce((sum, value) => sum + value, 0)
  let remaining = total * Math.max(0, share)
  const points = [path[0]]
  for (let i = 0; i < lengths.length; i++) {
    if (remaining >= lengths[i]) { points.push(path[i + 1]); remaining -= lengths[i]; continue }
    const part = lengths[i] ? remaining / lengths[i] : 0
    points.push({ x: path[i].x + (path[i + 1].x - path[i].x) * part, y: path[i].y + (path[i + 1].y - path[i].y) * part })
    break
  }
  if (points.length < 2) return { ...stroke, opacity: 0 }
  const { gradient, blur, ...rest } = stroke
  return filled
    ? { ...rest, shape: 'pen', fill: false, width: Math.max(2, Math.min(3, stroke.width ?? 2)), opacity: 0.85, points }
    : { ...rest, shape: 'pen', fill: false, points, ...(blur ? { blur } : {}) }
}

// Time each stroke takes, as a share of the whole replay: long strokes take longer, tiny ones are quick.
export function strokeWeight(stroke, width = 1024, height = 1024) {
  if (stroke.fill && stroke.shape !== 'pen') return 2.2
  return 0.6 + Math.min(4, Math.sqrt(lengthOf(stroke, width, height)) / 8)
}

// Lays the replay out on a timeline of `duration` milliseconds. Jumps take a moment to register.
export function planReplay(steps, duration, width = 1024, height = 1024) {
  const items = steps.map(step => ({ step, weight: step.type === 'jump' ? 6 : step.added.reduce((sum, item) => sum + strokeWeight(item.stroke, width, height), 0) + 6 }))
  const total = items.reduce((sum, item) => sum + item.weight, 0) || 1
  let at = 0
  return items.map(({ step, weight }) => {
    const span = duration * weight / total
    const gaps = Math.min(span * 0.12, 500), drawing = span - gaps
    const drawWeight = step.added.reduce((sum, item) => sum + strokeWeight(item.stroke, width, height), 0) || 1
    let cursor = at
    const strokes = step.added.map(item => {
      const own = drawing * strokeWeight(item.stroke, width, height) / drawWeight
      const entry = { ...item, start: cursor, end: cursor + own }
      cursor += own
      return entry
    })
    const planned = { step, start: at, end: at + span, strokes }
    at += span
    return planned
  })
}

// The document as it looks `time` milliseconds into the replay, plus the layer whose last stroke is still being drawn.
export function replayFrame(plan, time) {
  if (!plan.length) return undefined
  const last = plan.at(-1)
  if (time >= last.end) return { doc: last.step.after }
  const item = plan.find(entry => time < entry.end) ?? last
  if (item.step.type === 'jump' || !item.strokes.length) return { doc: time < item.start + (item.end - item.start) / 2 ? item.step.before : item.step.after }
  const done = item.strokes.filter(entry => time >= entry.end)
  const current = item.strokes.find(entry => time >= entry.start && time < entry.end)
  const layers = item.step.after.layers.map(layer => {
    const base = item.step.before.layers.find(old => old.id === layer.id)?.strokes ?? []
    const extra = [...done.filter(entry => entry.layer === layer.id).map(entry => entry.stroke)]
    if (current?.layer === layer.id) extra.push(partialStroke(current.stroke, (time - current.start) / (current.end - current.start)))
    return { ...layer, strokes: extra.length ? [...base, ...extra] : base }
  })
  return { doc: { ...item.step.after, layers }, moving: current?.layer }
}
