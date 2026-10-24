import { forecastRunway } from './quota-pace.js'

/** A time estimate is anchored to the reading, never advanced by opening another view later. */
export function quotaForecastView(forecast, { fetchedAt, now = Date.now(), resetsAt, remainingPercent, refreshError = false } = {}) {
  if (refreshError || Number.isFinite(fetchedAt) && (fetchedAt > now || now - fetchedAt > 5 * 60_000)
    || Number.isFinite(resetsAt) && resetsAt * 1000 <= now) return { kind: 'stale' }
  if (remainingPercent === 0) return { kind: 'exhausted' }
  if (forecast?.status === 'calibrating') return { kind: forecast.reason ?? 'calibrating' }
  if (forecast?.status === 'idle') return { kind: 'idle' }
  if (!Number.isFinite(fetchedAt)) return { kind: 'calibrating' }
  if (forecast?.status === 'ready' && !forecast.provisional && Number.isFinite(forecast.runwayMinSeconds)
    && forecast.runwayMinSeconds > 0 && Number.isFinite(resetsAt) && fetchedAt + forecast.runwayMinSeconds * 1000 >= resetsAt * 1000) return { kind: 'reset' }
  const rawMin = !forecast?.provisional && Number.isFinite(forecast?.runwayMinSeconds) ? forecast.runwayMinSeconds : forecast?.runwaySeconds
  if (Number.isFinite(rawMin) && fetchedAt + rawMin * 1000 <= now) return { kind: 'stale' }
  const runway = forecastRunway({ ...forecast, survivesReset: false })
  if (!runway) return { kind: 'calibrating' }
  const anchor = fetchedAt
  const min = runway.kind === 'range' ? runway.min : runway.seconds
  const max = runway.kind === 'range' ? runway.max : runway.seconds
  // A completed estimate cannot be carried past its own earliest run-out time.
  if (anchor + min * 1000 <= now) return { kind: 'stale' }
  const grid = min < 3600 ? 5 * 60_000 : 3600_000
  const round = value => Math.round(value / grid) * grid
  return { kind: 'time', earliest: round(anchor + min * 1000), latest: round(anchor + max * 1000), provisional: forecast.provisional === true }
}

export function formatQuotaRunout(view, { t, locale, now = Date.now() }) {
  const midnight = time => { const date = new Date(time); return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() }
  const when = time => {
    const date = new Date(time), today = midnight(now)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const day = midnight(time) === today ? t('paceDay_today') : midnight(time) === tomorrow.getTime() ? t('paceDay_tomorrow')
      : date.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' })
    return `${day} ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })}`
  }
  if (view.kind !== 'time') return undefined
  const from = when(view.earliest), to = when(view.latest)
  return from === to ? from : `${from}–${to}`
}
