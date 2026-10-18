// Gradient fills and soft edges for sketch shapes. Gradient geometry is stored relative to the shape's own bounding box,
// so moving or scaling an object keeps its gradient with it.
export const MAX_BLUR = 64
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const FILLABLE = ['rectangle', 'circle', 'polygon', 'bezier']

export function normalizeBlur(value) {
  if (value === undefined || value === null) return undefined
  if (!finite(value, 0, MAX_BLUR)) throw Error(`blur must be 0–${MAX_BLUR} canvas pixels`)
  return value >= 0.5 ? Math.round(value * 10) / 10 : undefined
}

export function normalizeGradient(gradient) {
  if (gradient === undefined || gradient === null) return undefined
  if (!gradient || typeof gradient !== 'object') throw Error('Invalid gradient')
  if (gradient.type === 'none') return undefined
  if (gradient.type !== 'linear' && gradient.type !== 'radial') throw Error('gradient.type must be linear or radial')
  const stops = gradient.stops
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > 8) throw Error('gradient needs 2–8 stops')
  const clean = stops.map(stop => {
    if (!stop || !finite(stop.offset, 0, 1) || !/^#[0-9a-f]{6}$/i.test(stop.color ?? '') || (stop.opacity !== undefined && !finite(stop.opacity, 0, 1))) {
      throw Error('Each gradient stop needs offset 0–1 and color #rrggbb (optional opacity 0–1)')
    }
    return { offset: stop.offset, color: stop.color.toLowerCase(), ...(stop.opacity !== undefined && stop.opacity < 1 ? { opacity: stop.opacity } : {}) }
  }).sort((a, b) => a.offset - b.offset)
  const number = (name, fallback, min = -8, max = 8) => {
    const value = gradient[name] ?? fallback
    if (!finite(value, min, max)) throw Error(`gradient.${name} must be a number`)
    return Math.round(value * 10_000) / 10_000
  }
  if (gradient.type === 'linear') {
    return { type: 'linear', x1: number('x1', 0), y1: number('y1', 0), x2: number('x2', 0), y2: number('y2', 1), stops: clean }
  }
  const cx = number('cx', .5), cy = number('cy', .5), r = number('r', .5, 0.0001), ry = gradient.ry === undefined ? r : number('ry', .5, 0.0001)
  return { type: 'radial', cx, cy, r, ...(ry !== r ? { ry } : {}), fx: number('fx', cx), fy: number('fy', cy), stops: clean }
}

export function gradientFits(shape, fill) {
  return fill === true && FILLABLE.includes(shape)
}

const rgba = (color, opacity = 1) => {
  const value = Number.parseInt(color.slice(1), 16)
  return `rgba(${value >> 16 & 255},${value >> 8 & 255},${value & 255},${opacity})`
}

// Fills the current path with the stroke's gradient (or its plain color).
export function fillSketchShape(context, stroke, size, height) {
  const gradient = stroke.gradient
  const xs = stroke.points.map(point => point.x), ys = stroke.points.map(point => point.y)
  const x = Math.min(...xs) * size, y = Math.min(...ys) * height
  const w = (Math.max(...xs) - Math.min(...xs)) * size, h = (Math.max(...ys) - Math.min(...ys)) * height
  if (!gradient || !(w > 0 && h > 0) || !context.createLinearGradient) { context.fill(); return }
  let paint
  if (gradient.type === 'linear') {
    paint = context.createLinearGradient(x + gradient.x1 * w, y + gradient.y1 * h, x + gradient.x2 * w, y + gradient.y2 * h)
    for (const stop of gradient.stops) paint.addColorStop(stop.offset, rgba(stop.color, stop.opacity))
    context.fillStyle = paint
    context.fill()
    return
  }
  // Radial: draw a unit circle, stretched to the gradient's own radii so a bounding-box gradient becomes an ellipse.
  const rx = gradient.r * w, ry = (gradient.ry ?? gradient.r) * h
  paint = context.createRadialGradient((gradient.fx - gradient.cx) / gradient.r, (gradient.fy - gradient.cy) / (gradient.ry ?? gradient.r), 0, 0, 0, 1)
  for (const stop of gradient.stops) paint.addColorStop(stop.offset, rgba(stop.color, stop.opacity))
  context.save()
  context.translate(x + gradient.cx * w, y + gradient.cy * h)
  context.scale(rx, ry)
  context.fillStyle = paint
  context.fill()
  context.restore()
}
