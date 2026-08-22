export const SETTINGS_NAMESPACE = 'codex-subscription'
export const QUICK_QUOTA_MODE_FIELD = 'quickQuotaMode'
export const LEGACY_QUICK_QUOTA_FIELD = 'quickQuotaVisible'
export const QUICK_QUOTA_MODE_OFF = 'off'
export const QUICK_QUOTA_MODE_PERCENT = 'percent'
export const QUICK_QUOTA_MODE_BAR = 'bar'
export const DEFAULT_QUICK_QUOTA_MODE = QUICK_QUOTA_MODE_OFF
export const SEARCH_PROVIDER_FIELD = 'searchProvider'
export const SEARCH_PROVIDER_DSH = 'dsh'
export const SEARCH_PROVIDER_CODEX = 'codex'
export const DEFAULT_SEARCH_PROVIDER = SEARCH_PROVIDER_DSH
export const SPEED_MODE_FIELD = 'speedMode'
export const SPEED_MODE_STANDARD = 'standard'
export const SPEED_MODE_FAST = 'fast'
export const DEFAULT_SPEED_MODE = SPEED_MODE_STANDARD

export const normalizeSearchProvider = value => [SEARCH_PROVIDER_DSH, SEARCH_PROVIDER_CODEX].includes(value)
  ? value
  : DEFAULT_SEARCH_PROVIDER

export const normalizeSpeedMode = value => [SPEED_MODE_STANDARD, SPEED_MODE_FAST].includes(value)
  ? value
  : DEFAULT_SPEED_MODE

export const normalizeQuickQuotaMode = (value, legacyVisible = false) => (
  [QUICK_QUOTA_MODE_OFF, QUICK_QUOTA_MODE_PERCENT, QUICK_QUOTA_MODE_BAR].includes(value)
    ? value
    : legacyVisible === true
      ? QUICK_QUOTA_MODE_PERCENT
      : DEFAULT_QUICK_QUOTA_MODE
)

export const supportsCodexFastMode = modelId => typeof modelId === 'string' && (
  /^gpt-5\.(?:5|6)(?:$|-)/u.test(modelId) || modelId === 'gpt-5.4'
)
