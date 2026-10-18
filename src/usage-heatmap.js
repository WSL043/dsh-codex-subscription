const pad = value => String(value).padStart(2, '0')
export const dayKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** Monday-first for locales that start the week there; Intl knows, with Sunday as the fallback. */
export function firstWeekday(locale) {
  try {
    const info = new Intl.Locale(locale ?? 'en-US')
    const day = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay
    return Number.isInteger(day) ? day % 7 : 0
  } catch { return 0 }
}

/**
 * Grid cells for the last `weeks` weeks. The report's day keys carry no time zone, so the grid never ends before the newest
 * day the report has: late in the evening or early morning the report can be a day ahead of the local calendar, and that
 * day would otherwise fall off the grid.
 */
export function heatmapCells(days, { now = new Date(), weeks = 26, firstDay = 0 } = {}) {
  const byDate = new Map(days.map(day => [day.date, day.tokens]))
  const end = new Date(now); end.setHours(0, 0, 0, 0)
  for (const day of days) {
    const [year, month, date] = day.date.split('-').map(Number)
    const parsed = new Date(year, month - 1, date)
    if (parsed > end && parsed - end <= 2 * 86_400_000) end.setTime(parsed.getTime())
  }
  const start = new Date(end)
  start.setDate(start.getDate() - ((weeks - 1) * 7 + ((end.getDay() - firstDay + 7) % 7)))
  const cells = []
  for (let index = 0; index < weeks * 7; index += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    if (date > end) break
    cells.push({ date: dayKey(date), tokens: byDate.get(dayKey(date)) ?? 0, column: Math.floor(index / 7), row: index % 7 })
  }
  return cells
}

/** "32.1 小时" / "5 分钟": the unit words come from the interface language. */
export function formatDuration(seconds, t) {
  return seconds >= 3600
    ? t('overviewHours').replace('{value}', String(Math.round(seconds / 360) / 10))
    : t('overviewMinutes').replace('{value}', String(Math.max(1, Math.round(seconds / 60))))
}
