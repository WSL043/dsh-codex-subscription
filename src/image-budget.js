// Keep the request's inline image payload inside Codex's base64 bound before the
// host adapter refuses it. The host reports IMAGE_OFFLOAD_REQUIRED only after a
// request has already been built and rejected, so a long session that keeps
// accumulating images pays a failed request and a retry on every new turn once
// it crosses the bound. Measuring the same budget up front turns that
// fail-then-retry cycle into one request that already fits.

/** DSH counts the base64 representation, so inflate raw bytes the same way. */
export function base64Bytes(rawBytes) {
  return Math.ceil(rawBytes / 3) * 4
}

/** First index at or above `limit`, or -1 when the payload already fits. */
export function firstOffloadCount(sizes, limit) {
  if (!Array.isArray(sizes) || limit === undefined || limit === null) return -1
  if (!Number.isSafeInteger(limit) || limit < 0) return -1
  let total = 0
  for (const size of sizes) total += Number.isFinite(size) && size > 0 ? size : 0
  if (total <= limit) return -1
  // Dropping the oldest occurrences one at a time is the same order the host
  // uses, so the projected result matches what its own retry would produce.
  let remaining = total
  for (let count = 1; count <= sizes.length; count += 1) {
    const size = sizes[count - 1]
    remaining -= Number.isFinite(size) && size > 0 ? size : 0
    if (remaining <= limit) return count
  }
  return -1
}

/**
 * Collect retained inline-image sizes in model-request order.
 * Assistant nodes carry model output and are excluded, matching the host's own
 * selection rule. Previously offloaded occurrences stay in the ordering but
 * contribute no bytes.
 */
export function retainedImageSizes(messages) {
  if (!Array.isArray(messages)) return []
  const sizes = []
  for (const message of messages) {
    const role = message?.role
    if (role !== 'user' && role !== 'tool') continue
    const content = message.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block?.type !== 'image') continue
      if (block.offloaded === true) {
        sizes.push(0)
        continue
      }
      const bytes = block.attachment?.bytes
      sizes.push(Number.isFinite(bytes) && bytes > 0 ? base64Bytes(bytes) : 0)
    }
  }
  return sizes
}

/** Whether the projected payload leaves room for one more full-size image. */
export function needsProactiveOffload(messages, limit) {
  const sizes = retainedImageSizes(messages)
  return { sizes, count: firstOffloadCount(sizes, limit) }
}
