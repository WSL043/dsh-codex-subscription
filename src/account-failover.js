/**
 * Account-pool failover: when the signed-in account can no longer serve the
 * turn, move the turn to another signed-in account of the same subscription
 * provider instead of failing it.
 *
 * Two failure families qualify, and they qualify for different reasons:
 *
 * - **Quota exhausted.** The server has finished this account's allowance for
 *   the requested window. Waiting inside the same account only helps when the
 *   reset is minutes away (that is `quota-retry.js`); another account can serve
 *   the turn right away. One confirmed exhaustion is enough to move.
 * - **Capacity / overload.** The model is busy, not the account. The account is
 *   still fine, and the request may well succeed on the next attempt. Moving
 *   accounts discards the prompt cache, so this only moves after the same
 *   account fails the same way twice in a row inside one short window.
 *
 * This module owns the decision only. It never touches credentials or the
 * request: the caller supplies `switchAccount`, the already-known account ids,
 * and the wake-up it must perform. That keeps the switch atomic inside the
 * vault and keeps the network catalogue reload in `index.js` where the other
 * account-change invalidations already live.
 *
 * The handler is an `agent/request-error` waterfall listener: returning
 * `{ kind: 'retry' }` re-runs the failed step inside the same open turn.
 */

import { randomUUID } from 'node:crypto'

const MINUTE_MS = 60_000
const DEFAULT_PARK_MS = 10 * MINUTE_MS
const DEFAULT_CAPACITY_STREAK = 2
const DEFAULT_CAPACITY_WINDOW_MS = 5 * MINUTE_MS
// How long a retry waits for the new account's catalogue before trying anyway.
const DEFAULT_MODEL_READY_MS = 15_000
export const MAX_FAILOVER_RETRIES = 3

// Reservation wording that means the account's allowance is spent. pi-ai turns
// Codex's usage_limit_reached into the bounded friendly sentence below, and
// DSH's generic classifier files that text under PI_AI_ERROR because it knows
// "rate limit" but not "usage limit" — so match the sentence, not the code.
const USAGE_LIMIT_MESSAGE = /^You have hit your ChatGPT usage limit(?: \([a-z0-9][a-z0-9 ._-]{0,39} plan\))?\.(?: Try again in ~\d{1,6} min\.)?$/u
const USAGE_LIMIT_HINT = /has hit your ChatGPT usage limit|usage[_ -]?limit[_ -]?reached|usage[_ -]?limit\b|exceeded your current quota|out of budget/iu

// Load wording, in the order the transports report it. A whole-message match is
// required for the bare sentences so a truncated or unrelated error never
// qualifies; the short markers are unambiguous enough to appear anywhere.
const FULL_LOAD_MESSAGE = /^\s*(?:Codex error:\s*)?(?:Our servers are currently overloaded\. Please try again later\.|An error occurred while processing your request\. You can retry your request, or contact us through our help center at help\.openai\.com if the error persists\. Please include the request ID [\w-]+ in your message\.?)\s*$/u
const LOAD_MARKERS = /model is at capacity|at capacity\b|servers are currently (?:busy|overloaded)|currently experiencing high demand|server[_ ]?busy|overloaded|\bover capacity\b|temporarily unavailable/iu

// Refusals the provider itself invites retrying, in the exact wording pi-ai
// forwards. `model-retry-hint.js` promotes these to a retryable SERVER only when
// no HTTP response (or a 2xx one) carried them; a real 5xx header keeps them
// PI_AI_ERROR, and DSH's retry policy then stops. These are the cases where the
// pool handler has to act on the first failure.
const PROVIDER_INVITES_RETRY = /An error occurred while processing your request\. You can retry your request, or contact us through our help center at help\.openai\.com if the error persists\./iu
const INVITED_RETRY_CODES = new Set(['PI_AI_ERROR', 'SERVER', 'TRANSPORT'])

