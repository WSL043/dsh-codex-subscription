export const SETTINGS_NAMESPACE = 'codex-subscription'
export const QUICK_QUOTA_FIELD = 'quickQuotaVisible'
export const DEFAULT_QUICK_QUOTA_VISIBLE = false
export const SEARCH_PROVIDER_FIELD = 'searchProvider'
export const SEARCH_PROVIDER_DSH = 'dsh'
export const SEARCH_PROVIDER_CODEX = 'codex'
export const DEFAULT_SEARCH_PROVIDER = SEARCH_PROVIDER_DSH

export const normalizeSearchProvider = value => [SEARCH_PROVIDER_DSH, SEARCH_PROVIDER_CODEX].includes(value)
  ? value
  : DEFAULT_SEARCH_PROVIDER
