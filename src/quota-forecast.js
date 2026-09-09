import { quotaRateInterval } from './quota-rate-interval.js'
const HOUR_MS = 60 * 60 * 1000
const HISTORY_MS = 24 * HOUR_MS
const finite = value => value !== null && value !== undefined && Number.isFinite(Number(value))
const clampPercent = value => Math.max(0, Math.min(100, Number(value)))
const cleanSegment = value => String(value ?? 'default').slice(0, 96)
const keyFor = (window, context = {}) => JSON.stringify([
  cleanSegment(context.scope),
  cleanSegment(context.limitId ?? 'codex'),
  Number(window.windowSeconds) || 'limit',
])
export function observeQuotaForecast(state, windows, now = Date.now(), context = {}) {
  const next = { windows: { ...(state?.windows ?? {}) } }
  let changed = false
  for (const window of windows ?? []) {
    if (!finite(window?.remainingPercent)) continue
    const key = keyFor(window, context)
    const resetsAt = finite(window.resetsAt) ? Number(window.resetsAt) : null
    const remainingPercent = clampPercent(window.remainingPercent)
    const previous = next.windows[key]
    const resetChanged = previous !== undefined && (
      (previous.resetsAt === null) !== (resetsAt === null)
      || (previous.resetsAt !== null && Math.abs(previous.resetsAt - resetsAt) > 300)
    )
    const last = previous?.samples?.at(-1)
    const quotaIncreased = last !== undefined && remainingPercent > last.remainingPercent + 0.5
    const observationGap = last !== undefined && now - last.at > 90 * 60_000
    const record = resetChanged || quotaIncreased || observationGap
      ? { resetsAt, samples: [] }
      : { resetsAt, samples: [...(previous?.samples ?? [])] }
    const latest = record.samples.at(-1)
    // Only fresh snapshots count. Plateaus constrain the rate too.
    if (latest === undefined || now > latest.at) {
      record.samples.push({ at: now, remainingPercent })
      record.samples = record.samples.filter(sample => sample.at >= now - HISTORY_MS).slice(-192)
      changed = true
    }
    next.windows[key] = record
  }
  return { state: next, changed }
}

export function estimateQuotaForecast(state, window, now = Date.now(), context = {}) {
  if (!finite(window?.remainingPercent)) return { status: 'calibrating' }
  const record = state?.windows?.[keyFor(window, context)]
  if (record === undefined) return { status: 'calibrating' }
  const resetsAt = finite(window.resetsAt) ? Number(window.resetsAt) : null
  if ((record.resetsAt === null) !== (resetsAt === null)
    || (resetsAt !== null && Math.abs(record.resetsAt - resetsAt) > 300)) return { status: 'calibrating' }
  let samples = record.samples.filter(sample => sample.at >= now - 2 * HOUR_MS && sample.at <= now)
  if (samples.length < 2) return { status: 'calibrating', sampleCount: samples.length }
  if (now - samples.at(-1).at > 20 * 60_000) return { status: 'calibrating', reason: 'stale' }
  // The endpoint's rounding contract is unknown. A one-point error on either
  // side covers floor, ceiling and nearest; decimals are retained, not invented.
  let bounds = quotaRateInterval(samples)
  let changedIntensity = false
  while (!bounds.feasible && samples.length > 3) {
    samples = samples.slice(1)
    bounds = quotaRateInterval(samples)
    changedIntensity = true
  }
  const spanMs = samples.at(-1).at - samples[0].at
  const common = { sampleCount: samples.length, observedSpanMs: spanMs,
    consumedPercent: samples[0].remainingPercent - samples.at(-1).remainingPercent,
    lowerPacePerHour: bounds.min * 60, upperPacePerHour: bounds.max * 60,
    changedIntensity }
  if (!bounds.feasible) return { ...common, status: 'calibrating', reason: 'changing-pace' }
  if (resetsAt !== null && resetsAt <= now / 1000) return { ...common, status: 'calibrating', reason: 'stale' }
  // Quantization bounds may include zero even after several observed drops.
  // Offer a clearly provisional whole-segment estimate, never a finite upper
  // bound or a promise of surviving reset. Do not extrapolate a lone jump.
  if (spanMs >= 5 * 60_000 && samples.length >= 3 && bounds.min <= 1e-9
    && common.consumedPercent >= 1) {
    const pacePerHour = common.consumedPercent / (spanMs / HOUR_MS)
    return { ...common, status: 'ready', provisional: true, pacePerHour,
      runwaySeconds: clampPercent(window.remainingPercent) / pacePerHour * 3600,
      survivesReset: false }
  }
  // A flat trace or an isolated boundary crossing still cannot establish pace.
  if (spanMs < 60_000 || bounds.min <= 1e-9) return { ...common, status: 'calibrating', reason: 'resolution' }
  const pacePerHour = (bounds.min + bounds.max) * 30
  const remaining = clampPercent(window.remainingPercent)
  const runwayMinSeconds = Math.max(0, remaining - 1) / common.upperPacePerHour * 3600
  const runwayMaxSeconds = Math.min(100, remaining + 1) / common.lowerPacePerHour * 3600
  const resetSeconds = resetsAt === null ? null : resetsAt - now / 1000
  if (resetSeconds !== null && resetSeconds <= 0) return { ...common, status: 'calibrating', reason: 'stale' }
  return { ...common, status: 'ready', pacePerHour,
    runwaySeconds: remaining / pacePerHour * 3600,
    runwayMinSeconds, runwayMaxSeconds,
    survivesReset: resetSeconds !== null && runwayMinSeconds >= resetSeconds,
  }
}

