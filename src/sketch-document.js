export const SKETCH_SIZE = 1024
export const MAX_SKETCH_STROKES = 200
export const MAX_STROKE_POINTS = 2000

export function sketchPoint(clientX, clientY, rect) {
  if (!(rect.width > 0 && rect.height > 0)) return undefined
  return { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) }
}

export function paintSketch(context, strokes, size = SKETCH_SIZE) {
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size, size)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const stroke of strokes) {
    const first = stroke.points[0]
    if (!first) continue
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color
    context.lineWidth = stroke.width
    context.beginPath()
    const last = stroke.points.at(-1)
    if (stroke.shape === 'rectangle') {
      context.rect(first.x * size, first.y * size, (last.x-first.x)*size, (last.y-first.y)*size)
      context.stroke()
    } else if (stroke.shape === 'circle') {
      context.ellipse((first.x+last.x)*size/2, (first.y+last.y)*size/2, Math.abs(last.x-first.x)*size/2, Math.abs(last.y-first.y)*size/2, 0, 0, Math.PI*2)
      context.stroke()
    } else if (stroke.points.length === 1) {
      context.arc(first.x * size, first.y * size, stroke.width / 2, 0, Math.PI * 2)
      context.fill()
    } else {
      context.moveTo(first.x * size, first.y * size)
      for (const point of stroke.points.slice(1)) context.lineTo(point.x * size, point.y * size)
      context.stroke()
    }
  }
}
