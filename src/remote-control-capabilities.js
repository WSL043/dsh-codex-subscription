const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const decimal = value => typeof value === 'string' && /^-?\d+(?:\.\d+)?$/u.test(value) ? value : null
const integer = value => Number.isSafeInteger(value) && value >= 0
const percentage = value => Number.isFinite(value) && value >= 0 && value <= 100
const plans = new Set(['free', 'go', 'plus', 'pro', 'prolite', 'promax', 'team', 'self_serve_business_prolite', 'self_serve_business_usage_based', 'business', 'ent26', 'enterprise_cbp_automation', 'enterprise_cbp_usage_based', 'enterprise', 'edu', 'edu_plus', 'edu_pro', 'unknown'])
const reachedTypes = new Set(['rate_limit_reached', 'workspace_owner_credits_depleted', 'workspace_member_credits_depleted', 'workspace_owner_usage_limit_reached', 'workspace_member_usage_limit_reached'])

function creditsOf(value) {
  // The safe usage reader creates this object only when has_credits was true.
  if (!record(value) || typeof value.unlimited !== 'boolean') return null
  return { hasCredits: true, unlimited: value.unlimited, balance: decimal(value.balance) }
}

function individualOf(value) {
  // All four fields are required by the phone protocol. A missing reset is not 0.
  if (!record(value) || decimal(value.limit) === null || decimal(value.used) === null
    || !percentage(value.remainingPercent) || !integer(value.resetsAt)) return null
  return { limit: value.limit, used: value.used, remainingPercent: Math.round(value.remainingPercent), resetsAt: value.resetsAt }
}

const windowOf = value => record(value) && percentage(value.usedPercent) ? {
  usedPercent: Math.round(value.usedPercent),
  windowDurationMins: Number.isFinite(value.windowSeconds) && value.windowSeconds > 0 ? Math.round(value.windowSeconds / 60) : null,
  resetsAt: integer(value.resetsAt) ? value.resetsAt : null,
} : null

/** Project the existing safe usage reading into the app-server account snapshot. */
export function phoneRateLimits(read) {
  const limits = Array.isArray(read?.rateLimits) ? read.rateLimits : []
  const main = limits.find(limit => limit.id === 'codex') ?? limits[0]
  const accountBucket = limit => limit === main && (limit === undefined || limit.id === 'codex')
  const snapshot = limit => ({
    limitId: limit?.id ?? 'codex', limitName: limit?.name ?? null, normalModelSlug: null,
    primary: windowOf(limit?.windows?.[0]), secondary: windowOf(limit?.windows?.[1]),
    // These are account-wide Codex figures, not per-review/other-bucket balances.
    credits: accountBucket(limit) ? creditsOf(read?.credits) : null,
    individualLimit: accountBucket(limit) ? individualOf(read?.individualLimit) : null,
    spendControlReached: typeof read?.spendControlReached === 'boolean' ? read.spendControlReached : null,
    planType: read?.planType == null ? null : plans.has(read.planType) ? read.planType : 'unknown',
    rateLimitReachedType: reachedTypes.has(read?.rateLimitReachedType) ? read.rateLimitReachedType : null,
  })
  const resets = read?.resetCredits
  return {
    ordinaryUsageAllowed: null, rateLimits: snapshot(main),
    rateLimitsByLimitId: read ? Object.fromEntries(limits.map(limit => [limit.id, snapshot(limit)])) : null,
    // The safe reader omits service ids/grant dates. Do not manufacture actionable
    // rows from titles and expiries; null means only the authoritative count is known.
    rateLimitResetCredits: record(resets) && integer(resets.availableCount) ? { availableCount: resets.availableCount, credits: null } : null,
    accountId: null, rateLimitUpsell: null,
  }
}

/** Migration hints use the same provider/model identity as the phone model picker. */
export function phoneModelUpgrade(metadata, encodeModel) {
  const target = metadata?.upgradeTo ?? metadata?.retirement?.upgradeTo
  if (typeof target !== 'string' || !target.trim() || target.length > 256 || /[\u0000-\u001f\u007f]/u.test(target)) {
    return { upgrade: null, upgradeInfo: null }
  }
  const model = encodeModel(target)
  const at = metadata?.retirement?.at
  return {
    upgrade: model,
    upgradeInfo: {
      model, retirementAt: integer(at) && at > 0 ? Math.floor(at / 1000) : null,
      upgradeCopy: null, modelLink: null, migrationMarkdown: null,
    },
  }
}
