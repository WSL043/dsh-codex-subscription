import { randomUUID } from 'node:crypto'

const DEFAULT_MAX_WAIT_MS = 6 * 60 * 60 * 1000
const DEFAULT_RESET_MARGIN_MS = 10_000
const EXHAUSTED_PERCENT = 99.9
// pi-ai converts Codex's usage_limit_reached response into this bounded friendly
// message. DSH releases through 0.1.2-rc.1 classify that text as PI_AI_ERROR
// because their generic classifier recognizes "rate limit", but not "usage limit".
const CODEX_USAGE_LIMIT_MESSAGE = /^You have hit your ChatGPT usage limit(?: \([a-z0-9][a-z0-9 ._-]{0,39} plan\))?\.(?: Try again in ~\d{1,6} min\.)?$/u

const isCodexRateLimit = failure => failure?.code === 'RATE_LIMIT'
  || (failure?.code === 'PI_AI_ERROR'
    && typeof failure.message === 'string'
    && CODEX_USAGE_LIMIT_MESSAGE.test(failure.message))

function cancellableDelay(delayMs, signal) {
  if (signal?.aborted) return Promise.resolve(false)
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve(true)
    }, delayMs)
    function onAbort() {
      clearTimeout(timer)
      resolve(false)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function createWakeSignal() {
  let revision = 0
  let reason
  const waiters = new Set()
  const notify = nextReason => {
    revision += 1
    reason = nextReason
    for (const waiter of [...waiters]) waiter(nextReason)
  }
  const wait = (since, signal) => {
    if (revision !== since) return Promise.resolve(reason)
    if (signal?.aborted) return Promise.resolve('cancelled')
    return new Promise(resolve => {
      const settle = value => {
        waiters.delete(settle)
        signal?.removeEventListener('abort', onAbort)
        resolve(value)
      }
      const onAbort = () => settle('cancelled')
      waiters.add(settle)
      signal?.addEventListener('abort', onAbort, { once: true })
      if (revision !== since) settle(reason)
    })
  }
  return { revision: () => revision, notify, wait }
}

function shortResetDelay(usage, nowMs, maxWaitMs, resetMarginMs) {
  let latestDelayMs
  for (const limit of usage?.rateLimits ?? []) {
    // The usage response also contains feature-specific and code-review limits.
    // A model request cannot identify those meters, so only the main Codex limit
    // is authoritative for recovery of an openai-codex model failure.
    if (limit?.id !== 'codex') continue
    for (const window of limit?.windows ?? []) {
      if (!Number.isFinite(window?.usedPercent) || window.usedPercent < EXHAUSTED_PERCENT) continue
      // Every exhausted primary window must be recoverable within the cap. If a
      // weekly or malformed meter also blocks the request, retrying after only
      // the short window resets would wake the turn too early.
      if (!Number.isFinite(window?.windowSeconds) || window.windowSeconds * 1_000 > maxWaitMs) return undefined
      if (!Number.isFinite(window?.resetsAt)) return undefined
      const delayMs = window.resetsAt * 1_000 - nowMs
      if (delayMs <= 0 || delayMs + resetMarginMs > maxWaitMs) return undefined
      latestDelayMs = Math.max(latestDelayMs ?? 0, delayMs)
    }
  }
  return latestDelayMs
}

function publishScheduledRetry({ agent, turn, step, provider, failure }, delayMs, resetAtMs) {
  if (typeof agent?.session?.append !== 'function'
    || !Number.isSafeInteger(turn) || !Number.isSafeInteger(step)) return undefined
  const retryId = `codex-quota-${randomUUID()}`
  const message = `Codex usage limit exhausted. Waiting for quota reset at ${new Date(resetAtMs).toISOString()}; retrying shortly afterward.`
  const visibleFailure = {
    code: failure.code,
    message,
    ...(Number.isInteger(failure.status) && failure.status >= 100 && failure.status <= 599 ? { status: failure.status } : {}),
    ...(typeof failure.requestId === 'string' && failure.requestId.length > 0 ? { requestId: failure.requestId } : {}),
  }
  try {
    agent.session.append('llm/retry', {
      retryId,
      turn,
      step,
      provider,
      mode: 'normal',
      policyKey: retryId,
      retry: 1,
      maxRetries: 1,
      delayMs,
      failure: visibleFailure,
    })
    return { retryId, turn, step, retry: 1 }
  } catch {
    // A long wait must never be invisible when the host rejects the event.
    return undefined
  }
}

function publishRetryStarted(agent, scheduled) {
  try {
    agent.session.append('llm/retry-started', scheduled)
    return true
  } catch {
    // Do not leave a scheduled retry stuck in the UI after publication fails.
    return false
  }
}

async function waitForResetOrWake(delayMs, signal, wait, wakeSignal, revision) {
  const controller = new AbortController()
  const fusedSignal = signal === undefined
    ? controller.signal
    : AbortSignal.any([signal, controller.signal])
  const delayed = Promise.resolve(wait(delayMs, fusedSignal))
    .then(completed => completed ? 'reset' : 'cancelled')
  const result = await Promise.race([delayed, wakeSignal.wait(revision, fusedSignal)])
  controller.abort()
  return result
}

/**
 * Recover a Codex subscription RATE_LIMIT only when the backend confirms an
 * exhausted short quota window whose reset is close enough to wait out.
 *
 * The listener owns the authoritative wait from `/wham/usage` and publishes
 * the host's standard model-retry surface event so the turn shows the reason,
 * countdown, and normal turn cancellation affordance while it is parked.
 */
export function createCodexQuotaRetryHandler({
  usageReader,
  provider = 'openai-codex',
  enabled = () => true,
  now = Date.now,
  wait = cancellableDelay,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  resetMarginMs = DEFAULT_RESET_MARGIN_MS,
} = {}) {
  if (usageReader === undefined || typeof usageReader.read !== 'function') {
    throw new TypeError('quota retry requires a usage reader')
  }
  if (typeof enabled !== 'function' || typeof now !== 'function' || typeof wait !== 'function') {
    throw new TypeError('quota retry requires enablement, clock, and wait functions')
  }
  if (!Number.isFinite(maxWaitMs) || maxWaitMs <= 0
    || !Number.isFinite(resetMarginMs) || resetMarginMs < 0) {
    throw new TypeError('quota retry requires a positive wait cap and non-negative reset margin')
  }
  const wakeSignal = createWakeSignal()
  const clearCache = async () => {
    try {
      if (typeof usageReader.clearCache === 'function') await usageReader.clearCache()
      else await usageReader.clear?.()
    } catch {
      // Cache invalidation must not turn a completed quota wait into a new
      // terminal failure. The next forced usage read can repair stale UI state.
    }
  }
  const handler = async ({ agent, turn, step, provider: requestProvider, failure, signal }, next) => {
    if (requestProvider !== provider || !isCodexRateLimit(failure) || !enabled()) return next()
    if (signal?.aborted) return undefined
    let wakeRevision = wakeSignal.revision()

    let usage
    try {
      usage = await usageReader.read({ force: true, signal })
    } catch {
      if (signal?.aborted) return undefined
      return next()
    }
    if (signal?.aborted) return undefined
    if (!enabled()) return next()

    const observedAtMs = now()
    let resetDelayMs = shortResetDelay(usage, observedAtMs, maxWaitMs, resetMarginMs)
    if (resetDelayMs === undefined) return next()
    const scheduled = publishScheduledRetry(
      { agent, turn, step, provider: requestProvider, failure },
      resetDelayMs + resetMarginMs,
      observedAtMs + resetDelayMs,
    )
    if (scheduled === undefined) return next()
    while (true) {
      const reason = await waitForResetOrWake(
        resetDelayMs + resetMarginMs,
        signal,
        wait,
        wakeSignal,
        wakeRevision,
      )
      if (reason === 'cancelled' || signal?.aborted) return undefined
      if (!enabled()) return next()
      if (reason !== 'configuration') break
      wakeRevision = wakeSignal.revision()
      resetDelayMs = shortResetDelay(usage, now(), maxWaitMs, resetMarginMs)
      if (resetDelayMs === undefined) return next()
    }

    await clearCache()
    if (signal?.aborted) return undefined
    if (!publishRetryStarted(agent, scheduled)) return next()
    return { kind: 'retry' }
  }
  Object.defineProperties(handler, {
    notifyAccountChanged: { value: () => wakeSignal.notify('account') },
    notifyConfigurationChanged: { value: () => wakeSignal.notify('configuration') },
  })
  return handler
}
