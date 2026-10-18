/**
 * Will a long quota window run out before it resets, if the use so far simply continues? The same plain projection Claude
 * Desktop uses for its weekly limit: the average rate since the window began, carried forward. It needs no history, only the
 * percentage used, when the window resets and how long the window is. Short windows (a few hours) are not projected: their
 * use comes in bursts, so an average says little.
 */
const HOUR = 3_600_000
export const PACE_MIN_WINDOW_SECONDS = 24 * 3600
export const PACE_MIN_USED_PERCENT = 10
export const PACE_MIN_ELAPSED_MS = 12 * HOUR

/** @returns {{runsOutAt:number, resetsAt:number}|undefined} times in ms, only when the window is projected to run out before its reset. */
export function quotaPace({ remainingPercent, windowSeconds, resetsAt, now = Date.now() }) {
  if (!Number.isFinite(remainingPercent) || !Number.isSafeInteger(windowSeconds) || windowSeconds < PACE_MIN_WINDOW_SECONDS || !Number.isSafeInteger(resetsAt)) return undefined
  const used = Math.floor(Math.min(100, Math.max(0, 100 - remainingPercent)))
  if (used < PACE_MIN_USED_PERCENT || used >= 100) return undefined
  const resetMs = resetsAt * 1000
  const elapsed = now - (resetMs - windowSeconds * 1000)
  if (!(elapsed >= PACE_MIN_ELAPSED_MS) || resetMs <= now) return undefined
  const runsOutAt = now + (100 - used) * elapsed / used
  return runsOutAt < resetMs ? { runsOutAt, resetsAt: resetMs } : undefined
}

const dayStart = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** Plain words for a moment: the day (today, tomorrow, the weekday, or the date) and, for the run-out time, the part of the day. */
export function paceWords(pace, now, { t, locale }) {
  const today = dayStart(new Date(now))
  const day = date => {
    const gap = Math.round((dayStart(date) - today) / 86_400_000)
    if (gap <= 0) return t('paceDay_today')
    if (gap === 1) return t('paceDay_tomorrow')
    if (gap < 7) return date.toLocaleDateString(locale, { weekday: locale.startsWith('zh') || locale.startsWith('ja') ? 'short' : 'long' })
    return date.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' })
  }
  const out = new Date(pace.runsOutAt), reset = new Date(pace.resetsAt)
  const hour = out.getHours()
  const part = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : hour < 23 ? 'evening' : 'night'
  return { runOut: t('paceWhen').replace('{day}', day(out)).replace('{part}', t(`pacePart_${part}`)), reset: t('paceResetOf').replace('{day}', day(reset)) }
}

/**
 * One reading of a runway forecast for every place that shows it (settings card, composer chip, composer details), so the
 * same snapshot always reads the same hours. Raw seconds are rounded to a grid coarser than the percentage quantisation
 * noise: 5 minutes under an hour, whole hours under 48 h, 6 hours above.
 */
export function roundRunwaySeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return seconds
  const hours = seconds / 3600
  if (hours < 1) return Math.max(300, Math.round(seconds / 300) * 300)
  if (hours < 48) return Math.max(1, Math.round(hours)) * 3600
  return Math.round(hours / 6) * 6 * 3600
}

/** @returns {{kind:'reset'}|{kind:'range',min:number,max:number}|{kind:'point',seconds:number}|undefined} rounded seconds. */
export function forecastRunway(forecast) {
  if (forecast?.status !== 'ready') return undefined
  if (forecast.survivesReset) return { kind: 'reset' }
  if (!forecast.provisional && Number.isFinite(forecast.runwayMinSeconds) && Number.isFinite(forecast.runwayMaxSeconds)) {
    const min = roundRunwaySeconds(forecast.runwayMinSeconds), max = roundRunwaySeconds(forecast.runwayMaxSeconds)
    if (min > 0 && max > min) return { kind: 'range', min, max }
  }
  const seconds = roundRunwaySeconds(forecast.runwaySeconds)
  return Number.isFinite(seconds) && seconds > 0 ? { kind: 'point', seconds } : undefined
}
