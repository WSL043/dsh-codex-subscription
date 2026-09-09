import { paintSketch, SKETCH_SIZE } from './sketch-document.js'
const surface = (width,height) => { const c=document.createElement('canvas');c.width=width;c.height=height;return c }
export function paintSketchLayers(context, doc, cache, size = doc.width ?? SKETCH_SIZE, height = doc.height ?? size, activeLayer, images = new Map()) {
  context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1
  context.fillStyle = '#fff'; context.fillRect(0, 0, size, height)
  for (const id of cache.keys()) if (!doc.layers.some(layer => layer.id === id)) cache.delete(id)
  for (const layer of doc.layers) {
    if (!layer.visible) continue
    let entry = cache.get(layer.id)
    if (!entry || entry.surface.width !== size || entry.surface.height !== height) {
      entry = { surface: surface(size,height), base: surface(size,height) };cache.set(layer.id,entry)
    }
    const moving = layer.id === activeLayer
    const count = Math.max(0, layer.strokes.length - (moving ? 1 : 0))
    const prefix = layer.strokes[count - 1]
    // During drawing, reuse all committed strokes; repaint only the active stroke.
    if (entry.count !== count || entry.prefix !== prefix || entry.image !== layer.image || entry.strokes !== layer.strokes) {
      const ctx=entry.base.getContext('2d');ctx.clearRect(0,0,size,height)
      const ref=layer.image, image=ref && images.get(ref.src)
      if (image) ctx.drawImage(image,ref.x*size,ref.y*height,ref.width*size,ref.height*height)
      paintSketch(ctx,layer.strokes.slice(0,count),size,true,height)
      entry.count=count;entry.prefix=prefix;entry.image=layer.image;entry.strokes=layer.strokes
    }
    if (moving) {
      const ctx=entry.surface.getContext('2d');ctx.clearRect(0,0,size,height);ctx.drawImage(entry.base,0,0)
      paintSketch(ctx,layer.strokes.slice(-1),size,true,height)
      context.drawImage(entry.surface,0,0)
    } else context.drawImage(entry.base,0,0)
  }
}
