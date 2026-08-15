const isDisplayableWindow = window => Number.isFinite(window?.remainingPercent)
  && window.remainingPercent >= 0
  && window.remainingPercent <= 100
  && Number.isFinite(window?.windowSeconds)
  && window.windowSeconds > 0

const normalized = value => String(value ?? '').toLocaleLowerCase('en-US')
  .replaceAll(/[^a-z0-9]+/gu, '-')

const limitMatchesModel = (limit, model) => {
  if (/\bspark\b/u.test(normalized(model))) {
    return /\bspark\b/u.test(normalized(`${limit?.id ?? ''} ${limit?.name ?? ''}`))
  }
  return limit?.id === 'codex'
}

export function selectModelQuota(usage, model) {
  const windows = Array.isArray(usage?.rateLimits)
    ? usage.rateLimits
      .filter(limit => limitMatchesModel(limit, model) && Array.isArray(limit.windows))
      .flatMap(limit => limit.windows)
      .filter(isDisplayableWindow)
    : []
  if (windows.length === 0) return undefined
  const selected = windows.reduce((lowest, candidate) => (
    candidate.remainingPercent < lowest.remainingPercent ? candidate : lowest
  ))
  return {
    remainingPercent: selected.remainingPercent,
    windowSeconds: selected.windowSeconds,
    ...(Number.isSafeInteger(selected.resetsAt) ? { resetsAt: selected.resetsAt } : {}),
  }
}
