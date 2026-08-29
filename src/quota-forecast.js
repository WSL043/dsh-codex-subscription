const HOUR_MS = 60 * 60 * 1000
const HISTORY_MS = 24 * HOUR_MS
const MIN_SPAN_MS = 30 * 60 * 1000
const MIN_CONSUMED_PERCENT = 1
const PLATEAU_SAMPLE_MS = 15 * 60 * 1000

const finite = value => Number.isFinite(Number(value))
const clampPercent = value => Math.max(0, Math.min(100, Number(value)))
const keyFor = window => `codex:${Number(window.windowSeconds) || 'limit'}`

export function observeQuotaForecast(state, windows, now = Date.now()) {
  const next = { windows: { ...(state?.windows ?? {}) } }
  let changed = false
  for (const window of windows ?? []) {
    if (!finite(window?.remainingPercent)) continue
    const key = keyFor(window)
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

export function estimateQuotaForecast(state, window, now = Date.now()) {
  if (!finite(window?.remainingPercent)) return { status: 'calibrating' }
  const record = state?.windows?.[keyFor(window)]
  if (record === undefined) return { status: 'calibrating' }
  const resetsAt = finite(window.resetsAt) ? Number(window.resetsAt) : null
  if ((record.resetsAt === null) !== (resetsAt === null)
    || (resetsAt !== null && Math.abs(record.resetsAt - resetsAt) > 300)) return { status: 'calibrating' }
  const samples = record.samples.filter(sample => sample.at >= now - HISTORY_MS && sample.at <= now + 60_000)
  if (samples.length < 3) return { status: 'calibrating', sampleCount: samples.length }
  const first = samples[0]
  const last = samples.at(-1)
  const spanMs = last.at - first.at
  const consumedPercent = Math.max(0, first.remainingPercent - last.remainingPercent)
  if (spanMs < MIN_SPAN_MS || consumedPercent < MIN_CONSUMED_PERCENT) {
    return { status: 'calibrating', sampleCount: samples.length, observedSpanMs: spanMs, consumedPercent }
  }
  const firstAt = first.at
  const weighted = samples.map(sample => ({
    x: (sample.at - firstAt) / HOUR_MS,
    y: first.remainingPercent - sample.remainingPercent,
    weight: Math.exp((sample.at - last.at) / (6 * HOUR_MS)),
  }))
  const totalWeight = weighted.reduce((sum, point) => sum + point.weight, 0)
  const meanX = weighted.reduce((sum, point) => sum + point.x * point.weight, 0) / totalWeight
  const meanY = weighted.reduce((sum, point) => sum + point.y * point.weight, 0) / totalWeight
  const numerator = weighted.reduce((sum, point) => sum + point.weight * (point.x - meanX) * (point.y - meanY), 0)
  const denominator = weighted.reduce((sum, point) => sum + point.weight * (point.x - meanX) ** 2, 0)
  const pacePerHour = denominator > 0 ? numerator / denominator : 0
  if (!Number.isFinite(pacePerHour) || pacePerHour < 0.02) return { status: 'idle', pacePerHour: 0 }
  const runwaySeconds = clampPercent(window.remainingPercent) / pacePerHour * 3600
  const resetSeconds = resetsAt === null ? null : Math.max(0, resetsAt - now / 1000)
  return {
    status: 'ready',
    pacePerHour,
    runwaySeconds,
    survivesReset: resetSeconds !== null && runwaySeconds >= resetSeconds,
    sampleCount: samples.length,
    observedSpanMs: spanMs,
    consumedPercent,
  }
}

export function forecastUsage(usage, state = { windows: {} }, now = Date.now()) {
  const windows = usage?.rateLimits?.find(limit => limit.id === 'codex')?.windows ?? []
  const observed = observeQuotaForecast(state, windows, now)
  return {
    state: observed.state,
    changed: observed.changed,
    usage: {
    ...usage,
    rateLimits: (usage?.rateLimits ?? []).map(limit => limit.id !== 'codex' ? limit : ({
      ...limit,
      windows: limit.windows.map(window => ({ ...window, forecast: estimateQuotaForecast(observed.state, window, now) })),
    })),
    },
  }
}

export function createQuotaForecastReader({ reader, enabled, now = Date.now }) {
  let state = { windows: {} }
  return Object.freeze({
    async read(options) {
      const usage = await reader.read(options)
      if (!enabled()) {
        state = { windows: {} }
        return usage
      }
      const forecast = forecastUsage(usage, state, now())
      state = forecast.state
      return forecast.usage
    },
    clear() {
      state = { windows: {} }
      reader.clear()
    },
  })
}
