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

// Blend modes a painter uses for shading and light: shadows multiply, glows screen or add.
export const BLEND_MODES = ['multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'color-dodge', 'color-burn', 'darken', 'lighten', 'lighter']
export function normalizeBlend(value) {
  if (value === undefined || value === null || value === 'normal') return undefined
  if (!BLEND_MODES.includes(value)) throw Error('blend must be one of normal, ' + BLEND_MODES.join(', '))
  return value
}

// A clip keeps a stroke inside a shape (shading stays inside the form it shades): {shape, points} like a stroke's own geometry.
export function normalizeClip(clip) {
  if (clip === undefined || clip === null) return undefined
  if (!clip || typeof clip !== 'object') throw Error('Invalid clip')
  if (clip.shape === 'none') return undefined
  const { shape, points } = clip
  if (!['polygon', 'bezier', 'rectangle', 'circle'].includes(shape)) throw Error('clip.shape must be polygon, bezier, rectangle or circle')
  if (!Array.isArray(points) || points.some(point => !point || !finite(point.x, 0, 1) || !finite(point.y, 0, 1))) throw Error('clip.points must be {x,y} pairs inside 0..1')
  if ((shape === 'rectangle' || shape === 'circle') && points.length !== 2) throw Error('clip rectangle and circle need exactly two opposite corners')
  if (shape === 'polygon' && (points.length < 3 || points.length > 2000)) throw Error('clip polygon needs 3–2000 points')
  if (shape === 'bezier' && (points.length < 4 || points.length > 193 || (points.length - 1) % 3 !== 0)) throw Error('clip bezier needs 4, 7, ... 193 points (start + control1/control2/end per segment)')
  return { shape, points: points.map(point => ({ x: Math.round(point.x * 100_000) / 100_000, y: Math.round(point.y * 100_000) / 100_000 })) }
}

// Adds the clip's outline to the current path and clips to it.
export function applySketchClip(context, clip, size, height) {
  const { shape, points } = clip
  const first = points[0], last = points.at(-1)
  context.beginPath()
  if (shape === 'bezier') {
    context.moveTo(first.x * size, first.y * height)
    for (let i = 1; i < points.length; i += 3) context.bezierCurveTo(points[i].x * size, points[i].y * height, points[i + 1].x * size, points[i + 1].y * height, points[i + 2].x * size, points[i + 2].y * height)
  } else if (shape === 'polygon') {
    context.moveTo(first.x * size, first.y * height)
    for (const point of points.slice(1)) context.lineTo(point.x * size, point.y * height)
  } else if (shape === 'rectangle') context.rect(first.x * size, first.y * height, (last.x - first.x) * size, (last.y - first.y) * height)
  else context.ellipse((first.x + last.x) * size / 2, (first.y + last.y) * height / 2, Math.abs(last.x - first.x) * size / 2, Math.abs(last.y - first.y) * height / 2, 0, 0, Math.PI * 2)
  context.closePath()
  context.clip()
}
