// How often to look at the quota: slowly while there is plenty left, quickly as it runs out, the way
// the Codex terminal app does (60 s, then 30 s at 75 %, 15 s at 90 %, 5 s at 99 %).

/** Milliseconds until the next quota read, from the highest used percentage of the windows that matter. */
export function quotaRefreshMs(percent) {
  if (!Number.isFinite(percent)) return 60_000
  if (percent >= 99) return 5_000
  if (percent >= 90) return 15_000
  if (percent >= 75) return 30_000
  return 60_000
}

/** Highest used percentage among windows (objects with usedPercent), or undefined when there are none. */
export function highestUsed(windows) {
  const values = (Array.isArray(windows) ? windows : []).map(window => window?.usedPercent).filter(Number.isFinite)
  return values.length === 0 ? undefined : Math.max(...values)
}
