// Cache immutable text objects. Fit uniformly instead of squeezing glyphs.
const cache = new WeakMap()
export function layoutSketchText(stroke, context, width, height) {
  const saved = cache.get(stroke)
  if (saved?.width === width && saved?.height === height) return saved.layout
  const [a, b] = stroke.points
  const x = Math.min(a.x, b.x) * width, y = Math.min(a.y, b.y) * height
  const w = Math.abs(b.x - a.x) * width, h = Math.abs(b.y - a.y) * height
  const wrap = size => {
    context.font = `${size}px system-ui, sans-serif`
    const lines = []
    for (const paragraph of stroke.text.split('\n')) {
      let line = ''
      for (const char of paragraph) {
        if (line && context.measureText(line + char).width > w) { lines.push(line); line = '' }
        line += char
      }
      lines.push(line)
    }
    return lines
  }
  let size = stroke.width, lines = wrap(size)
  if (lines.length * size * 1.2 > h || lines.some(line => context.measureText(line).width > w)) {
    let low = 0, high = size
    for (let i = 0; i < 14; i++) {
      const mid = (low + high) / 2, candidate = wrap(mid)
      if (candidate.length * mid * 1.2 <= h && candidate.every(line => context.measureText(line).width <= w)) low = mid
      else high = mid
    }
    size = low; lines = wrap(size)
  }
  const layout = { x, y, size, lines }
  cache.set(stroke, { width, height, layout })
  return layout
}
export function newTextBounds(point) {
  const a = { x: Math.min(point.x, 0.65), y: Math.min(point.y, 0.85) }
  return [a, { x: a.x + 0.35, y: a.y + 0.15 }]
}
