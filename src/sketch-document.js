export const SKETCH_SIZE = 1024
export const MAX_SKETCH_STROKES = 200
export const MAX_STROKE_POINTS = 2000

export function sketchPoint(clientX, clientY, rect) {
  if (!(rect.width > 0 && rect.height > 0)) return undefined
  return { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) }
}

export function paintSketch(context, strokes, size = SKETCH_SIZE, transparent = false, height = size) {
  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = 1
  if (!transparent) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, size, height) }
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const stroke of strokes) {
    const first = stroke.points[0]
    if (!first) continue
    context.globalCompositeOperation = stroke.shape === 'eraser' ? 'destination-out' : 'source-over'
    context.globalAlpha = (stroke.opacity ?? 1) * (stroke.brush === 'marker' ? 0.28 : stroke.brush === 'pencil' ? 0.65 : 1)
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color
    context.lineWidth = stroke.width * (stroke.brush === 'pencil' ? 0.55 : 1) * (stroke.pressure ?? 1)
    context.beginPath()
    const last = stroke.points.at(-1)
    if (stroke.shape === 'line') {
      context.moveTo(first.x * size, first.y * height); context.lineTo(last.x * size, last.y * height); context.stroke()
    } else if (stroke.shape === 'rectangle') {
      context.rect(first.x * size, first.y * height, (last.x-first.x)*size, (last.y-first.y)*height)
      context.stroke()
    } else if (stroke.shape === 'circle') {
      context.ellipse((first.x+last.x)*size/2, (first.y+last.y)*height/2, Math.abs(last.x-first.x)*size/2, Math.abs(last.y-first.y)*height/2, 0, 0, Math.PI*2)
      context.stroke()
    } else if (stroke.points.length === 1) {
      context.arc(first.x * size, first.y * height, context.lineWidth / 2, 0, Math.PI * 2)
      context.fill()
    } else {
      context.moveTo(first.x * size, first.y * height)
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const point = stroke.points[i], next = stroke.points[i + 1]
        if (context.quadraticCurveTo) context.quadraticCurveTo(point.x * size, point.y * height, (point.x + next.x) * size / 2, (point.y + next.y) * height / 2)
        else context.lineTo(point.x * size, point.y * height)
      }
      context.lineTo(last.x * size, last.y * height)
      context.stroke()
    }
  }
  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = 1
}
