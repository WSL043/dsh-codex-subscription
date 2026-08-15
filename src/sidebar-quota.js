const isDisplayableWindow = window => Number.isFinite(window?.remainingPercent)
  && window.remainingPercent >= 0
  && window.remainingPercent <= 100
  && Number.isFinite(window?.windowSeconds)
  && window.windowSeconds > 0

export function selectSidebarQuota(usage) {
  const windows = Array.isArray(usage?.rateLimits)
    ? usage.rateLimits
      .filter(limit => limit?.id === 'codex' && Array.isArray(limit.windows))
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
