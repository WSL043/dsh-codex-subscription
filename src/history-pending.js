// A successful report can contain only empty period boundaries. Those do not
// establish that the account has a usable report or that figures will arrive later.
export function reportedHistoryPeriods(periods = []) {
  return periods.filter(period => Number.isFinite(period.usedPercent)
    || Object.values(period.breakdowns ?? {}).some(rows => rows.length > 0))
    .sort((a, b) => b.startsAt - a.startsAt)
}

export const historyPeriodKey = period => `${period.startsAt}:${period.endsAt}:${period.windowMinutes ?? ''}`

// Older figures belong to their dated period, never to the current allowance.
export function selectHistoryPeriod(periods, selected, now = Date.now()) {
  return periods.find(period => historyPeriodKey(period) === selected)
    ?? periods.find(period => period.startsAt <= now && period.endsAt > now)
    ?? periods[0]
}
