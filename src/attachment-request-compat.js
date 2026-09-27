const positiveInteger = value => Number.isSafeInteger(value) && value > 0

function requestImageDimensions(width, height, maxPixels) {
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)))
  if (scale === 1) return { width, height }
  if (width >= height) {
    let projectedWidth = Math.max(1, Math.floor(width * scale))
    let projectedHeight = Math.max(1, Math.round(projectedWidth * height / width))
    while (projectedWidth * projectedHeight > maxPixels && projectedWidth > 1) {
      projectedWidth -= 1
      projectedHeight = Math.max(1, Math.round(projectedWidth * height / width))
    }
    return { width: projectedWidth, height: projectedHeight }
  }
  let projectedHeight = Math.max(1, Math.floor(height * scale))
  let projectedWidth = Math.max(1, Math.round(projectedHeight * width / height))
  while (projectedWidth * projectedHeight > maxPixels && projectedHeight > 1) {
    projectedHeight -= 1
    projectedWidth = Math.max(1, Math.round(projectedHeight * width / height))
  }
  return { width: projectedWidth, height: projectedHeight }
}

/**
 * DSH 0.1.2 adapters passed the request-image policy to the attachment store;
 * DSH 0.1.7 adapters project that policy into concrete dimensions first. A
 * stale peer link can otherwise make an old adapter call a new store with no
 * width or height, which the store correctly rejects.
 */
export function normalizeRequestImageTarget(ref, target) {
  if (target === null || typeof target !== 'object'
    || target.width !== undefined || target.height !== undefined
    || !positiveInteger(target.maxPixels) || !positiveInteger(target.maxBytes)
    || !positiveInteger(ref?.width) || !positiveInteger(ref?.height)) return target
  return {
    ...requestImageDimensions(ref.width, ref.height, target.maxPixels),
    maxBytes: target.maxBytes,
  }
}

const legacyTargetRejected = error => error?.code === 'INVALID_ATTACHMENT_REF'
  && /^Image request (?:width|height) must be a positive integer\.$/u.test(error?.message)

const wrappers = new WeakMap()

/** Present one attachment service that accepts both adapter target contracts. */
export function compatibleAttachmentService(attachments) {
  if ((typeof attachments !== 'object' && typeof attachments !== 'function')
    || attachments === null || typeof attachments.readImageRequest !== 'function') return attachments
  const cached = wrappers.get(attachments)
  if (cached !== undefined) return cached
  const methods = new Map()
  const readImageRequest = async (ref, target, signal) => {
    try {
      return await attachments.readImageRequest(ref, target, signal)
    } catch (error) {
      const normalized = normalizeRequestImageTarget(ref, target)
      if (signal?.aborted || normalized === target || !legacyTargetRejected(error)) throw error
      return attachments.readImageRequest(ref, normalized, signal)
    }
  }
  const wrapper = new Proxy(attachments, {
    get(target, property) {
      if (property === 'readImageRequest') return readImageRequest
      const value = Reflect.get(target, property, target)
      if (typeof value !== 'function') return value
      if (!methods.has(property) || methods.get(property).source !== value) {
        methods.set(property, { source: value, bound: value.bind(target) })
      }
      return methods.get(property).bound
    },
  })
  wrappers.set(attachments, wrapper)
  return wrapper
}
