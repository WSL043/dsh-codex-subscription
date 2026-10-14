// A request that fails before it reaches the network does so deterministically:
// the same model, context and options fail the same way. This keeps a copy of
// that input with every piece of text replaced by a same-length filler, so a
// support report carries enough to replay the failure without carrying anything
// the person wrote. `undefined` is kept as a marker because "missing" and
// "undefined" are exactly what such failures turn on.
const KEEP = new Set(['method', 'type', 'role', 'name', 'api', 'provider', 'model', 'stopReason', 'reasoning', 'reasoningEffort', 'transport', 'mimeType', 'kind', 'effort', 'toolChoice', 'cacheRetention', 'textVerbosity', 'serviceTier'])
const DROP = new Set(['apiKey', 'headers', 'env', 'authorization', 'token', 'signal', 'fetch', 'cookie'])
const MAX_DEPTH = 10
const MAX_ARRAY = 40
const MAX_KEYS = 80
const MAX_NODES = 4000
const MAX_TEXT = 64

export const UNDEFINED_MARKER = '$undefined'

export function redactRequest(value) {
  let nodes = 0
  const walk = (item, key, depth) => {
    nodes += 1
    if (nodes > MAX_NODES) return { $truncated: 'nodes' }
    if (item === undefined) return { [UNDEFINED_MARKER]: true }
    if (item === null || typeof item === 'boolean') return item
    if (typeof item === 'number') return Number.isFinite(item) ? item : { $number: String(item) }
    if (typeof item === 'bigint' || typeof item === 'symbol') return { $type: typeof item }
    if (typeof item === 'function') return { $type: 'function' }
    if (typeof item === 'string') {
      if (KEEP.has(key) && item.length <= MAX_TEXT) return item
      return item.length <= MAX_TEXT ? 'x'.repeat(item.length) : { $text: item.length }
    }
    if (depth >= MAX_DEPTH) return { $truncated: 'depth' }
    if (Array.isArray(item)) {
      const list = []
      for (let index = 0; index < Math.min(item.length, MAX_ARRAY); index += 1) list.push(index in item ? walk(item[index], key, depth + 1) : { $hole: true })
      return item.length > MAX_ARRAY ? [...list, { $more: item.length - MAX_ARRAY }] : list
    }
    if (item instanceof Uint8Array) return { $bytes: item.byteLength }
    if (typeof item === 'object') {
      const entries = Object.keys(item).filter(name => !DROP.has(name))
      const out = {}
      for (const name of entries.slice(0, MAX_KEYS)) out[name] = walk(item[name], name, depth + 1)
      if (entries.length > MAX_KEYS) out.$moreKeys = entries.length - MAX_KEYS
      return out
    }
    return { $type: typeof item }
  }
  return walk(value, '', 0)
}

/** Inverse of {@link redactRequest} for markers that matter when replaying. */
export function reviveRequest(value) {
  if (Array.isArray(value)) return value.filter(item => !(item && typeof item === 'object' && ('$more' in item))).map(reviveRequest)
  if (value && typeof value === 'object') {
    if (UNDEFINED_MARKER in value) return undefined
    if ('$text' in value) return 'x'.repeat(Math.min(value.$text, 4096))
    return Object.fromEntries(Object.entries(value).filter(([name]) => !name.startsWith('$')).map(([name, item]) => [name, reviveRequest(item)]))
  }
  return value
}