// Never move accounts for these: the account is not the problem, and a switch
// either cannot help or would hide a real configuration or cancellation fault.
const INELIGIBLE_CODES = new Set([
  'ABORTED', 'AUTH', 'INVALID_REQUEST', 'INVALID_CREDENTIAL', 'MISSING_CREDENTIAL',
  'NO_ADAPTER', 'UNKNOWN_MODEL', 'UNSUPPORTED_OPTION', 'UNSUPPORTED_CONTENT',
  'CONTEXT_WINDOW_EXCEEDED', 'IMAGE_OFFLOAD_REQUIRED',
])

const QUOTA_CODES = new Set(['QUOTA', 'ACCOUNT_QUOTA', 'QUOTA_EXCEEDED'])

const textOf = failure => {
  const message = typeof failure?.message === 'string' ? failure.message : ''
  const code = typeof failure?.code === 'string' ? failure.code : ''
  return { message, code }
}

/**
 * Which failover family one failed model request belongs to.
 *
 * @param {object|undefined} failure - the terminal failure DSH classified.
 * @returns {'quota'|'capacity'|undefined} the family, or undefined when the
 *   failure must not move the turn to another account.
 */
export function classifyFailoverFailure(failure) {
  const { message, code } = textOf(failure)
  if (INELIGIBLE_CODES.has(code)) return undefined
  // Provider text is the only evidence for capacity; a bare SERVER code is not
  // enough, because a 500 in the body of an otherwise fine account would then
  // silently move every later request.
  if (QUOTA_CODES.has(code)) return 'quota'
  if (USAGE_LIMIT_MESSAGE.test(message) || USAGE_LIMIT_HINT.test(message)) return 'quota'
  if (FULL_LOAD_MESSAGE.test(message) || (/PI_AI_ERROR|RATE_LIMIT|SERVER/.test(code) && LOAD_MARKERS.test(message))) return 'capacity'
  return undefined
}

/**
 * Whether one failure already reached the end of DSH's retry policy.
 *
 * A capacity refusal the provider explicitly invites retrying is exactly the case
 * that arrives as a terminal `PI_AI_ERROR` after a real 5xx response. Quota
 * exhaustion also ends the turn, but it is handled by moving accounts, never by
 * repeating the same request on the same spent account.
 *
 * @param {object|undefined} failure
 * @param {'quota'|'capacity'|undefined} family
 * @returns {boolean} true when the same account will not get another attempt.
 */
export function isTerminalProviderFailure(failure, family = classifyFailoverFailure(failure)) {
  if (family !== 'capacity') return false
  const { message, code } = textOf(failure)
  return INVITED_RETRY_CODES.has(code) && PROVIDER_INVITES_RETRY.test(message)
}

/** The wait the provider itself advertised inside the usage-limit sentence, if any. */
export function usageLimitParkMs(failure, fallbackMs = DEFAULT_PARK_MS) {
  const { message } = textOf(failure)
  const minutes = /Try again in ~(\d{1,6}) min/u.exec(message)?.[1]
  const parsed = minutes === undefined ? undefined : Number(minutes) * MINUTE_MS
  // The advertised wait is the provider's own estimate. Keep it inside a bounded
  // range so a bogus value cannot park an account for a week or for one second.
  if (parsed === undefined || !Number.isFinite(parsed) || parsed <= 0) return fallbackMs
  return Math.min(Math.max(parsed, MINUTE_MS), 6 * 60 * MINUTE_MS)
}

/**
 * Rank the signed-in accounts for the next attempt.
 *
 * Round robin from the account after the failing one, skipping accounts this
 * module parked. The failing account stays a candidate at the end: one account
 * that will reset is a better answer than ending the turn, and the caller
 * decides whether to use it based on its own `onlyParked` reading.
 *
 * @param {{accounts: {id: string, active?: boolean}[], failingId: string|undefined, parked: Map<string, number>, now: number}} input
 * @returns {{id: string, parked: boolean}[]} candidates in the order to try.
 */
