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
