// Adapted from pi-openai-reasoning@0.2.0, commit 306242f2c802ea4c0067d64d4fd5fd103d89a6b5.
// Copyright (c) 2026 Jose Mocito. MIT; see THIRD_PARTY_NOTICES.md.
/** Preserve native JSON ordering/escaping, stopping traversal before allocating an oversized result. */
export function boundedStringify(input, maxBytes) {
  let remaining = maxBytes, root = true
  const populated = new WeakSet(), rejected = new Error('Unsupported or oversized reasoning history')
  const spend = bytes => { remaining -= bytes; if (remaining < 0) throw rejected }
  const quoted = text => {
    if (text.length + 2 > remaining) throw rejected
    let bytes = 2
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index)
      if ([34, 92, 8, 9, 10, 12, 13].includes(code)) bytes += 2
      else if (code < 32) bytes += 6
      else if (code < 128) bytes++
      else if (code < 2048) bytes += 2
      else if (code >= 0xd800 && code <= 0xdfff) {
        const next = text.charCodeAt(index + 1)
        if (code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index++ } else bytes += 6
      } else bytes += 3
      if (bytes > remaining) throw rejected
    }
    spend(bytes)
  }
  try {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) return undefined
    return JSON.stringify(input, function(key, value) {
      const omitted = value === undefined || typeof value === 'function' || typeof value === 'symbol'
      if (omitted && !Array.isArray(this)) return undefined
      if (root) root = false
      else {
        if (populated.has(this)) spend(1)
        populated.add(this)
        if (!Array.isArray(this)) { quoted(key); spend(1) }
      }
      if (value === null || omitted) spend(4)
      else if (typeof value === 'string') quoted(value)
      else if (typeof value === 'number') spend(Number.isFinite(value) ? String(value).length : 4)
      else if (typeof value === 'boolean') spend(value ? 4 : 5)
      else if (typeof value === 'object') {
        const prototype = Object.getPrototypeOf(value)
        if (JSON.isRawJSON?.(value) || !Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw rejected
        spend(2); populated.delete(value)
      } else throw rejected
      return value
    })
  } catch { return undefined }
}
