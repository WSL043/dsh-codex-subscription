const HOUR_MS = 60 * 60 * 1000
const HISTORY_MS = 24 * HOUR_MS
const MIN_SAMPLES = 3
const PLATEAU_SAMPLE_MS = 15 * 60 * 1000

const finite = value => Number.isFinite(Number(value))
const clampPercent = value => Math.max(0, Math.min(100, Number(value)))
const cleanSegment = value => String(value ?? 'default').slice(0, 96)
const keyFor = (window, context = {}) => JSON.stringify([
  cleanSegment(context.scope),
  cleanSegment(context.limitId ?? 'codex'),
  Number(window.windowSeconds) || 'limit',
])
const median = values => {
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle]
}

function requiredSpanMs(consumedPercent) {
  if (consumedPercent >= 2) return 5 * 60 * 1000
  if (consumedPercent >= 1) return 10 * 60 * 1000
  if (consumedPercent >= 0.5) return 20 * 60 * 1000
  return 30 * 60 * 1000
}

export function observeQuotaForecast(state, windows, now = Date.now(), context = {}) {
  const next = { windows: { ...(state?.windows ?? {}) } }
  let changed = false
  for (const window of windows ?? []) {
    if (!finite(window?.remainingPercent)) continue
    const key = keyFor(window, context)
    const resetsAt = finite(window.resetsAt) ? Number(window.resetsAt) : null
    const remainingPercent = Math.round(clampPercent(window.remainingPercent) * 10_000) / 10_000
    const previous = next.windows[key]
    const resetChanged = previous !== undefined && (
      (previous.resetsAt === null) !== (resetsAt === null)
      || (previous.resetsAt !== null && Math.abs(previous.resetsAt - resetsAt) > 300)
    )
    const last = previous?.samples?.at(-1)
    const quotaIncreased = last !== undefined && remainingPercent > last.remainingPercent + 0.5
    const record = resetChanged || quotaIncreased
      ? { resetsAt, samples: [] }
      : { resetsAt, samples: [...(previous?.samples ?? [])] }
    const latest = record.samples.at(-1)
    if (latest === undefined || (now > latest.at && (
      Math.abs(remainingPercent - latest.remainingPercent) >= 0.001
      || now - latest.at >= PLATEAU_SAMPLE_MS
    ))) {
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
  const samples = record.samples.filter(sample => sample.at >= now - HISTORY_MS && sample.at <= now + 60_000)
  if (samples.length < MIN_SAMPLES) return { status: 'calibrating', sampleCount: samples.length }
  const first = samples[0]
  const last = samples.at(-1)
  const spanMs = last.at - first.at
  const consumedPercent = Math.max(0, first.remainingPercent - last.remainingPercent)
  if (spanMs < requiredSpanMs(consumedPercent)) {
    return { status: 'calibrating', sampleCount: samples.length, observedSpanMs: spanMs, consumedPercent }
  }

  const slopes = []
  for (let left = 0; left < samples.length - 1; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      const hours = (samples[right].at - samples[left].at) / HOUR_MS
      if (hours <= 0) continue
      slopes.push((samples[left].remainingPercent - samples[right].remainingPercent) / hours)
    }
  }
  const positive = slopes.filter(value => Number.isFinite(value) && value >= 0)
  const pacePerHour = positive.length === 0 ? 0 : median(positive)
  if (!Number.isFinite(pacePerHour) || pacePerHour < 0.02) {
    return { status: 'idle', pacePerHour: 0, sampleCount: samples.length, observedSpanMs: spanMs, consumedPercent }
  }
  const deviations = positive.map(value => Math.abs(value - pacePerHour))
  const uncertaintyPerHour = deviations.length === 0 ? 0 : median(deviations) * 1.4826
  const lowerPacePerHour = Math.max(0.02, pacePerHour - uncertaintyPerHour)
  const upperPacePerHour = pacePerHour + uncertaintyPerHour
  const remaining = clampPercent(window.remainingPercent)
  const runwaySeconds = remaining / pacePerHour * 3600
  const runwayMinSeconds = remaining / upperPacePerHour * 3600
  const runwayMaxSeconds = remaining / lowerPacePerHour * 3600
  const resetSeconds = resetsAt === null ? null : Math.max(0, resetsAt - now / 1000)
  return {
    status: 'ready',
    pacePerHour,
    uncertaintyPerHour,
    runwaySeconds,
    runwayMinSeconds,
    runwayMaxSeconds,
    survivesReset: resetSeconds !== null && runwayMinSeconds >= resetSeconds,
    sampleCount: samples.length,
    observedSpanMs: spanMs,
    consumedPercent,
  }
}

export function forecastUsage(usage, state = { windows: {} }, now = Date.now(), options = {}) {
  let nextState = state
  let changed = false
  const rateLimits = (usage?.rateLimits ?? []).map(limit => {
    const context = { scope: options.scope, limitId: limit.id }
    const observed = observeQuotaForecast(nextState, limit.windows, now, context)
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
  const load = async () => {
    if (loaded) return
    loaded = true
    const restored = await stateStore?.load?.()
    if (restored?.windows !== null && typeof restored?.windows === 'object') state = restored
  }
  return Object.freeze({
    async read(options) {
      const usage = await reader.read(options)
      await load()
      if (!enabled()) {
        state = { windows: {} }
        await stateStore?.clear?.()
        return usage
      }
      const forecast = forecastUsage(usage, state, now(), { scope: await scope() })
      state = forecast.state
      if (forecast.changed) await stateStore?.save?.(state)
      return forecast.usage
    },
    async clear() {
      state = { windows: {} }
      loaded = true
      reader.clear()
      await stateStore?.clear?.()
    },
    clearCache() {
      reader.clear()
    },
    async clearScope(targetScope) {
      await load()
      const prefix = `[${JSON.stringify(cleanSegment(targetScope))},`
      state = {
        windows: Object.fromEntries(Object.entries(state.windows).filter(([key]) => !key.startsWith(prefix))),
      }
      await stateStore?.save?.(state)
    },
  })
}
