export const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const DEFAULT_TTL_MS = 60_000
const DEFAULT_TIMEOUT_MS = 15_000

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function windowOf(value) {
  if (value === undefined || value === null) return undefined
  if (!record(value)) throw new Error('Codex returned a malformed rate-limit window')
  const used = value.used_percent
  const seconds = value.limit_window_seconds
  if (!Number.isFinite(used) || used < 0 || used > 100) throw new Error('Codex returned an invalid used percentage')
  if (!Number.isInteger(seconds) || seconds <= 0) throw new Error('Codex returned an invalid window duration')
  const resetsAt = epochSeconds(value.reset_at, 'rate-limit reset time')
  return {
    usedPercent: used,
    remainingPercent: 100 - used,
    windowSeconds: seconds,
    ...(resetsAt === undefined ? {} : { resetsAt }),
  }
}

function limitOf(id, name, value) {
  if (value === undefined || value === null) return undefined
  if (!record(value)) throw new Error('Codex returned malformed rate-limit details')
  const windows = [windowOf(value.primary_window), windowOf(value.secondary_window)].filter(Boolean)
  return windows.length === 0 ? undefined : { id, ...(name ? { name } : {}), windows }
}

function decimal(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64 || !/^-?\d+(?:\.\d+)?$/u.test(value)) {
    throw new Error(`Codex returned an invalid ${label}`)
  }
  return value
}

function epochSeconds(value, label) {
  if (value === undefined || value === null || value === 0) return undefined
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Codex returned an invalid ${label}`)
  return value
}

function creditsOf(value) {
  if (value === undefined || value === null) return undefined
  if (!record(value) || typeof value.has_credits !== 'boolean' || typeof value.unlimited !== 'boolean') {
    throw new Error('Codex returned malformed credit details')
  }
  if (!value.has_credits) return undefined
  return {
    unlimited: value.unlimited,
    ...(value.balance === undefined || value.balance === null ? {} : { balance: decimal(value.balance, 'credit balance') }),
  }
}

function individualOf(value) {
  if (value === undefined || value === null) return undefined
  if (!record(value)) throw new Error('Codex returned malformed spend control')
  const item = value.individual_limit
  if (item === undefined || item === null) return undefined
  if (!record(item) || !Number.isFinite(item.remaining_percent)
    || item.remaining_percent < 0 || item.remaining_percent > 100) {
    throw new Error('Codex returned an invalid individual-limit percentage')
  }
  const resetsAt = epochSeconds(item.reset_at, 'individual-limit reset time')
  return {
    limit: decimal(item.limit, 'individual limit'),
    used: decimal(item.used, 'individual usage'),
    remainingPercent: item.remaining_percent,
    ...(resetsAt === undefined ? {} : { resetsAt }),
  }
}

function spendControlReachedOf(value) {
  if (value === undefined || value === null) return undefined
  if (!record(value)) throw new Error('Codex returned malformed spend control')
  if (value.reached === undefined || value.reached === null) return undefined
  if (typeof value.reached !== 'boolean') throw new Error('Codex returned an invalid spend-control state')
  return value.reached
}

function resetCreditsOf(value) {
  if (value === undefined || value === null) return undefined
  if (!record(value) || !Number.isSafeInteger(value.available_count) || value.available_count < 0) {
    throw new Error('Codex returned malformed reset credit details')
  }
  return { availableCount: value.available_count }
}

/** Reduce the provider payload to a browser-safe quota projection. */
export function parseCodexUsage(value) {
  if (!record(value)) throw new Error('Codex returned a malformed usage response')
  const rateLimits = []
  const seenLimitIds = new Set()
  const addLimit = limit => {
    if (limit === undefined || seenLimitIds.has(limit.id)) return
    seenLimitIds.add(limit.id)
    rateLimits.push(limit)
  }
  const primary = limitOf('codex', 'Codex', value.rate_limit)
  addLimit(primary)
  if (value.additional_rate_limits !== undefined && value.additional_rate_limits !== null
    && !Array.isArray(value.additional_rate_limits)) {
    throw new Error('Codex returned malformed additional rate limits')
  }
  for (const entry of value.additional_rate_limits ?? []) {
    if (!record(entry) || typeof entry.metered_feature !== 'string' || entry.metered_feature.length === 0) {
      throw new Error('Codex returned a malformed additional rate limit')
    }
    if (entry.limit_name !== undefined && entry.limit_name !== null && typeof entry.limit_name !== 'string') {
      throw new Error('Codex returned an invalid additional rate-limit name')
    }
    addLimit(limitOf(entry.metered_feature, entry.limit_name || undefined, entry.rate_limit))
  }
  addLimit(limitOf('code_review', 'Code review', value.code_review_rate_limit))
  const credits = creditsOf(value.credits)
  const individualLimit = individualOf(value.spend_control)
  const spendControlReached = spendControlReachedOf(value.spend_control)
  const resetCredits = resetCreditsOf(value.rate_limit_reset_credits)
  return {
    rateLimits,
    ...(credits === undefined ? {} : { credits }),
    ...(individualLimit === undefined ? {} : { individualLimit }),
    ...(spendControlReached === undefined ? {} : { spendControlReached }),
    ...(resetCredits === undefined ? {} : { resetCredits }),
  }
}

const requestSignal = (signal, timeoutMs) => {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

/**
 * Read quota through the same refreshable OAuth lifecycle used by model turns.
 * The browser receives only a parsed quota projection; bearer and account id
 * are request-local host values. Concurrent settings polls share one request.
 */
export function createCodexUsageReader(options) {
  const getAuth = options.getAuth
  const readCredential = options.readCredential
  const fetchUsage = options.fetch ?? fetch
  const now = options.now ?? Date.now
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let cached
  let inFlight

  const load = async signal => {
    const auth = await getAuth({ signal })
    const credential = await readCredential({ signal })
    const access = auth?.auth?.apiKey
    const accountId = credential?.type === 'oauth' ? credential.accountId : undefined
    if (typeof access !== 'string' || access.length === 0
      || typeof accountId !== 'string' || accountId.length === 0) {
      throw new Error('ChatGPT subscription is not signed in')
    }
    const response = await fetchUsage(CODEX_USAGE_URL, {
      method: 'GET',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${access}`,
        'chatgpt-account-id': accountId,
        accept: 'application/json',
        'cache-control': 'no-store',
        'user-agent': 'dsh-codex-subscription/0.3.0',
      },
      signal: requestSignal(signal, timeoutMs),
    })
    if (!response.ok) {
      throw new Error(response.status === 401 || response.status === 403
        ? 'ChatGPT sign-in needs to be renewed'
        : `ChatGPT usage request failed (HTTP ${response.status})`)
    }
    let value
    try {
      value = await response.json()
    } catch {
      throw new Error('ChatGPT returned an unreadable usage response')
    }
    return { ...parseCodexUsage(value), fetchedAt: now() }
  }

  return Object.freeze({
    read({ force = false, signal } = {}) {
      if (!force && cached !== undefined && now() - cached.fetchedAt < ttlMs) {
        return Promise.resolve(structuredClone(cached))
      }
      if (inFlight !== undefined) return inFlight.then(structuredClone)
      const current = load(signal)
        .then(value => {
          cached = structuredClone(value)
          return structuredClone(value)
        })
        .finally(() => {
          if (inFlight === current) inFlight = undefined
        })
      inFlight = current
      return current
    },
    clear() {
      cached = undefined
    },
  })
}
