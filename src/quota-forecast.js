import { quotaRateInterval, refineQuotaRate } from './quota-rate-interval.js'
import { exhaustionOutlook, splitPastCycles, riskBand } from './quota-exhaustion.js'
const HOUR_MS = 60 * 60 * 1000
const HISTORY_MS = 30 * 24 * HOUR_MS
const WEEK_MS = 7 * 24 * HOUR_MS
const RECENT_MS = 2 * HOUR_MS
const OBSERVATION_GAP_MS = 90 * 60_000
const finite = value => value !== null && value !== undefined && Number.isFinite(Number(value))
const clampPercent = value => Math.max(0, Math.min(100, Number(value)))
const cleanSegment = value => String(value ?? 'default').slice(0, 96)
const keyFor = (window, context = {}) => JSON.stringify([
  cleanSegment(context.scope),
  cleanSegment(context.limitId ?? 'codex'),
  Number(window.windowSeconds) || 'limit',
])

function retainSamples(samples, now) {
  const older = new Map(), recent = []
  for (const sample of samples) {
    if (sample.at < now - HISTORY_MS) continue
    if (sample.at >= now - RECENT_MS) recent.push(sample)
    else {
      const width = sample.at >= now - WEEK_MS ? RECENT_MS : 8 * HOUR_MS
      const bucket = `${width}:${Math.floor(sample.at / width)}`
      if (!older.has(bucket) || sample.reset === true) older.set(bucket, sample)
    }
  }
  return [...older.values(), ...recent.slice(-104)]
}

function historicalForecast(samples, window, common) {
  if (window.windowSeconds < 24 * 3600) return undefined
  const spanHours = (samples.at(-1).at - samples[0].at) / HOUR_MS
  const consumedPercent = samples[0].remainingPercent - samples.at(-1).remainingPercent
  if (spanHours < 6 || consumedPercent < 3 || new Set(samples.map(sample => sample.remainingPercent)).size < 3) return undefined
  const pacePerHour = consumedPercent / spanHours
  return { ...common, status: 'ready', provisional: true, rateMethod: 'historical', pacePerHour,
    runwaySeconds: clampPercent(window.remainingPercent) / pacePerHour * 3600, survivesReset: 'unknown' }
}

// Past cycles may influence long-horizon estimates only after an expanding
// replay beats the same-cycle pace, with rounding treated as a dead band.
function validatedCyclePace(samples, epochStart, windowSeconds) {
  if (!(windowSeconds >= 86400)) return
  const cycles = []
  let cycle
  for (const sample of samples) {
    if (sample.at >= epochStart) break
    if (sample.reset) cycles.push(cycle = [])
    if (cycle) cycle.push(sample)
  }
  const hours = (a, b) => (b.at - a.at) / HOUR_MS
  const usable = cycles.filter(points => points.length >= 4 && hours(points[0], points.at(-1)) >= windowSeconds / 3600 * 0.75)
  const paces = usable.map(points => Math.max(0, (points[0].remainingPercent - points.at(-1).remainingPercent) / hours(points[0], points.at(-1))))
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length
  let currentError = 0, blendedError = 0, comparisons = 0
  for (let i = 2; i < usable.length; i++) {
    const points = usable[i], prior = mean(paces.slice(0, i))
    for (let j = 1; j < points.length - 1; j++) {
      const start = points[0], known = points[j], future = points.at(-1)
      const horizon = hours(known, future)
      if (horizon < 6) continue
      const recent = Math.max(0, (start.remainingPercent - known.remainingPercent) / hours(start, known))
      const actual = known.remainingPercent - future.remainingPercent
      const loss = pace => Math.max(0, Math.abs(Math.min(known.remainingPercent, pace * horizon) - actual) - 1)
      currentError += loss(recent)
      blendedError += loss((recent + prior) / 2)
      comparisons++
    }
  }
  if (comparisons >= 4 && blendedError < currentError) return mean(paces)
}
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
    const quotaIncreased = last !== undefined && remainingPercent >= last.remainingPercent + 2
    if (last !== undefined && now <= last.at) continue
    const epochStart = resetChanged || quotaIncreased ? now : previous?.epochStart ?? previous?.samples?.[0]?.at ?? now
    const sample = { at: now, remainingPercent, ...(resetChanged || quotaIncreased ? { reset: true } : {}) }
    const record = { resetsAt, epochStart, samples: retainSamples([...(previous?.samples ?? []), sample], now),
      ...(previous?.risk && !resetChanged && !quotaIncreased ? { risk: previous.risk } : {}) }
    next.windows[key] = record
    changed = true
  }
  return { state: next, changed }
}

