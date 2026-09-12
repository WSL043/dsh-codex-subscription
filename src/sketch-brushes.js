// Versioned tips preserve the appearance of existing drafts. Grain is generated
// once per color, never randomly during painting (or PNG/PSD export).
const grains = new Map()
function pencilGrain(context, color) {
  if (!context.createPattern || typeof document === 'undefined') return color
  if (!grains.has(color)) {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = color
    let seed = 173
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const value = seed / 4294967296
      if (value < .28) continue
      ctx.globalAlpha = .2 + value * .8
      ctx.fillRect(x, y, 1, 1)
    }
    if (grains.size >= 16) grains.delete(grains.keys().next().value)
    grains.set(color, canvas)
  }
  return context.createPattern(grains.get(color), 'repeat') ?? color
}

export function configureSketchBrush(context, stroke) {
  const modern = stroke.brushVersion === 2 && stroke.shape === 'pen'
  const brush = stroke.brush ?? 'pen'
  context.lineCap = modern && brush === 'marker' ? 'butt' : 'round'
  context.lineJoin = 'round'
  context.globalAlpha = (stroke.opacity ?? 1) * (brush === 'marker' ? .28 : brush === 'pencil' ? (modern ? .85 : .65) : 1)
  context.lineWidth = stroke.width * (brush === 'pencil' && !modern ? .55 : 1) * (stroke.pressure ?? 1)
  context.strokeStyle = modern && brush === 'pencil' ? pencilGrain(context, stroke.color) : stroke.color
  context.fillStyle = context.strokeStyle
}
