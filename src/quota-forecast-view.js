import { forecastRunway } from './quota-pace.js'

export function quotaReadingIsStale({ fetchedAt, now = Date.now(), resetsAt, refreshError = false }) {
  return refreshError || (Number.isFinite(fetchedAt) && (fetchedAt > now || now - fetchedAt > 5 * 60_000))
    || (Number.isFinite(resetsAt) && resetsAt * 1000 <= now)
}

const DISPLAY_RISK_BANDS = { low: [0, 0.15], possible: [0.15, 0.5], likely: [0.5, 0.8], 'very-likely': [0.8, 1] }
const HOUR_MS = 3_600_000

// `runOutProbability` + `lastsProbability` = 1; `ifRunsOut` is conditional on
// running out and must be worded that way; `runOutBy` is unconditional.
function riskView(forecast, { windowSeconds } = {}) {
  const outlook = forecast?.exhaustion, level = forecast?.risk?.shown
  if (outlook === undefined || outlook.status === 'exhausted') return undefined
  if (outlook.status !== 'ready' || level === undefined || level === 'hold') return { level: 'hold', reason: outlook.reason ?? 'early-cycle' }
  const [floor, ceiling] = DISPLAY_RISK_BANDS[level]
  const probability = Math.min(ceiling, Math.max(floor, Math.round(outlook.probability * 20) / 20))
  const view = { level, runOutProbability: probability, lastsProbability: 1 - probability,
    extreme: (level === 'low' && outlook.probability < 0.05) || (level === 'very-likely' && outlook.probability > 0.95),
    uncertain: outlook.probabilityHigh - outlook.probabilityLow > 0.25 || outlook.misfit === true, runOutBy: outlook.runOutCurve }
  if (outlook.horizonHours >= 24 && outlook.elapsedHours > 0) {
    view.dailyUsed = outlook.usedPercent / outlook.elapsedHours * 24
    view.dailyBudget = outlook.needPacePerHour * 24
  }
  const range = outlook.runOutAt
  if (range && !view.uncertain && level !== 'low') {
    const width = range.q90 - range.q10
    const limit = Math.max(12 * HOUR_MS, 0.3 * (windowSeconds ?? 604800) * 1000)
    if (width <= 24 * HOUR_MS) view.ifRunsOut = { grain: 'part', earliest: range.q50, latest: range.q50 }
    else if (width <= limit) view.ifRunsOut = { grain: 'part', earliest: range.q10, latest: range.q90 }
    else view.ifRunsOut = { grain: 'day', earliest: range.q50, latest: range.q50 }
  }
  return view
}

/** A time estimate is anchored to the reading, never advanced by opening another view later. */
export function quotaForecastView(forecast, options = {}) {
  const view = shortHorizonView(forecast, options)
  if (view.kind === 'stale' || view.kind === 'exhausted') return view
  const risk = riskView(forecast, options)
  return risk === undefined ? view : { ...view, risk }
}

function shortHorizonView(forecast, { fetchedAt, now = Date.now(), resetsAt, remainingPercent, refreshError = false } = {}) {
  if (quotaReadingIsStale({ fetchedAt, now, resetsAt, refreshError })) return { kind: 'stale' }
  if (remainingPercent === 0) return { kind: 'exhausted' }
  if (forecast?.status === 'calibrating') return { kind: forecast.reason ?? 'calibrating' }
  if (forecast?.status === 'flat' || forecast?.status === 'idle') return { kind: 'idle', upperPacePerHour: forecast.upperPacePerHour, spanMs: forecast.observedSpanMs }
  if (!Number.isFinite(fetchedAt)) return { kind: 'calibrating' }
  if (forecast?.status === 'ready' && !forecast.provisional && (typeof forecast.survivesReset !== 'string' || forecast.survivesReset === 'yes') && Number.isFinite(forecast.runwayMinSeconds)
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
  const earliest = round(anchor + min * 1000), latest = round(anchor + max * 1000)
  // A range that spans a reset cannot predict when the current allowance runs out.
  const rawMax = !forecast.provisional && Number.isFinite(forecast.runwayMaxSeconds) ? forecast.runwayMaxSeconds : forecast.runwaySeconds
  if (Number.isFinite(resetsAt) && Math.max(latest, anchor + rawMax * 1000) >= resetsAt * 1000) return { kind: 'calibrating' }
  return { kind: 'time', earliest, latest, provisional: forecast.provisional === true }
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
  const weekday = time => {
    const japanese = locale?.toLowerCase().split('-')[0] === 'ja'
    const day = new Intl.DateTimeFormat(locale, { timeZone, weekday: japanese || locale?.startsWith('zh') ? 'short' : 'long' }).format(time)
    return japanese ? `${day}曜` : day
  }
  if (view.grain === 'day') return weekday(view.earliest)
  const when = time => {
    const date = local(time), gap = (date.day - today) / 86_400_000
    const day = view.grain === 'part' ? weekday(time) : gap === 0 ? t('paceDay_today') : gap === 1 ? t('paceDay_tomorrow')
      : new Intl.DateTimeFormat(locale, gap > 1 && gap < 7 ? { timeZone, weekday: locale?.startsWith('zh') ? 'short' : 'long' } : { timeZone, month: 'numeric', day: 'numeric' }).format(time)
    const part = date.hour < 5 ? 'early' : date.hour < 12 ? 'morning' : date.hour < 18 ? 'afternoon' : date.hour < 23 ? 'evening' : 'night'
    const partText = t(`pacePart_${part}`)
    const key = view.grain === 'part' ? (part === 'early' ? 'quotaOutlookEarly' : 'quotaOutlookPart')
      : gap === 0 ? part === 'early' ? 'quotaWhenEarlyToday' : part === 'night' ? 'quotaWhenTonight' : 'quotaWhenToday'
      : part === 'early' ? 'quotaWhenEarly' : 'paceWhen'
    return { day: date.day, period: part, part: partText, label: render(key, { day, part: partText }) }
  }
  if (view.kind !== 'time') return undefined
  const from = when(view.earliest), to = when(view.latest)
  if (from.day === to.day && from.label === to.label) return from.label
  if (view.grain === 'part' && from.day !== to.day) return render('quotaOutlookRange', { from: from.label, to: to.label })
  const end = from.day === to.day ? render('quotaWhenRangeEnd', { part: to.part, label: to.label }) : to.label
  const key = from.day === to.day && from.period === 'early' && to.period === 'morning' ? 'quotaWhenEarlyMorningRange' : 'quotaWhenRange'
  return render(key, { from: from.label, to: end, latest: to.label })
}
