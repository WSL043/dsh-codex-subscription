import { paintSketch, SKETCH_SIZE } from './sketch-document.js'
export function paintSketchLayers(context, doc, cache, size = SKETCH_SIZE) {
  context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1
  context.fillStyle = '#fff'; context.fillRect(0, 0, size, size)
  for (const id of cache.keys()) if (!doc.layers.some(layer => layer.id === id)) cache.delete(id)
  for (const layer of doc.layers) {
    if (!layer.visible) continue
    let surface = cache.get(layer.id)
    if (!surface) { surface = document.createElement('canvas'); surface.width = size; surface.height = size; cache.set(layer.id, surface) }
    const ctx = surface.getContext('2d')
    ctx.clearRect(0, 0, size, size)
    paintSketch(ctx, layer.strokes, size, true)
    context.drawImage(surface, 0, 0)
  }
}