// Long-horizon outlook: computed beside the short-horizon status, never instead
// of it, so that `flat` or `calibrating` cannot hide a cycle-level risk.
export function estimateQuotaForecast(state, window, now = Date.now(), context = {}) {
  const forecast = estimateShortHorizon(state, window, now, context)
  const key = keyFor(window, context)
  const record = state?.windows?.[key]
  if (forecast.reason === 'stale' || record === undefined || !finite(window?.remainingPercent) || !finite(window.resetsAt) || !finite(record.resetsAt)
    || Math.abs(record.resetsAt - Number(window.resetsAt)) > 300 || !(window.windowSeconds >= 86400)) return forecast
  const history = record.samples.filter(sample => sample.at >= (record.epochStart ?? 0) && sample.at <= now)
  const windowMs = window.windowSeconds * 1000
  const exhaustion = exhaustionOutlook(history, { remainingPercent: clampPercent(window.remainingPercent), resetsAt: record.resetsAt,
    windowSeconds: window.windowSeconds, memoScope: key,
    pastCycles: splitPastCycles(record.samples, record.resetsAt * 1000 - windowMs, windowMs) })
  return exhaustion === undefined ? forecast : { ...forecast, exhaustion, risk: riskBand(exhaustion, record.risk, history.at(-1).at) }
}