export function orderAccountCandidates({ accounts, failingId, parked, now }) {
  const list = Array.isArray(accounts) ? accounts.filter(account => typeof account?.id === 'string' && account.id.length > 0) : []
  if (list.length === 0) return []
  const failingIndex = list.findIndex(account => account.id === failingId)
  const rotated = failingIndex < 0 ? list : [...list.slice(failingIndex + 1), ...list.slice(0, failingIndex + 1)]
  const at = typeof now === 'number' && Number.isFinite(now) ? now : 0
  const others = rotated.filter(account => account.id !== failingId)
  const unblocked = others.filter(account => (parked?.get?.(account.id) ?? 0) <= at)
  const blocked = others.filter(account => (parked?.get?.(account.id) ?? 0) > at)
  const failing = rotated.find(account => account.id === failingId)
  return [
    ...unblocked.map(account => ({ id: account.id, parked: false })),
    // A parked account will most likely refuse again, so even the account that just
    // failed is tried before one whose own quota is spent.
    ...blocked.map(account => ({ id: account.id, parked: true })),
    // Last resort only: the caller re-reads quota before spending a retry on it.
    ...(failing === undefined ? [] : [{ id: failing.id, parked: (parked?.get?.(failing.id) ?? 0) > at }]),
  ]
}

/**
 * Track the consecutive capacity failures that escalate to a switch.
 *
 * Scoped by (session, account): two conversations on the same account each keep
 * their own streak, so one busy minute cannot be accumulated by parallel
 * conversations into a switch no single turn ever justified.
 */
export function createCapacityStreaks({ streak = DEFAULT_CAPACITY_STREAK, windowMs = DEFAULT_CAPACITY_WINDOW_MS } = {}) {
  const required = Number.isSafeInteger(streak) && streak >= 1 ? streak : DEFAULT_CAPACITY_STREAK
  const window = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_CAPACITY_WINDOW_MS
  const seen = new Map()
  const keyOf = ({ sessionId, accountId }) => `${sessionId ?? ''}\u0000${accountId ?? ''}`
  return {
    /** Record one capacity failure and report whether the streak now warrants a switch. */
    observe({ sessionId, accountId, now = Date.now() } = {}) {
      const key = keyOf({ sessionId, accountId })
      const previous = seen.get(key)
      const count = previous !== undefined && now - previous.at <= window ? previous.count + 1 : 1
      seen.set(key, { count, at: now })
      if (seen.size > 64) seen.delete(seen.keys().next().value)
      return { count, escalate: count >= required }
    },
    /** A successful request or any non-capacity outcome ends the streak. */
    clear({ sessionId, accountId } = {}) {
      seen.delete(keyOf({ sessionId, accountId }))
    },
    clearSession(sessionId) {
      for (const key of seen.keys()) if (key.startsWith(`${sessionId}\u0000`)) seen.delete(key)
    },
    reset() { seen.clear() },
    snapshot: () => new Map([...seen].map(([key, value]) => [key, { ...value }])),
  }
}

const failureForNotice = failure => ({
  code: typeof failure?.code === 'string' ? failure.code : 'PI_AI_ERROR',
  message: typeof failure?.message === 'string' ? failure.message.slice(0, 400) : 'Codex request failed',
  ...(Number.isInteger(failure?.status) && failure.status >= 100 && failure.status <= 599 ? { status: failure.status } : {}),
  ...(typeof failure?.requestId === 'string' && failure.requestId.length > 0 ? { requestId: failure.requestId } : {}),
})

/**
 * Wait for the new account's catalogue, bounded by `timeoutMs`.
 *
 * The retried step calls the adapter, which re-checks catalogue readiness and
 * loads it if needed, so this is a head start rather than a precondition. Timing
 * out is not an error; it only means the retry pays for the load itself.
 */
async function settleModels(modelsReady, timeoutMs, signal) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return
  let timer
  const timeout = new Promise(resolve => {
    timer = setTimeout(resolve, timeoutMs)
    timer.unref?.()
  })
  let onAbort
  const cancelled = signal === undefined ? undefined : new Promise(resolve => {
    onAbort = () => resolve()
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    await Promise.race([Promise.resolve().then(modelsReady).then(() => undefined, () => undefined), timeout, ...(cancelled === undefined ? [] : [cancelled])])
  } finally {
    clearTimeout(timer)
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort)
  }
}

