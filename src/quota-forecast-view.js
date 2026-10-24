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

export function formatQuotaRunout(view, { t, locale, now = Date.now(), timeZone }) {
  // Calendar days and day parts belong to the viewer's time zone, independently
  // of interface language. UTC day serials avoid 23/25-hour DST-day arithmetic.
  const clock = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' })
  const local = time => {
    const fields = Object.fromEntries(clock.formatToParts(time).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
    return { day: Date.UTC(fields.year, fields.month - 1, fields.day), hour: fields.hour }
  }
  const today = local(now).day
  const render = (key, values) => Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key))
  const when = time => {
    const date = local(time), gap = (date.day - today) / 86_400_000
    const day = gap === 0 ? t('paceDay_today') : gap === 1 ? t('paceDay_tomorrow')
      : new Intl.DateTimeFormat(locale, gap > 1 && gap < 7 ? { timeZone, weekday: locale?.startsWith('zh') ? 'short' : 'long' } : { timeZone, month: 'numeric', day: 'numeric' }).format(time)
    const part = date.hour < 5 ? 'early' : date.hour < 12 ? 'morning' : date.hour < 18 ? 'afternoon' : date.hour < 23 ? 'evening' : 'night'
    const partText = t(`pacePart_${part}`)
    const key = gap === 0 ? part === 'early' ? 'quotaWhenEarlyToday' : part === 'night' ? 'quotaWhenTonight' : 'quotaWhenToday'
      : part === 'early' ? 'quotaWhenEarly' : 'paceWhen'
    return { day: date.day, period: part, part: partText, label: render(key, { day, part: partText }) }
  }
  if (view.kind !== 'time') return undefined
  const from = when(view.earliest), to = when(view.latest)
  if (from.label === to.label) return from.label
  const end = from.day === to.day ? render('quotaWhenRangeEnd', { part: to.part, label: to.label }) : to.label
  const key = from.day === to.day && from.period === 'early' && to.period === 'morning' ? 'quotaWhenEarlyMorningRange' : 'quotaWhenRange'
  return render(key, { from: from.label, to: end, latest: to.label })
}
