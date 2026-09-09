import { readImageFeatures, readImageDefaults, imageFeaturePatch } from './image-features.js'
export const CUSTOM_CONTEXT_OVERRIDES_FIELD = 'customContextModels'
export const SEARCH_MODE_FIELD = 'searchMode'
export const SEARCH_DOMAINS_FIELD = 'searchDomains'
export const QUOTA_ALERTS_FIELD = 'quotaAlerts'
export const SEARCH_MODES = ['live', 'cached', 'disabled']
export const QUOTA_ALERT_MODES = ['off', 'important', 'early', 'custom']
export const QUOTA_THRESHOLD_FIELDS = ['quotaShortThreshold', 'quotaLongThreshold']
export const validQuotaThreshold = value => Number.isInteger(value) && value >= 1 && value <= 100
export const MAX_CONTEXT_BUDGET = 16_000_000
export const validModelKey = key => typeof key === 'string'
  && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,95}$/u.test(key)
  && !['constructor', 'prototype', '__proto__'].includes(key)

export function normalizeContextOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([key, size]) => validModelKey(key)
    && Number.isSafeInteger(size) && size > 0 && size <= MAX_CONTEXT_BUDGET).slice(0, 64))
}

export function normalizeSearchDomains(value) {
  if (!Array.isArray(value) || value.length > 20) throw new Error('Invalid search domains')
  return [...new Set(value.map(item => {
    if (typeof item !== 'string' || item.length > 253 || !/^[\p{L}\p{N}.-]+$/u.test(item)) throw new Error('Invalid search domain')
    const hostname = new URL(`https://${item}`).hostname.toLowerCase()
    if (!hostname.includes('.') || hostname.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(part))) throw new Error('Invalid search domain')
    return hostname
  }))]
}

export function readCapabilitySettings(value = {}) {
  return {
    ...Object.fromEntries(QUOTA_THRESHOLD_FIELDS.map(key => [key, validQuotaThreshold(value[key]) ? value[key] : 20])),
    ...readImageFeatures(value),
    ...readImageDefaults(value),
    [CUSTOM_CONTEXT_OVERRIDES_FIELD]: normalizeContextOverrides(value[CUSTOM_CONTEXT_OVERRIDES_FIELD]),
    [SEARCH_MODE_FIELD]: SEARCH_MODES.includes(value[SEARCH_MODE_FIELD]) ? value[SEARCH_MODE_FIELD] : 'live',
    [SEARCH_DOMAINS_FIELD]: normalizeSearchDomains(value[SEARCH_DOMAINS_FIELD] ?? []),
    [QUOTA_ALERTS_FIELD]: QUOTA_ALERT_MODES.includes(value[QUOTA_ALERTS_FIELD]) ? value[QUOTA_ALERTS_FIELD] : 'important',
  }
}

export function capabilityPatch(payload) {
  const patch = imageFeaturePatch(payload ?? {})
  for (const field of QUOTA_THRESHOLD_FIELDS) {
    if (!Object.hasOwn(payload ?? {}, field)) continue
    if (!validQuotaThreshold(payload[field])) throw new Error('Threshold must be an integer from 1 to 100')
    patch[field] = payload[field]
  }
  for (const [key, choices] of [[SEARCH_MODE_FIELD, SEARCH_MODES], [QUOTA_ALERTS_FIELD, QUOTA_ALERT_MODES]]) {
    if (!Object.hasOwn(payload ?? {}, key)) continue
    if (!choices.includes(payload[key])) throw new Error('Invalid capability preference')
    patch[key] = payload[key]
  }
  if (Object.hasOwn(payload ?? {}, SEARCH_DOMAINS_FIELD)) patch[SEARCH_DOMAINS_FIELD] = normalizeSearchDomains(payload[SEARCH_DOMAINS_FIELD])
  if (Object.hasOwn(payload ?? {}, CUSTOM_CONTEXT_OVERRIDES_FIELD)) {
    const original = payload[CUSTOM_CONTEXT_OVERRIDES_FIELD]
    const normalized = normalizeContextOverrides(original)
    if (JSON.stringify(normalized) !== JSON.stringify(original)) throw new Error('Invalid model context preferences')
    patch[CUSTOM_CONTEXT_OVERRIDES_FIELD] = normalized
  }
  return patch
}

export function quotaWarning(usage, mode = 'important', now = Date.now(), thresholds = {}) {
  if (mode === 'off' || !Number.isFinite(usage?.fetchedAt) || usage.fetchedAt > now || now - usage.fetchedAt > 5 * 60_000) return undefined
  const candidates = (usage.rateLimits ?? []).filter(limit => limit.id !== 'code_review')
    .flatMap(limit => (limit.windows ?? []).map(window => ({ ...window, limitId: limit.id })))
    .filter(window => Number.isFinite(window.remainingPercent) && window.remainingPercent >= 0
      && window.remainingPercent <= (mode === 'custom' ? readCapabilitySettings(thresholds)[window.windowSeconds > 0 && window.windowSeconds <= 6 * 3600 ? 'quotaShortThreshold' : 'quotaLongThreshold'] : mode === 'early' && window.windowSeconds > 0 && window.windowSeconds <= 6 * 3600 ? 50 : 20)
      && (!Number.isFinite(window.resetsAt) || window.resetsAt * 1000 > now))
  return candidates.sort((a, b) => a.remainingPercent - b.remainingPercent)[0]
}