function estimateShortHorizon(state, window, now = Date.now(), context = {}) {
  if (!finite(window?.remainingPercent)) return { status: 'calibrating' }
  const record = state?.windows?.[keyFor(window, context)]
  if (record === undefined) return { status: 'calibrating' }
  const resetsAt = finite(window.resetsAt) ? Number(window.resetsAt) : null
  if ((record.resetsAt === null) !== (resetsAt === null)
    || (resetsAt !== null && Math.abs(record.resetsAt - resetsAt) > 300)) return { status: 'calibrating' }
  // The 2 h window hangs off the newest reading, not off the clock, so re-reading the same snapshot later gives the same pace.
  const history = record.samples.filter(sample => sample.at >= (record.epochStart ?? 0) && sample.at <= now)
  const newest = history.at(-1)
  if (newest === undefined) return { status: 'calibrating', sampleCount: 0 }
  if (now - newest.at > 20 * 60_000 || (resetsAt !== null && resetsAt <= now / 1000)) return { status: 'calibrating', reason: 'stale' }
  let samples = history.filter(sample => sample.at >= newest.at - RECENT_MS)
  const longEstimate = common => {
    const current = historicalForecast(history, window, common)
    const prior = current && validatedCyclePace(record.samples, record.epochStart, window.windowSeconds)
    if (!(prior > 0)) return current
    const pacePerHour = (current.pacePerHour + prior) / 2
    return { ...current, rateMethod: 'validated-cycles', pacePerHour,
      runwaySeconds: clampPercent(window.remainingPercent) / pacePerHour * 3600 }
  }
  const lastGap = samples.findLastIndex((sample, index) => index > 0 && sample.at - samples[index - 1].at > OBSERVATION_GAP_MS)
  if (lastGap > 0) samples = samples.slice(lastGap)
  const recentChange = samples.findLastIndex(sample => sample.remainingPercent !== newest.remainingPercent)
  const flat = samples.slice(recentChange + 1)
  if (flat.length >= 2 && newest.at - flat[0].at >= 30 * 60_000) {
    const observedSpanMs = newest.at - flat[0].at
    return { status: 'flat', activity: 'unknown', sampleCount: flat.length, observedSpanMs,
      upperPacePerHour: quotaRateInterval(flat).max * 60 }
  }
  if (samples.length < 2) return longEstimate({ sampleCount: history.length }) ?? { status: 'calibrating', sampleCount: samples.length }
  // The endpoint's rounding contract is unknown. A one-point error on either
  // side covers floor, ceiling and nearest; decimals are retained, not invented.
  const rateBounds = readings => refineQuotaRate(readings, quotaRateInterval(readings))
  // A positive interval pinched to one rate is a quantization boundary, not
  // evidence that consumption is known exactly.
  const contradicted = range => !range.feasible || range.steadyHypothesisFailed === true
    || (range.min > 1e-9 && range.max - range.min <= 1e-9)
  let bounds = rateBounds(samples)
  let changedIntensity = false
  while (contradicted(bounds) && samples.length > 3) {
    samples = samples.slice(1)
    bounds = rateBounds(samples)
    changedIntensity = true
  }
  const spanMs = samples.at(-1).at - samples[0].at
  const common = { sampleCount: samples.length, observedSpanMs: spanMs,
    consumedPercent: samples[0].remainingPercent - samples.at(-1).remainingPercent,
    lowerPacePerHour: bounds.min * 60, upperPacePerHour: bounds.max * 60,
    changedIntensity, rateMethod: bounds.method ?? 'conservative' }
  const drops = samples.filter((sample, i) => i > 0 && sample.remainingPercent < samples[i - 1].remainingPercent).length
  const recurring = drops >= 2 || common.consumedPercent >= 2
  // After discarding a contradicted segment, establish the new pace before
  // extrapolating it. Integer reports must pass the existing shared-quantizer
  // check; a suffix with too few drops cannot establish that usage continued.
  const integerReports = samples.every(sample => Number.isInteger(sample.remainingPercent))
  const confirmedBurst = changedIntensity && drops >= 2 && flat.length === 1
    && common.consumedPercent >= 4 && bounds.min > 1e-9
  if (contradicted(bounds) || (changedIntensity && (samples.length < 4 || spanMs < 20 * 60_000
    || (integerReports && bounds.steadyHypothesisFailed !== false)) && !confirmedBurst))
    return { ...common, status: 'calibrating', reason: 'changing-pace' }
  // A fitted suffix after a change is only a rough estimate. Its conditional
  // interval must not imply precision or promise to survive the next reset.
  // Quantization bounds may include zero even after several observed drops.
  // Offer a clearly provisional whole-segment estimate, never a finite upper
  // bound or a promise of surviving reset. Do not extrapolate a lone jump.
  if (!confirmedBurst && spanMs >= 5 * 60_000 && samples.length >= 3 && (changedIntensity || bounds.min <= 1e-9)
    && recurring && common.consumedPercent >= 1) {
    const pacePerHour = common.consumedPercent / (spanMs / HOUR_MS)
    const runwaySeconds = clampPercent(window.remainingPercent) / pacePerHour * 3600
    return { ...common, status: 'ready', provisional: true, pacePerHour, runwaySeconds,
      survivesReset: 'unknown' }
  }
  // A flat trace or an isolated boundary crossing still cannot establish pace.
  if (spanMs < 60_000 || bounds.min <= 1e-9) return longEstimate(common) ?? { ...common, status: 'calibrating', reason: 'resolution' }
  const pacePerHour = (bounds.min + bounds.max) * 30
  const remaining = clampPercent(window.remainingPercent)
  const runwayMinSeconds = Math.max(0, remaining - 1) / common.upperPacePerHour * 3600
  const runwayMaxSeconds = Math.min(100, remaining + 1) / common.lowerPacePerHour * 3600
  const resetSeconds = resetsAt === null ? null : resetsAt - newest.at / 1000
  const survivesReset = confirmedBurst || resetSeconds === null ? 'unknown'
    : runwayMinSeconds >= resetSeconds ? 'yes' : runwayMaxSeconds < resetSeconds ? 'no' : 'unknown'
  return { ...common, status: 'ready', pacePerHour,
    runwaySeconds: remaining / pacePerHour * 3600,
    runwayMinSeconds, runwayMaxSeconds,
    ...(confirmedBurst ? { trace: 'burst' } : {}),
    survivesReset,
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
      windows: limit.windows.map(window => {
        const forecast = estimateQuotaForecast(nextState, window, now, context)
        // Persist the display band (hysteresis memory) beside the samples.
        const key = keyFor(window, context), record = nextState.windows[key]
        const { shown, ...risk } = forecast.risk ?? {}
        if (forecast.risk && record && JSON.stringify(record.risk ?? {}) !== JSON.stringify(risk)) {
          nextState = { windows: { ...nextState.windows, [key]: { ...record, risk } } }
          changed = true
        }
        return { ...window, forecast }
      }),
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
    storage: () => stateStore.usage(),
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
