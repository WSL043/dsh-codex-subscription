export const ORIGINAL_IMAGE_SCHEMA_VERSION = 1
export const ORIGINAL_IMAGE_CHUNK_BYTES = 4 * 1024 * 1024
export const ORIGINAL_IMAGE_ID_PATTERN = /^img_[0-9a-f]{32}$/u

const positiveInteger = value => Number.isSafeInteger(value) && value > 0

export function decodeOriginalImageRef(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || typeof value.assetId !== 'string' || !ORIGINAL_IMAGE_ID_PATTERN.test(value.assetId)
    || value.mediaType !== 'image/png'
    || !positiveInteger(value.bytes) || value.bytes > 48 * 1024 * 1024
    || !positiveInteger(value.width) || !positiveInteger(value.height)
    || typeof value.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.name)
    || typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(value.sha256)) return undefined
  return {
    assetId: value.assetId,
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    name: value.name,
    sha256: value.sha256,
  }
}

export function decodeImagePresentation(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || value.kind !== 'codex-subscription-image' || value.schemaVersion !== ORIGINAL_IMAGE_SCHEMA_VERSION) return undefined
  const original = decodeOriginalImageRef(value.original)
  return original === undefined ? undefined : { original }
}

export function originalImageRefsEqual(left, right) {
  const a = decodeOriginalImageRef(left)
  const b = decodeOriginalImageRef(right)
  return a !== undefined && b !== undefined
    && a.assetId === b.assetId
    && a.mediaType === b.mediaType
    && a.bytes === b.bytes
    && a.width === b.width
    && a.height === b.height
    && a.name === b.name
    && a.sha256 === b.sha256
}

/** Resolve only an exact original reference copied into a DSH fork prefix. */
export function inheritedOriginalImageRef(session, assetId) {
  const parentSession = session?.header?.parentSession
  const seedLength = Number.isSafeInteger(session?.inheritedEventCount)
    ? session.inheritedEventCount
    : session?.header?.seedLength
  if (typeof parentSession !== 'string' || parentSession.length === 0
    || !Number.isSafeInteger(seedLength) || seedLength < 0
    || !ORIGINAL_IMAGE_ID_PATTERN.test(assetId)) return undefined
  let events = session?.events
  if (!Array.isArray(events) && typeof session?.snapshotEvents === 'function') {
    try { events = session.snapshotEvents() } catch { return undefined }
  }
  if (!Array.isArray(events)) return undefined
  for (const event of events) {
    if (!Number.isSafeInteger(event?.seq) || event.seq < 0 || event.seq >= seedLength
      || event.type !== 'tool/result') continue
    const original = decodeImagePresentation(event.data?.meta)?.original
    if (original?.assetId === assetId) return original
  }
  return undefined
}
