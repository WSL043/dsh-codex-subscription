// Mirrors the Codex desktop image panel: each tool sends the official
// instruction (and, for erase, a black-and-white mask) as a follow-up turn.
// Here the image and instruction fill the composer for the user to send.

export const IMAGE_ASPECT_RATIOS = Object.freeze([
  ['square', '1:1'], ['portrait', '3:4'], ['story', '9:16'], ['landscape', '4:3'], ['widescreen', '16:9'],
])

/**
 * Build viewer actions for one image.
 * @param {{ src: string, name: string, t: (key: string) => string,
 *   attachForEdit: (src: string, name: string, draft: string, annotations?: unknown[], referenceName?: string, sourceInDraft?: boolean, extraFiles?: File[]) => Promise<unknown>,
 *   sourceInDraft?: boolean }} options
 */
export function officialImageTools({ src, name, t, attachForEdit, sourceInDraft = false }) {
  const send = (draft, extraFiles = []) => attachForEdit(src, name, draft, [], undefined, sourceInDraft, extraFiles)
  const base = { pendingLabel: t('imageEditPreparing'), errorLabel: t('imageEditFailed'), closeOnSuccess: true }
  return [
    { ...base, id: 'remove-background', kind: 'tool', label: t('imageRemoveBackground'),
      onInvoke: () => send(t('imageRemoveBackgroundPrompt')) },
    { ...base, id: 'erase', kind: 'mask', label: t('imageErase'),
      onInvoke: async ({ mask }) => {
        if (!(mask instanceof Blob)) throw new Error('Mark the area to erase first')
        const maskName = `${String(name).replace(/\.[a-z0-9]+$/iu, '')}-erase-mask.png`
        return send(t('imageErasePrompt'), [new File([mask], maskName, { type: 'image/png' })])
      } },
    { ...base, id: 'resize', kind: 'choice', label: t('imageResize'),
      options: IMAGE_ASPECT_RATIOS.map(([id, ratio]) => ({ value: ratio, label: `${t(`imageRatio_${id}`)} ${ratio}` })),
      onInvoke: ({ option }) => send(t('imageResizePrompt').replaceAll('{aspectRatio}', option)) },
  ]
}

/** Draw relative erase strokes in one color onto a canvas of the given size. */
export function paintEraseStrokes(context, strokes, width, height, color) {
  context.strokeStyle = color
  context.fillStyle = color
  context.lineCap = 'round'
  context.lineJoin = 'round'
  const scale = Math.min(width, height)
  for (const stroke of strokes) {
    const points = stroke.points
    if (points.length === 0) continue
    context.lineWidth = stroke.size * scale
    context.beginPath()
    if (points.length === 1) {
      context.arc(points[0].x * width, points[0].y * height, stroke.size * scale / 2, 0, Math.PI * 2)
      context.fill()
      continue
    }
    context.moveTo(points[0].x * width, points[0].y * height)
    for (const point of points.slice(1)) context.lineTo(point.x * width, point.y * height)
    context.stroke()
  }
}

/** Codex's erase mask: the marked area white on black, at the image's own resolution. */
export function paintEraseMask(context, strokes, width, height) {
  context.fillStyle = '#000'
  context.fillRect(0, 0, width, height)
  paintEraseStrokes(context, strokes, width, height, '#fff')
}
