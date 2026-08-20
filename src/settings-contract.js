export const SETTINGS_NAMESPACE = 'codex-subscription'
export const QUICK_QUOTA_FIELD = 'quickQuotaVisible'
export const DEFAULT_QUICK_QUOTA_VISIBLE = false
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

export const supportsCodexFastMode = modelId => typeof modelId === 'string' && (
  /^gpt-5\.(?:5|6)(?:$|-)/u.test(modelId) || modelId === 'gpt-5.4'
)
