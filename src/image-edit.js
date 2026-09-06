const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)

const validCoordinate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1

const cleanNote = value => typeof value === 'string' ? value.trim() : ''

const coordinateError = number => {
  const error = new Error(`Annotation ${number} must have finite x and y coordinates between 0 and 1`)
  error.code = 'ANNOTATION_INVALID'
  return error
}

/**
 * Validate the annotation contract shared by the draft builder and the
 * reference-image renderer. Annotation numbers are their array positions so
 * that they stay aligned with the pins shown to the user.
 */
export function normalizeImageEditAnnotations(annotations, { requireNotes = false } = {}) {
  if (!Array.isArray(annotations)) throw new TypeError('annotations must be an array')
  return annotations.map((annotation, index) => {
    const number = index + 1
    const note = cleanNote(annotation?.note)
    if (requireNotes && note === '') {
      const error = new Error(`Annotation ${number} is missing a note; describe what should change`)
      error.code = 'ANNOTATION_INVALID'
      throw error
    }
    if (!isRecord(annotation) || !validCoordinate(annotation.x) || !validCoordinate(annotation.y)) {
      throw coordinateError(number)
    }
    return { number, x: annotation.x, y: annotation.y, note }
  })
}

const formatPercent = value => {
  const rounded = Number((value * 100).toFixed(2))
  return `${rounded}%`
}

const formatPixel = value => {
  const rounded = Number(value.toFixed(2))
  return String(rounded)
}

const withNames = (value, sourceName, referenceName) => String(value)
  .replaceAll('{sourceName}', sourceName)
  .replaceAll('{referenceName}', referenceName)

const positiveImageDimension = value => Number.isSafeInteger(value) && value > 0

export function buildImageEditDraft({
  prompt = '',
  annotations = [],
  translate,
  width,
  height,
  sourceName = 'source.png',
  referenceName = 'annotated-reference.png',
}) {
  if (typeof translate !== 'function') throw new TypeError('translate must be a function')
  const base = typeof prompt === 'string' && prompt.trim() !== ''
    ? prompt.trim()
    : translate('imageEditDefault')
  if (!Array.isArray(annotations)) throw new TypeError('annotations must be an array')
  if (annotations.length === 0) return base

  const hasWidth = width !== undefined
  const hasHeight = height !== undefined
  if (hasWidth !== hasHeight || (hasWidth && (!positiveImageDimension(width) || !positiveImageDimension(height)))) {
    throw new Error('width and height must be positive integers when provided')
  }
  const normalized = normalizeImageEditAnnotations(annotations, { requireNotes: true })
  const source = typeof sourceName === 'string' && sourceName.trim() !== '' ? sourceName.trim() : 'source.png'
  const reference = typeof referenceName === 'string' && referenceName.trim() !== ''
    ? referenceName.trim()
    : 'annotated-reference.png'
  const guide = withNames(translate('imageEditReferenceGuide'), source, reference)
  const location = translate('imageEditLocation')
  const notes = normalized.map(({ number, x, y, note }) => {
    const pixels = hasWidth
      ? ` (pixel x=${formatPixel(x * Math.max(0, width - 1))} of ${width}, y=${formatPixel(y * Math.max(0, height - 1))} of ${height})`
      : ''
    return `${number}. ${location}: x=${formatPercent(x)} (normalized ${x}), y=${formatPercent(y)} (normalized ${y})${pixels}; ${note}`
  })
  return [
    base,
    '',
    guide,
    '',
    translate('imageRegionNotes'),
    ...notes,
  ].join('\n')
}
