import { MAX_SKETCH_STROKES, SKETCH_SIZE } from './sketch-document.js'
export const MAX_SKETCH_LAYERS = 8
export const createSketchLayers = () => ({ active: 1, nextId: 2, layers: [{ id: 1, name: '', visible: true, strokes: [] }] })
export const strokeCount = doc => doc.layers.reduce((n, layer) => n + layer.strokes.length, 0)
export function changeSketchLayer(doc, action, id = doc.active, value) {
  const index = doc.layers.findIndex(layer => layer.id === id)
  if (index < 0) return doc
  const layers = doc.layers.slice(), layer = layers[index]
  if (action === 'select') return { ...doc, active: id }
  if (action === 'add' || action === 'duplicate') {
    if (layers.length >= MAX_SKETCH_LAYERS || action === 'duplicate' && strokeCount(doc) + layer.strokes.length > MAX_SKETCH_STROKES) return doc
    const next = action === 'add' ? { id: doc.nextId, name: '', visible: true, strokes: [] } : { ...layer, id: doc.nextId, strokes: layer.strokes.slice() }
    layers.splice(index + 1, 0, next)
    return { ...doc, layers, active: next.id, nextId: doc.nextId + 1 }
  }
  if (action === 'delete') { if (layers.length === 1) return doc; layers.splice(index, 1); return { ...doc, layers, active: doc.active === id ? layers[Math.min(index, layers.length - 1)].id : doc.active } }
  if (action === 'up' || action === 'down') { const target = index + (action === 'up' ? 1 : -1); if (!layers[target]) return doc; [layers[index], layers[target]] = [layers[target], layer] }
  else if (action === 'visible') layers[index] = { ...layer, visible: !layer.visible }
  else if (action === 'rename') layers[index] = { ...layer, name: String(value).trim().slice(0, 40) }
  else if (action === 'clear') layers[index] = { ...layer, strokes: [], image: undefined }
  else return doc
  return { ...doc, layers }
}
const distanceToSegment = (p, a, b) => {
  const dx = b.x-a.x, dy = b.y-a.y, length = dx*dx+dy*dy
  const k = length ? Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/length)) : 0
  return Math.hypot(p.x-a.x-k*dx, p.y-a.y-k*dy)
}
export function strokeHit(stroke, point, radius, width = SKETCH_SIZE, height = width) {
  let points = stroke.points
  if (!points.length) return false
  const a = points[0], b = points.at(-1)
  if (stroke.shape === 'rectangle') points = [a,{x:b.x,y:a.y},b,{x:a.x,y:b.y},a]
  if (stroke.shape === 'circle') points = Array.from({length:65},(_,i)=>({x:(a.x+b.x)/2+Math.abs(b.x-a.x)/2*Math.cos(i*Math.PI/32),y:(a.y+b.y)/2+Math.abs(b.y-a.y)/2*Math.sin(i*Math.PI/32)}))
  points = points.map(p => ({ x: p.x * width, y: p.y * height }))
  point = { x: point.x * width, y: point.y * height }
  const tolerance = radius + stroke.width / 2
  return points.some((p,i)=>distanceToSegment(point, i ? points[i-1] : p, p) <= tolerance)
}


export const SKETCH_RATIOS = Object.freeze({ '1:1': [1024,1024], '4:3': [1024,768], '3:4': [768,1024], '16:9': [1024,576], '9:16': [576,1024] })
// Fit existing artwork at the center without stretching or cropping it.
export function resizeSketch(doc, ratio) {
  if (!Object.hasOwn(SKETCH_RATIOS, ratio)) throw new Error('Invalid sketch ratio')
  const [width,height] = SKETCH_RATIOS[ratio]
  const oldWidth = doc.width ?? SKETCH_SIZE, oldHeight = doc.height ?? SKETCH_SIZE
  if (width === oldWidth && height === oldHeight) return doc
  const scale = Math.min(width / oldWidth, height / oldHeight)
  const dx = (width - oldWidth * scale) / 2, dy = (height - oldHeight * scale) / 2
  return { ...doc, width, height, ratio, layers: doc.layers.map(layer => ({ ...layer,
    ...(layer.image ? { image: { ...layer.image, x: (layer.image.x * oldWidth * scale + dx) / width, y: (layer.image.y * oldHeight * scale + dy) / height, width: layer.image.width * oldWidth * scale / width, height: layer.image.height * oldHeight * scale / height } } : {}),
    strokes: layer.strokes.map(stroke => ({ ...stroke, width: stroke.width * scale,
      points: stroke.points.map(p => ({ x: (p.x * oldWidth * scale + dx) / width, y: (p.y * oldHeight * scale + dy) / height })) })) })) }
}
