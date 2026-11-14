export const ORIGINAL_IMAGE_SCHEMA_VERSION = 1
export const ORIGINAL_IMAGE_CHUNK_BYTES = 4 * 1024 * 1024
export const ORIGINAL_IMAGE_ID_PATTERN = /^img_[0-9a-f]{32}$/u
export const GENERATED_IMAGE_MEDIA_TYPES = Object.freeze(['image/png', 'image/gif'])
const FORK_EVENT_BATCH = 256

const positiveInteger = value => Number.isSafeInteger(value) && value > 0

export function decodeOriginalImageRef(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || typeof value.assetId !== 'string' || !ORIGINAL_IMAGE_ID_PATTERN.test(value.assetId)
    || !GENERATED_IMAGE_MEDIA_TYPES.includes(value.mediaType)
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
  // Newer native forks mark their inherited prefix with isSeeded rather than a parent id.
  const forked = typeof parentSession === 'string' && parentSession.length > 0 || session?.header?.isSeeded === true
  const seedLength = session?.inheritedEventCount
  if (!forked
    || !Number.isSafeInteger(seedLength) || seedLength < 0
    || !ORIGINAL_IMAGE_ID_PATTERN.test(assetId)) return undefined
  if (typeof session?.snapshotEvents !== 'function') return undefined
  try {
    for (let from = 0; from < seedLength; from += FORK_EVENT_BATCH) {
      const end = Math.min(from + FORK_EVENT_BATCH, seedLength)
      for (const event of session.snapshotEvents(from, end)) {
        if (!Number.isSafeInteger(event?.seq) || event.seq < from || event.seq >= end
          || event.type !== 'tool/result' || event.data?.meta?.original?.assetId !== assetId) continue
        const original = decodeImagePresentation(event.data.meta)?.original
        if (original) return original
      }
    }
  } catch { /* Reading a fork that is no longer available fails closed. */ }
  return undefined
}
