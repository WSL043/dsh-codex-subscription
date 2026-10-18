// Why a usage-history period has no figure: the official report leaves used_basis_points null both for the week that is
// still running and for ones it has not caught up on (data_as_of trails today by days). The two read differently.
export function pendingReason(period, now = Date.now()) {
  if (period.usedPercent !== undefined) return undefined
  return period.endsAt > now ? 'current' : 'past'
}
