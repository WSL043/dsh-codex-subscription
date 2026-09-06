import { normalizeImageEditAnnotations } from './image-edit.js'

const TWO_PI = Math.PI * 2
const PIN_FILL = '#e11d48'
const PIN_OUTER_STROKE = '#111827'
const PIN_INNER_STROKE = '#ffffff'

const finiteDimension = value => Number.isSafeInteger(value) && value > 0

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const clampCenter = (value, size, edge) => {
  const margin = Math.min(edge, size / 2)
  return clamp(value, margin, size - margin)
}

function getBitmapFactory(options) {
  const factory = options?.createImageBitmap ?? options?.bitmapFactory
    ?? globalThis.createImageBitmap
  if (typeof factory !== 'function') throw new Error('createImageBitmap is not available')
  return factory
}

function getCanvasFactory(options) {
  const injected = options?.createCanvas ?? options?.canvasFactory
  if (typeof injected === 'function') return injected
  const document = globalThis.document
  if (document !== undefined && typeof document.createElement === 'function') {
    return (width, height) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      return canvas
    }
  }
  throw new Error('A canvas factory is not available')
}

function drawPin(context, number, x, y, width, height) {
  const label = String(number)
  const shortEdge = Math.min(width, height)
  const fontSize = Math.max(12, Math.min(40, Math.round(shortEdge * 0.03)))
  const radius = Math.max(12, fontSize * 0.8, fontSize * (0.3 * label.length + 0.35))
  const outerStroke = Math.max(2, Math.min(4, radius * 0.25))
  const innerStroke = Math.max(1, Math.min(2, radius * 0.13))
  const edge = radius + outerStroke + 2
  const targetX = x * Math.max(0, width - 1)
  const targetY = y * Math.max(0, height - 1)
  const centerX = clampCenter(targetX, width, edge)
  const centerY = clampCenter(targetY, height, edge)

  context.save?.()
  if ((centerX !== targetX || centerY !== targetY)
    && typeof context.moveTo === 'function' && typeof context.lineTo === 'function') {
    context.beginPath()
    context.moveTo(targetX, targetY)
    context.lineTo(centerX, centerY)
    context.lineWidth = outerStroke * 2
    context.strokeStyle = PIN_OUTER_STROKE
    context.stroke()
    context.beginPath()
    context.moveTo(targetX, targetY)
    context.lineTo(centerX, centerY)
    context.lineWidth = innerStroke
    context.strokeStyle = PIN_INNER_STROKE
    context.stroke()
  }
  context.beginPath()
  context.arc(centerX, centerY, radius, 0, TWO_PI)
  context.fillStyle = PIN_FILL
  context.fill()
  context.lineWidth = outerStroke
  context.strokeStyle = PIN_OUTER_STROKE
  context.stroke()
  context.lineWidth = innerStroke
  context.strokeStyle = PIN_INNER_STROKE
  context.stroke()
  context.font = `700 ${fontSize}px sans-serif`
  context.fillStyle = PIN_INNER_STROKE
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, centerX, centerY)
  context.restore?.()
}

function encodePng(canvas) {
  if (typeof canvas?.toBlob !== 'function') throw new Error('Canvas PNG encoding is not available')
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      callback(value)
    }
    try {
      canvas.toBlob(value => {
        if (value === null || value === undefined) {
          finish(reject, new Error('Canvas failed to encode the annotation reference as PNG'))
        } else {
          finish(resolve, value)
        }
      }, 'image/png')
    } catch (error) {
      finish(reject, error)
    }
  })
}

/**
 * Create the second image sent with an annotated edit. It contains the clean
 * source plus numbered pins, with no note text. `options` is intentionally
 * injectable so the rendering path can be exercised without a browser:
 * `{ createImageBitmap, createCanvas }`.
 */
export async function createAnnotatedImageReference(blob, annotations, options = {}) {
  const normalized = normalizeImageEditAnnotations(annotations)
  const createImageBitmap = getBitmapFactory(options)
  const createCanvas = getCanvasFactory(options)
  const bitmap = await createImageBitmap(blob)
  try {
    const width = bitmap?.width
    const height = bitmap?.height
    if (!finiteDimension(width) || !finiteDimension(height)) {
      throw new Error('The source image has invalid dimensions')
    }
    if (Math.min(width, height) < 64) {
      throw new Error('The source image is too small for readable annotation pins')
    }
    const canvas = await createCanvas(width, height)
    if (canvas === null || canvas === undefined) throw new Error('Canvas factory returned no canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext?.('2d')
    if (context === null || context === undefined) throw new Error('Canvas 2D context is not available')
    context.clearRect?.(0, 0, width, height)
    context.drawImage?.(bitmap, 0, 0, width, height)
    if (typeof context.drawImage !== 'function') throw new Error('Canvas 2D context cannot draw the source image')
    for (const annotation of normalized) drawPin(context, annotation.number, annotation.x, annotation.y, width, height)
    return await encodePng(canvas)
  } finally {
    if (typeof bitmap?.close === 'function') bitmap.close()
  }
}
