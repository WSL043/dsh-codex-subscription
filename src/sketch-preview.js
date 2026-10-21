import { diffHeatmap } from './sketch-diff.js'

// Feedback images for the drawing agent: the plain canvas, optionally blended 50/50 with
// the reference picture layer (so offsets show up as ghosting), with a labelled
// coordinate grid (so positions can be read in canvas pixels instead of guessed), zoomed into
// one part of the canvas (box), or laid out next to the reference (side) with a difference heat map (diff).
const GRID_STEP = 100
const PANE_WIDTH = 560, PANE_HEIGHT = 760, LABEL = 22, GAP = 10
const MAX_SURFACE = 4096

const referenceOf = doc => ({ ...doc, layers: doc.layers.map(layer => ({ ...layer, strokes: [], visible: Boolean(layer.image) })) })
const drawingOf = doc => ({ ...doc, layers: doc.layers.map(layer => ({ ...layer, image: undefined })) })

export function composeSketchPreview({ doc, images, width, height, options = {}, makeSurface, paintLayers, readPixels = surface => surface.getContext('2d').getImageData(0, 0, surface.width, surface.height) }) {
  const hasReference = doc.layers.some(layer => layer.image)
  const mode = options.mode === 'side' || options.mode === 'diff' ? options.mode : undefined
  if ((options.compare || mode) && !hasReference) throw Error('compare needs a reference picture layer on the board; ask the user to add the reference with the pictures button')
  const box = options.box
  // The part of the canvas to show, in canvas pixels, and how much it is magnified.
  const region = box ? { x: box.x * width, y: box.y * height, w: box.width * width, h: box.height * height } : { x: 0, y: 0, w: width, h: height }
  const zoom = box ? Math.max(1, Math.min(3, 900 / Math.max(region.w, region.h), MAX_SURFACE / width, MAX_SURFACE / height)) : 1
  // One rendering of the region (a variant of the document), at the magnified size.
  const render = variant => {
    const bigWidth = Math.round(width * zoom), bigHeight = Math.round(height * zoom)
    const big = makeSurface(bigWidth, bigHeight)
    paintLayers(big.getContext('2d'), variant, new Map(), bigWidth, bigHeight, undefined, images)
    if (!box) return big
    const out = makeSurface(Math.max(1, Math.round(region.w * zoom)), Math.max(1, Math.round(region.h * zoom)))
    out.getContext('2d').drawImage(big, Math.round(region.x * zoom), Math.round(region.y * zoom), out.width, out.height, 0, 0, out.width, out.height)
    return out
  }
  const grid = (context, w, h) => { if (options.grid) paintGrid(context, w, h, region, zoom) }

  if (mode) {
    const reference = render(referenceOf(doc)), drawing = render(drawingOf(doc))
    const scale = Math.min(1, PANE_WIDTH / reference.width, PANE_HEIGHT / reference.height)
    const paneWidth = Math.max(1, Math.round(reference.width * scale)), paneHeight = Math.max(1, Math.round(reference.height * scale))
    const panes = mode === 'diff' ? 3 : 2
    const surface = makeSurface(panes * paneWidth + (panes - 1) * GAP, paneHeight + LABEL), context = surface.getContext('2d')
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, surface.width, surface.height)
    const labels = ['reference', 'drawing', 'difference']
    const place = (source, index) => {
      context.drawImage(source, index * (paneWidth + GAP), LABEL, paneWidth, paneHeight)
      context.save(); context.beginPath(); context.rect(index * (paneWidth + GAP), LABEL, paneWidth, paneHeight); context.clip()
      context.translate(index * (paneWidth + GAP), LABEL); context.scale(scale, scale)
      grid(context, reference.width, reference.height)
      context.restore()
      context.fillStyle = '#222222'; context.font = '14px sans-serif'; context.textBaseline = 'top'
      context.fillText(labels[index], index * (paneWidth + GAP) + 4, 3)
    }
    place(reference, 0); place(drawing, 1)
    if (mode === 'diff') {
      const heat = makeSurface(reference.width, reference.height)
      const pixels = diffHeatmap(readPixels(reference), readPixels(drawing))
      heat.getContext('2d').putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0)
      place(heat, 2)
    }
    return surface.toDataURL('image/png')
  }

  if (options.compare) {
    const reference = render(referenceOf(doc)), drawing = render(drawingOf(doc))
    const surface = makeSurface(reference.width, reference.height), context = surface.getContext('2d')
    context.drawImage(reference, 0, 0)
    context.globalAlpha = 0.5
    context.drawImage(drawing, 0, 0)
    context.globalAlpha = 1
    grid(context, surface.width, surface.height)
    return surface.toDataURL('image/png')
  }
  const surface = render(options.drawingOnly ? drawingOf(doc) : doc)
  grid(surface.getContext('2d'), surface.width, surface.height)
  return surface.toDataURL('image/png')
}

function paintGrid(context, width, height, region, zoom) {
  // Lines every GRID_STEP canvas pixels (every half step when zoomed in), labelled with canvas coordinates.
  const step = zoom > 1.6 ? GRID_STEP / 2 : GRID_STEP
  context.save()
  context.lineWidth = 1
  context.strokeStyle = 'rgba(214,0,120,0.45)'
  context.fillStyle = 'rgba(214,0,120,0.9)'
  context.font = '12px sans-serif'
  context.textBaseline = 'top'
  for (let canvasX = Math.ceil(region.x / step) * step; canvasX < region.x + region.w; canvasX += step) {
    if (canvasX <= 0) continue
    const x = Math.round((canvasX - region.x) * zoom)
    context.beginPath(); context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, height); context.stroke()
    context.fillText(String(canvasX), x + 3, 2)
  }
  for (let canvasY = Math.ceil(region.y / step) * step; canvasY < region.y + region.h; canvasY += step) {
    if (canvasY <= 0) continue
    const y = Math.round((canvasY - region.y) * zoom)
    context.beginPath(); context.moveTo(0, y + 0.5); context.lineTo(width, y + 0.5); context.stroke()
    context.fillText(String(canvasY), 3, y + 2)
  }
  context.restore()
}
