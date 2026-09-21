const isDisplayableWindow = window => Number.isFinite(window?.remainingPercent)
  && window.remainingPercent >= 0
  && window.remainingPercent <= 100
  && Number.isFinite(window?.windowSeconds)
  && window.windowSeconds > 0

const normalized = value => String(value ?? '').toLocaleLowerCase('en-US')
  .replaceAll(/[^a-z0-9]+/gu, '-')

const exactModelLimit = (limit, model) => {
  const id = normalized(model)
  return id.length > 0 && [limit?.id, limit?.name]
    .some(value => typeof value === 'string' && normalized(value) === id)
}

const limitMatchesModel = (limit, model, hasExactLimit) => {
  if (hasExactLimit) return exactModelLimit(limit, model)
  // Reserve is a separate route. Missing quota is unknown, not ordinary Codex quota.
  if (normalized(model) === 'gpt-reserve') return false
  if (/\bspark\b/u.test(normalized(model))) {
    return /\bspark\b/u.test(normalized(`${limit?.id ?? ''} ${limit?.name ?? ''}`))
  }
  return limit?.id === 'codex'
}

export function selectModelQuotaWindows(usage, model) {
  const hasExactLimit = Array.isArray(usage?.rateLimits)
    && usage.rateLimits.some(limit => exactModelLimit(limit, model))
  const windows = Array.isArray(usage?.rateLimits)
    ? usage.rateLimits
      .filter(limit => limitMatchesModel(limit, model, hasExactLimit) && Array.isArray(limit.windows))
      .flatMap(limit => limit.windows)
      .filter(isDisplayableWindow)
    : []
  return windows.map(selected => ({
    remainingPercent: selected.remainingPercent,
    windowSeconds: selected.windowSeconds,
    ...(Number.isSafeInteger(selected.resetsAt) ? { resetsAt: selected.resetsAt } : {}),
    ...(selected.forecast === undefined ? {} : { forecast: selected.forecast }),
  })).sort((a, b) => a.windowSeconds - b.windowSeconds)
}

export function selectModelQuota(usage, model) {
  const windows = selectModelQuotaWindows(usage, model)
  if (windows.length === 0) return undefined
  const selected = windows.reduce((lowest, candidate) => (
    candidate.remainingPercent < lowest.remainingPercent ? candidate : lowest
  ))
  return {
    remainingPercent: selected.remainingPercent,
    windowSeconds: selected.windowSeconds,
    ...(Number.isSafeInteger(selected.resetsAt) ? { resetsAt: selected.resetsAt } : {}),
    ...(selected.forecast === undefined ? {} : { forecast: selected.forecast }),
  }
}
