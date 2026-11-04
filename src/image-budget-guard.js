import { firstOffloadCount, retainedImageSizes } from './image-budget.js'

/** Mirrors the host adapter's own bound for this provider profile. */
export const REQUEST_IMAGE_BYTES = 20 * 1024 * 1024

/**
 * Select the oldest retained input images to omit, matching the host rule.
 *
 * Assistant output is excluded; image indexes count every occurrence within a
 * message, including previously offloaded ones, so the recorded indexes stay
 * stable across replays.
 *
 * @returns `[{ seq, imageIndexes }]`, oldest first, or an empty array.
 */
export function selectOldestImages(messages, count) {
  if (!Array.isArray(messages) || !Number.isSafeInteger(count) || count <= 0) return []
  const targets = []
  let remaining = count
  for (const message of messages) {
    if (remaining === 0) break
    const role = message?.role
    if (role !== 'user' && role !== 'tool') continue
    const content = message?.content
    if (!Array.isArray(content)) continue
    const seq = message?.seq
    if (!Number.isSafeInteger(seq) || seq < 0) continue
    const imageIndexes = []
    let imageIndex = 0
    for (const block of content) {
      if (block?.type !== 'image') continue
      if (remaining > 0 && block.offloaded !== true) {
        imageIndexes.push(imageIndex)
        remaining -= 1
      }
      imageIndex += 1
    }
    if (imageIndexes.length > 0) targets.push({ seq, imageIndexes })
  }
  return remaining === 0 ? targets : []
}

/**
 * Record one `image/offload` decision before a request would be refused for its
 * inline image payload.
 *
 * DSH's own image-offload recovery runs only after the host adapter has rejected
 * a request, so a long Codex session that keeps collecting images pays a failed
 * request plus a retry on every new turn once the payload crosses the bound.
 * Measuring the same budget first lets the next request fit without that failed
 * round trip.
 */
export function createImageBudgetGuard({
  limit,
  messagesOf,
  offload,
  diagnostic = () => {},
} = {}) {
  const bound = limit === undefined ? REQUEST_IMAGE_BYTES : limit
  let announced = -1
  return {
    /** @returns whether an offload decision was recorded for this request. */
    run() {
      if (typeof messagesOf !== 'function' || typeof offload !== 'function') return false
      if (!Number.isSafeInteger(bound) || bound <= 0) return false
      let messages
      try {
        messages = messagesOf()
      } catch {
        return false
      }
      if (!Array.isArray(messages) || messages.length === 0) return false
      const count = firstOffloadCount(retainedImageSizes(messages), bound)
      if (count <= 0) return false
      // Report each new pressure point once instead of on every turn of the same backlog.
      const retained = messages.length
      if (retained !== announced) {
        announced = retained
        diagnostic('image', 'inline images exceed the request bound; offloading the oldest before sending')
      }
      let targets
      try {
        targets = selectOldestImages(messages, count)
      } catch {
        return false
      }
      if (targets.length === 0) return false
      try {
        return offload(targets) === true
      } catch {
        return false
      }
    },
  }
}

/** Run the budget guard once per prepared call, before the request is built. */
export function wrapImageBudgetAdapter(adapter, guard) {
  if (!guard || typeof guard.run !== 'function') return adapter
  const once = method => async (...args) => {
    guard.run()
    return method(...args)
  }
  return new Proxy(adapter, {
    get(target, property) {
      if (property === 'prepareCall' && typeof target.prepareCall === 'function') {
        return async (...args) => {
          guard.run()
          const call = await target.prepareCall(...args)
          return call
        }
      }
      if (property === 'stream') return once(options => target.stream(options))
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
