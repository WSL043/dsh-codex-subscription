// Feedback images for the drawing agent: the plain canvas, optionally blended 50/50 with
// the reference picture layer (so offsets show up as ghosting) and/or with a labelled
// coordinate grid (so positions can be read in canvas pixels instead of guessed).
const GRID_STEP = 100

export function composeSketchPreview({ doc, images, width, height, options = {}, makeSurface, paintLayers }) {
  const surface = makeSurface(width, height), context = surface.getContext('2d')
  if (options.compare) {
    if (!doc.layers.some(layer => layer.image)) throw Error('compare needs a reference picture layer on the board; ask the user to add the reference with the pictures button')
    const reference = makeSurface(width, height), drawing = makeSurface(width, height)
    paintLayers(reference.getContext('2d'), { ...doc, layers: doc.layers.map(layer => ({ ...layer, strokes: [], visible: Boolean(layer.image) })) }, new Map(), width, height, undefined, images)
    paintLayers(drawing.getContext('2d'), { ...doc, layers: doc.layers.map(layer => ({ ...layer, image: undefined })) }, new Map(), width, height, undefined, images)
    context.drawImage(reference, 0, 0)
    context.globalAlpha = 0.5
    context.drawImage(drawing, 0, 0)
    context.globalAlpha = 1
  } else paintLayers(context, doc, new Map(), width, height, undefined, images)
  if (options.grid) paintGrid(context, width, height)
  return surface.toDataURL('image/png')
}

function paintGrid(context, width, height) {
  context.save()
  context.lineWidth = 1
  context.strokeStyle = 'rgba(214,0,120,0.45)'
  context.fillStyle = 'rgba(214,0,120,0.9)'
  context.font = '12px sans-serif'
  context.textBaseline = 'top'
  for (let x = GRID_STEP; x < width; x += GRID_STEP) {
    context.beginPath(); context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, height); context.stroke()
    context.fillText(String(x), x + 3, 2)
  }
  for (let y = GRID_STEP; y < height; y += GRID_STEP) {
    context.beginPath(); context.moveTo(0, y + 0.5); context.lineTo(width, y + 0.5); context.stroke()
    context.fillText(String(y), 3, y + 2)
  }
  context.restore()
}