export function forecastUsage(usage, state = { windows: {} }, now = Date.now(), options = {}) {
  const observedAt = Number.isFinite(usage?.fetchedAt) ? usage.fetchedAt : now
  if (observedAt > now || now - observedAt > 5 * 60_000) return { state, changed: false, usage: { ...usage, rateLimits: (usage?.rateLimits ?? []).map(limit => ({ ...limit, windows: limit.windows.map(window => ({ ...window, forecast: { status: 'calibrating', reason: 'stale' } })) })) } }
  let nextState = state
  let changed = false
  const rateLimits = (usage?.rateLimits ?? []).map(limit => {
    const context = { scope: options.scope, limitId: limit.id }
    const observed = observeQuotaForecast(nextState, limit.windows, observedAt, context)
    nextState = observed.state
    changed ||= observed.changed
    return {
      ...limit,
      windows: limit.windows.map(window => ({
        ...window,
        forecast: estimateQuotaForecast(nextState, window, now, context),
      })),
    }
  })
  return { state: nextState, changed, usage: { ...usage, rateLimits } }
}

export function createQuotaForecastReader({ reader, enabled, now = Date.now, scope = () => 'default', stateStore }) {
  let state = { windows: {} }
  let loaded = false
  let loading
  let generation = 0
  let historyGeneration = 0
  let persistence = Promise.resolve()
  const persist = operation => {
    const pending = persistence.then(operation)
    persistence = pending.catch(() => {})
    return pending
  }
  const load = async () => {
    if (loaded) return
    if (loading) return loading
    const current = historyGeneration
    const pending = Promise.resolve().then(() => stateStore?.load?.()).then(restored => {
      if (current !== historyGeneration) return
      if (restored?.windows !== null && typeof restored?.windows === 'object') state = restored
      loaded = true
    }).finally(() => {
      if (loading === pending) loading = undefined
    })
    loading = pending
    return pending
  }
  const clearHistory = (clearReader = true) => {
    generation += 1
    historyGeneration += 1
    state = { windows: {} }
    loaded = true
    if (clearReader) reader.clear()
    return persist(() => stateStore?.clear?.())
  }
  return Object.freeze({
    async read(options) {
      const current = generation
      const account = await scope()
      const usage = await reader.read(options)
      if (current !== generation) return usage
      await load()
      const activeAccount = await scope()
      if (current !== generation || account !== activeAccount) return usage
      if (!enabled()) {
        await clearHistory(false)
        return usage
      }
      const forecast = forecastUsage(usage, state, now(), { scope: account })
      state = forecast.state
      if (forecast.changed) await persist(() => stateStore?.save?.(forecast.state))
      return current === generation ? forecast.usage : usage
    },
    clear: () => clearHistory(),
    clearCache() {
      generation += 1
      reader.clear()
    },
    async clearScope(targetScope) {
      generation += 1
      await load()
      const prefix = `[${JSON.stringify(cleanSegment(targetScope))},`
      state = {
        windows: Object.fromEntries(Object.entries(state.windows).filter(([key]) => !key.startsWith(prefix))),
      }
      const snapshot = state
      await persist(() => stateStore?.save?.(snapshot))
    },
  })
}