/**
 * Create the `agent/request-error` listener that rotates the account pool.
 *
 * @param {object} options
 * @param {() => boolean} options.enabled - the user's switch.
 * @param {() => Promise<{id: string, active?: boolean, label?: string}[]>} options.listAccounts
 * @param {() => Promise<string|undefined>} options.activeAccountId - fallback for
 *   callers that do not provide an attempt snapshot.
 * @param {(id: string) => Promise<void>} options.switchAccount - commits the switch and
 *   invalidates this account's caches; must be idempotent per target id.
 * @param {() => Promise<boolean>} options.modelsReady - resolves once the new account's
 *   catalogue can serve the retried request.
 * @param {() => void} [options.onSwitched] - tells the rest of the plugin (parked quota
 *   recovery, usage surfaces) that the account changed.
 * @param {string} [options.provider] - only failures of this provider are handled.
 * @param {object} [options.streaks] - capacity streak store, injectable for tests.
 * @param {() => number} [options.now]
 * @param {object} [options.log] - `{ info, warn }` diagnostic sink.
 */
export function createAccountFailover({
  enabled = () => true,
  listAccounts,
  activeAccountId,
  switchAccount,
  modelsReady = async () => true,
  onSwitched = () => {},
  provider = 'openai-codex',
  streaks = createCapacityStreaks(),
  now = Date.now,
  log = {},
  parkMs = DEFAULT_PARK_MS,
  modelReadyMs = DEFAULT_MODEL_READY_MS,
  maxRecoveries = 256,
} = {}) {
  if (typeof listAccounts !== 'function' || typeof activeAccountId !== 'function' || typeof switchAccount !== 'function') {
    throw new TypeError('account failover requires account listing, the active account, and a way to switch')
  }
  if (typeof enabled !== 'function' || typeof modelsReady !== 'function' || typeof now !== 'function') {
    throw new TypeError('account failover requires enablement, clock, and model readiness functions')
  }
  // Parks are process-local: they describe this run's observed exhaustions, not
  // a durable claim about the account. A restart re-reads real quota instead.
  const parked = new Map()
  // One switch at a time. Two conversations failing together must not chase each
  // other through the pool; the loser re-reads the active account and retries.
  let switching = Promise.resolve()
  let generation = 0

  const park = (accountId, failure) => {
    if (typeof accountId !== 'string' || accountId.length === 0) return
    const at = now() + usageLimitParkMs(failure, parkMs)
    const previous = parked.get(accountId) ?? 0
    if (at > previous) parked.set(accountId, at)
  }

  /** Move the turn to another account and report what to do next. */
  const rotate = async ({ failure, accountIds, failingId, abandoned, signal }) => {
    const candidates = orderAccountCandidates({ accounts: accountIds, failingId, parked, now: now() })
    // Only an account that can actually serve the turn is a rotation. Retrying on
    // an account still inside its own quota cooldown, or on one this step has
    // already left behind, would spend the turn's last attempt on a request that
    // is known to fail, so the original failure stands instead.
    const target = candidates.find(candidate => candidate.id !== failingId
      && !candidate.parked
      && !abandoned.has(candidate.id))
    if (target === undefined) return undefined
    if (signal?.aborted || !enabled()) return undefined
    try { if (await switchAccount(target.id, { expectedActiveId: failingId, signal }) === false) return undefined } catch {
      try { log.warn?.('account-failover', 'could not switch the Codex account') } catch {}
      return undefined
    }
    try { onSwitched() } catch {}
    try { log.info?.('account-failover', `retrying the turn on another of the ${accountIds.length} signed-in accounts`) } catch {}
    return { switchedTo: target.id }
  }

  // What one step has already spent, keyed by (session, turn, step). The host
  // re-runs the step for every `{ kind: 'retry' }` a listener returns and puts no
  // cap on those rounds, so the cap has to live here: at most three recoveries,
  // including at most one in-place attempt, per step. Turn numbers are per agent, so
  // the session id is part of the key — two conversations must never spend each
  // other's attempt.
  const recoveries = new Map()
  const recoveryKey = ({ sessionId, turn, step }) => `${sessionId ?? ''}\u0000${turn}\u0000${step}`
  const recoverySlot = input => {
    const key = recoveryKey(input)
    const known = recoveries.get(key)
    if (known !== undefined) return known
    // Never evict a live budget: re-admitting it would reset a running step's cap.
    if (recoveries.size >= maxRecoveries) return undefined
    const slot = { retriedInPlace: false, abandoned: new Set(), retries: 0, inFlight: false }
    recoveries.set(key, slot)
    return slot
  }

  /** Spend the step's single same-account attempt, or fall back to the failure. */
  const retryInPlace = async ({ agent, turn, step, provider: requestProvider, failure, family, sessionId }, next) => {
    const slot = recoverySlot({ sessionId, turn, step })
    // Spend the attempt once and keep it spent: a second failure of the same step
    // must fall through to the original error, not earn another attempt.
    if (!slot || slot.retriedInPlace || slot.retries >= MAX_FAILOVER_RETRIES) return undefined
    slot.retriedInPlace = true
    slot.retries++
    const scheduled = publishAccountRetry({ agent, turn, step, provider: requestProvider, failure, family, inPlace: true, retry: slot.retries })
    if (scheduled === false) return undefined
    return { kind: 'retry' }
  }

  const recover = async ({ agent, turn, step, provider: requestProvider, failure, signal, requestAccountId }, next, slot) => {
    if (!enabled() || requestProvider !== provider || signal?.aborted) return next()
    const family = classifyFailoverFailure(failure)
    const sessionId = agent?.session?.id
    const epoch = generation
    const allowed = () => epoch === generation && enabled() && !signal?.aborted
    // The request-error event may arrive after another conversation or a manual
    // account/select changed the vault's active account. Prefer the account
    // captured at agent/request time; only old callers without that snapshot use
    // the live active account as a compatibility fallback.
    const accountId = typeof requestAccountId === 'string' && requestAccountId.length > 0
      ? requestAccountId
      : await activeAccountId().catch(() => undefined)
    if (typeof accountId !== 'string' || accountId.length === 0) return next()
    if (family === undefined) {
      streaks.clear({ sessionId, accountId })
      return next()
    }
    // Returning void here terminates the request. Calling next() would hand a
    // spent budget to DSH's generic retry layer and add another retry chain.
    if (!allowed() || slot.retries >= MAX_FAILOVER_RETRIES) return undefined
    // Remember every eligible failure, including a late refusal after another
    // conversation already switched. Only the single explicit in-place retry
    // may use a failing account again.
    slot.abandoned.add(accountId)
    // Some provider refusals arrive with a status DSH's own retry layer does not
    // classify as transient — a 500 carrying "An error occurred while processing
    // your request… You can retry" becomes PI_AI_ERROR and ends the turn. There is
    // no second attempt then, so a two-failure rule could never be satisfied.
    // Those failures are handled on the spot: rotate when another account can
    // serve, otherwise spend one in-place retry on the account we already have.
    const terminalUpstream = isTerminalProviderFailure(failure, family)
    if (family === 'capacity' && !terminalUpstream) {
      const streak = streaks.observe({ sessionId, accountId, now: now() })
      if (!streak.escalate) return next()
      streaks.clear({ sessionId, accountId })
    } else if (family === 'quota') {
      park(accountId, failure)
      streaks.clear({ sessionId, accountId })
    } else {
      streaks.clear({ sessionId, accountId })
    }
    const attempt = { agent, turn, step, provider: requestProvider, failure, family, sessionId }
    // Serialize the decision so simultaneous failures agree on one new account.
    let result
    const operation = switching.then(async () => {
      if (!allowed()) return undefined
      const accounts = await listAccounts().catch(() => [])
      const currentId = await activeAccountId().catch(() => undefined)
      if (!allowed() || !Array.isArray(accounts)) return undefined
      // Another turn already moved off the account that failed here. Its switch
      // also invalidated the catalogue, so this turn just retries on the account
      // that is active now — switching again would ping-pong the pool.
      if (typeof currentId === 'string' && currentId !== accountId) {
        if (slot.abandoned.has(currentId) || (parked.get(currentId) ?? 0) > now() || !accounts.some(value => value.id === currentId)) return undefined
        return { switchedTo: currentId, reused: true }
      }
      return rotate({ failure, accountIds: accounts, failingId: accountId, abandoned: slot.abandoned, signal })
    })
    switching = operation.catch(() => undefined)
    try { result = await operation } catch { result = undefined }
    if (!allowed()) return undefined
    if (result === undefined) {
      // No account could take the turn. An invited retry still deserves its one
      // in-place attempt, exactly as when there is only one account.
      const currentId = await activeAccountId().catch(() => undefined)
      if (!allowed()) return undefined
      return terminalUpstream && currentId === accountId ? retryInPlace(attempt, next) : slot.retries > 0 ? undefined : next()
    }
    // This step has left the account that failed; rotating back to it would only
    // repeat the failure it already proved.
    slot.retries++

    if (!result.reused) {
      // The switch already cleared the old account's catalogue. Wait for the new
      // one, but only for a bounded time: the host adapter re-checks catalogue
      // readiness on every call, so a slow or offline read must not turn a
      // recoverable limit into a terminal error here. A wait that ends without a
      // catalogue still retries — the adapter's own readiness gate decides.
      await settleModels(modelsReady, modelReadyMs, signal)
    }
    if (!allowed()) return undefined

    const scheduled = publishAccountRetry({ agent, turn, step, provider: requestProvider, failure, family, retry: slot.retries })
    if (scheduled === false) return undefined
    return { kind: 'retry' }
  }

  const handler = async (input, next) => {
    if (!enabled() || input.provider !== provider || input.signal?.aborted) return next()
    const sessionId = input.agent?.session?.id
    if (typeof sessionId !== 'string' || !sessionId || !Number.isSafeInteger(input.turn) || !Number.isSafeInteger(input.step)) return next()
    const slot = recoverySlot({ sessionId, turn: input.turn, step: input.step })
    if (!slot || slot.inFlight) return classifyFailoverFailure(input.failure) === undefined ? next() : undefined
    slot.inFlight = true
    try { return await recover(input, next, slot) }
    finally { slot.inFlight = false }
  }

  return Object.assign(handler, {
    /**
     * Forget account health observations without replenishing a running budget. An explicit
     * account transaction (sign-in, switch, removal, sign-out) makes the user the
     * authority on which accounts exist and how fresh their quota is, so this
     * run's parks and streaks are re-earned instead of outliving that decision.
     */
    clear() {
      generation++
      parked.clear()
      streaks.reset()
    },
    succeeded({ sessionId, accountId }) { streaks.clear({ sessionId, accountId }) },
    endTurn({ sessionId, turn }) {
      for (const key of recoveries.keys()) if (key.startsWith(`${sessionId}\u0000${turn}\u0000`)) recoveries.delete(key)
    },
    disposeSession(sessionId) {
      for (const key of recoveries.keys()) if (key.startsWith(`${sessionId}\u0000`)) recoveries.delete(key)
      streaks.clearSession(sessionId)
    },
  })
}

/**
 * Publish the host's standard retry surface so the parked turn explains itself
 * and can be stopped, exactly like the quota-reset wait does.
 *
 * @returns {boolean} false when the host rejected the event, so the caller can
 *   fall back to the original failure instead of retrying invisibly.
 */
export function publishAccountRetry({ agent, turn, step, provider, failure, family, inPlace = false, retry = 1 }) {
  if (typeof agent?.session?.append !== 'function' || !Number.isSafeInteger(turn) || !Number.isSafeInteger(step)) return false
  const retryId = `codex-account-${randomUUID()}`
  const reason = inPlace
    ? 'Codex asked for this request to be retried; retrying on the current account.'
    : family === 'capacity'
      ? 'Codex model is at capacity on this account; retrying on another signed-in account.'
      : 'Codex usage limit exhausted on this account; retrying on another signed-in account.'
  try {
    agent.session.append('llm/retry', {
      retryId,
      turn,
      step,
      provider,
      mode: 'normal',
      policyKey: retryId,
      retry,
      maxRetries: MAX_FAILOVER_RETRIES,
      delayMs: 0,
      failure: { ...failureForNotice(failure), message: reason },
    })
    return true
  } catch {
    return false
  }
}
