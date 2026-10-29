// Codex ModelInfo defaults to 95 when older account catalogs omit the field.
// Keep catalog/settings windows raw; apply this once at the DSH adapter boundary.
export const effectiveContextPercent = value => Number.isInteger(value) && value > 0 && value <= 100 ? value : 95

export function effectiveContextWindow(window, percent) {
  return Number.isSafeInteger(window) && window > 0
    ? Math.floor(window * effectiveContextPercent(percent) / 100)
    : window
}

/** Match DSH basic compaction's default pressure budget, using an already effective window.
 * maxTokens is the routed request's local output reservation, not the model's output ceiling.
 * Ratio and headroom are alternative pressure limits: do not subtract them successively.
 */
export function compactionThreshold(window, maxTokens, configured) {
  if (configured !== undefined && (!Number.isSafeInteger(configured) || configured < 1000)) throw new Error('Invalid compaction threshold')
  const reserved = maxTokens ?? 0
  if (!Number.isSafeInteger(reserved) || reserved < 0) throw new Error('Invalid compaction output reservation')
  if (window === undefined || window === null) return configured ?? 100000
  if (!Number.isSafeInteger(window) || window <= 0) throw new Error('Invalid Codex context window')
  const pressure = window - reserved - 65536
  const limit = Math.floor(Math.min(window * 0.8, pressure, configured ?? Infinity))
  if (limit < 1000) throw new Error('Codex context budget is too small for the requested output reservation and compaction headroom')
  return limit
}
