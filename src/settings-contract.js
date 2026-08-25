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
export const CONTEXT_MODE_FIELD = 'contextMode'
export const CONTEXT_MODE_STANDARD = 'standard'
export const CONTEXT_MODE_EXTENDED = 'extended'
export const CONTEXT_MODE_CUSTOM = 'custom'
export const DEFAULT_CONTEXT_MODE = CONTEXT_MODE_STANDARD
export const CUSTOM_CONTEXT_WINDOW_FIELD = 'customContextWindow'
export const DEFAULT_CUSTOM_CONTEXT_WINDOW = 272_000
export const MIN_CUSTOM_CONTEXT_WINDOW = 128_000
export const MAX_CUSTOM_CONTEXT_WINDOW = 1_000_000
export const CUSTOM_CONTEXT_MODEL_FIELDS = Object.freeze({
  'gpt-5.4': 'customContextGpt54',
  'gpt-5.4-mini': 'customContextGpt54Mini',
  'gpt-5.5': 'customContextGpt55',
  'gpt-5.6': 'customContextGpt56',
})
export const CUSTOM_CONTEXT_MODEL_CAPS = Object.freeze({
  'gpt-5.4': 1_000_000,
  'gpt-5.4-mini': 400_000,
  'gpt-5.5': 1_000_000,
  'gpt-5.6': 1_000_000,
})
export const CUSTOM_CONTEXT_MODEL_DEFAULTS = Object.freeze({
  'gpt-5.4': 272_000,
  'gpt-5.4-mini': 272_000,
  'gpt-5.5': 272_000,
  'gpt-5.6': 272_000,
})

export const normalizeSearchProvider = value => [SEARCH_PROVIDER_DSH, SEARCH_PROVIDER_CODEX].includes(value)
  ? value
  : DEFAULT_SEARCH_PROVIDER

export const normalizeSpeedMode = value => [SPEED_MODE_STANDARD, SPEED_MODE_FAST].includes(value)
  ? value
  : DEFAULT_SPEED_MODE

export const normalizeContextMode = value => [CONTEXT_MODE_STANDARD, CONTEXT_MODE_EXTENDED, CONTEXT_MODE_CUSTOM].includes(value)
  ? value
  : DEFAULT_CONTEXT_MODE

export const normalizeCustomContextWindow = (value, maximum = MAX_CUSTOM_CONTEXT_WINDOW) => {
  if (!Number.isInteger(value)) return DEFAULT_CUSTOM_CONTEXT_WINDOW
  return Math.min(Math.max(value, MIN_CUSTOM_CONTEXT_WINDOW), maximum)
}

export const formatContextWindow = value => value === 1_000_000 ? '1M' : `${Math.round(value / 1_000)}K`

export const parseContextWindow = value => {
  const match = /^\s*(\d+)\s*$/u.exec(String(value))
  if (match === null) return Number.NaN
  return Number(match[1])
}

export const customContextModelKey = modelId => modelId?.startsWith('gpt-5.6-') ? 'gpt-5.6' : modelId

export function contextModelGroups(models) {
  const groups = new Map()
  for (const model of models ?? []) {
    if (model?.id === 'gpt-5.3-codex-spark') {
      groups.set(model.id, { key: model.id, label: model.name ?? model.id, maximum: 128_000, fixed: true })
      continue
    }
    const key = customContextModelKey(model?.id)
    if (!Object.hasOwn(CUSTOM_CONTEXT_MODEL_FIELDS, key)) continue
    if (key !== 'gpt-5.6') {
      groups.set(key, { key, label: model.name ?? model.id, maximum: CUSTOM_CONTEXT_MODEL_CAPS[key] })
      continue
    }
    const variant = String(model.name ?? model.id).replace(/^GPT-5\.6[ -]/iu, '')
    const current = groups.get(key)
    groups.set(key, {
      key,
      label: `GPT-5.6 ${current === undefined ? variant : `${current.label.replace(/^GPT-5\.6 /u, '')} / ${variant}`}`,
      maximum: CUSTOM_CONTEXT_MODEL_CAPS[key],
    })
  }
  return [...groups.values()]
}

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
