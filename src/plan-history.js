import { readSubscriptionCredentials } from './subscription-credentials.js'
import { USER_AGENT } from './version.js'

// The seven-day allowance history the official Codex /usage dashboard reads: one row per allowance period
// with how much of that period's allowance was used and what the use was spent on.
export const CODEX_PLAN_HISTORY_URL = 'https://chatgpt.com/backend-api/wham/usage/plan_limit_history?days=7'
const DIMENSIONS = Object.freeze(['model', 'surface', 'thread_source', 'turn_trigger'])
const TTL_MS = 5 * 60_000
const FAILURE_TTL_MS = 30_000
const TIMEOUT_MS = 15_000
const MAX_PERIODS = 64
const MAX_ROWS = 24

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value, max = 64) => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined)
const timestamp = value => {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
}
const percent = basisPoints => (Number.isFinite(basisPoints) && basisPoints >= 0 ? Math.round(basisPoints) / 100 : undefined)

/** Reduce the provider payload to a browser-safe projection; anything malformed is dropped, never an error. */
export function parsePlanHistory(value) {
  if (!record(value) || !Array.isArray(value.periods)) throw new Error('Codex returned a malformed usage history')
  const periods = []
  for (const raw of value.periods.slice(0, MAX_PERIODS)) {
    if (!record(raw)) continue
    const startsAt = timestamp(raw.starts_at), endsAt = timestamp(raw.ends_at)
    if (startsAt === undefined || endsAt === undefined || endsAt <= startsAt) continue
    const breakdowns = {}
    for (const group of Array.isArray(raw.breakdowns) ? raw.breakdowns : []) {
      if (!record(group) || !DIMENSIONS.includes(group.dimension) || !Array.isArray(group.rows)) continue
      const rows = group.rows
        .map(row => ({ key: text(row?.key, 96), percent: percent(row?.basis_points) }))
        .filter(row => row.key !== undefined && row.percent !== undefined && row.percent > 0)
        .slice(0, MAX_ROWS)
      if (rows.length > 0) breakdowns[group.dimension] = rows
    }
    periods.push({
      startsAt, endsAt,
      ...(Number.isInteger(raw.window_minutes) && raw.window_minutes > 0 ? { windowMinutes: raw.window_minutes } : {}),
      ...(text(raw.plan_type, 32) === undefined ? {} : { planType: raw.plan_type }),
      complete: raw.accounting_complete === true,
      ...(percent(raw.used_basis_points) === undefined ? {} : { usedPercent: percent(raw.used_basis_points) }),
      breakdowns,
    })
  }
  const asOf = timestamp(value.data_as_of), start = timestamp(value.coverage_start)
  return {
    periods,
    coverageComplete: value.coverage_complete === true,
    approximate: value.approximate !== false,
    ...(asOf === undefined ? {} : { asOf }),
    ...(start === undefined ? {} : { coverageStart: start }),
  }
}

/** Reads one authenticated report through the same credentials as the quota reader; a 404 means the account has no such report. */
export function createReportReader({ url, parse, label, getAuth, readCredential, fetch: fetchReport = fetch, now = Date.now, ttlMs = TTL_MS }) {
  let cached, failed, inFlight, generation = 0
  const load = async signal => {
    const { access, accountId } = await readSubscriptionCredentials(getAuth, readCredential, signal)
    if (typeof access !== 'string' || access.length === 0 || typeof accountId !== 'string' || accountId.length === 0) {
      throw new Error('ChatGPT subscription is not signed in')
    }
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    const response = await fetchReport(url, {
      method: 'GET', redirect: 'error',
      headers: { authorization: `Bearer ${access}`, 'chatgpt-account-id': accountId, accept: 'application/json', 'cache-control': 'no-store', 'user-agent': USER_AGENT },
      signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
    })
    if (response.status === 404) return { available: false, fetchedAt: now() }
    if (!response.ok) {
      throw new Error(response.status === 401 || response.status === 403 ? 'ChatGPT sign-in needs to be renewed' : `ChatGPT ${label} request failed (HTTP ${response.status})`)
    }
    let body
    try { body = await response.json() } catch { throw new Error(`ChatGPT returned an unreadable ${label}`) }
    return { available: true, ...parse(body), fetchedAt: now() }
  }
  return Object.freeze({
    read({ force = false, signal } = {}) {
      if (failed !== undefined && now() < failed.retryAt) return Promise.reject(new Error(failed.message))
      if (!force && cached !== undefined && now() - cached.fetchedAt < ttlMs) return Promise.resolve(structuredClone(cached))
      if (inFlight !== undefined) return inFlight.then(structuredClone)
      const current = generation
      const run = load(signal)
        .then(value => { if (generation === current) { cached = structuredClone(value); failed = undefined } return structuredClone(value) })
        .catch(error => {
          if (generation === current && error?.name !== 'AbortError') failed = { message: error instanceof Error ? error.message : `ChatGPT ${label} request failed`, retryAt: now() + FAILURE_TTL_MS }
          throw error
        })
        .finally(() => { if (inFlight === run) inFlight = undefined })
      inFlight = run
      return run
    },
    clear() { generation += 1; cached = undefined; failed = undefined; inFlight = undefined },
  })
}

export const createPlanHistoryReader = options => createReportReader({ ...options, url: CODEX_PLAN_HISTORY_URL, parse: parsePlanHistory, label: 'usage history' })
