import { useEffect, useRef, useState } from 'react'
import { recoveryCall } from './client-recovery.js'
import { fill } from './client-shared.js'

// Numbers and dates follow the language DSH shows, not the browser's.
export const uiLocale = () => (typeof document === 'undefined' ? undefined : document.documentElement.lang || undefined)
const WEEKS = 26
const compact = value => new Intl.NumberFormat(uiLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const hours = seconds => (seconds >= 3600 ? `${Math.round(seconds / 360) / 10} h` : `${Math.max(1, Math.round(seconds / 60))} min`)
const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// The last half year of daily token use as a calendar grid, one cell per day, darker means busier.
export function UsageHeatmap({ days, t }) {
  const byDate = new Map(days.map(day => [day.date, day.tokens]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - ((WEEKS - 1) * 7 + today.getDay()))
  const cells = []
  for (let index = 0; index < WEEKS * 7; index += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    if (date > today) break
    cells.push({ date: key(date), tokens: byDate.get(key(date)) ?? 0, column: Math.floor(index / 7), row: index % 7 })
  }
  const busy = cells.map(cell => cell.tokens).filter(tokens => tokens > 0).sort((a, b) => a - b)
  const level = tokens => (tokens === 0 ? 0 : 1 + [0.25, 0.5, 0.75].filter(point => tokens > busy[Math.floor((busy.length - 1) * point)]).length)
  return <svg className="codexSubscriptionHeatmap" viewBox={`0 0 ${WEEKS * 14} ${7 * 14}`} role="img" aria-label={t('overviewHeatmap')}>
    {cells.map(cell => <rect key={cell.date} x={cell.column * 14} y={cell.row * 14} width="11" height="11" rx="2" data-level={level(cell.tokens)}>
      <title>{`${cell.date}: ${cell.tokens === 0 ? t('overviewNoUse') : fill(t('overviewTokens'), { value: compact(cell.tokens) })}`}</title>
    </rect>)}
  </svg>
}

// Lifetime statistics from the official profile report: totals, streaks and the daily heatmap.
export function UsageOverview({ rpc, t, signedIn, resetKey }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ status: 'idle' })
  const request = useRef(0)
  useEffect(() => { request.current += 1; setState({ status: 'idle' }) }, [signedIn, resetKey])
  useEffect(() => {
    if (!open || !signedIn || state.status !== 'idle') return
    const id = ++request.current
    setState({ status: 'loading' })
    void recoveryCall(rpc, 'usage/profile', {})
      .then(value => { if (request.current === id) setState({ status: 'ready', value }) })
      .catch(error => { if (request.current === id) setState({ status: 'error', message: error.message }) })
  }, [open, signedIn, state.status, rpc])
  if (!signedIn) return null
  const value = state.value
  const stats = value === undefined || value.available === false ? [] : [
    [t('overviewLifetime'), value.lifetimeTokens === undefined ? undefined : compact(value.lifetimeTokens)],
    [t('overviewPeak'), value.peakDailyTokens === undefined ? undefined : compact(value.peakDailyTokens)],
    [t('overviewStreak'), value.currentStreakDays === undefined ? undefined : fill(t('overviewDays'), { value: value.currentStreakDays })],
    [t('overviewLongestStreak'), value.longestStreakDays === undefined ? undefined : fill(t('overviewDays'), { value: value.longestStreakDays })],
    [t('overviewThreads'), value.totalThreads === undefined ? undefined : value.totalThreads.toLocaleString(uiLocale())],
    [t('overviewEffort'), value.mostUsedReasoningEffort === undefined ? undefined : `${value.mostUsedReasoningEffort}${value.mostUsedReasoningEffortPercent === undefined ? '' : ` · ${value.mostUsedReasoningEffortPercent}%`}`],
    [t('overviewFast'), value.fastModePercent === undefined ? undefined : `${value.fastModePercent}%`],
    [t('overviewLongestTurn'), value.longestRunningTurnSeconds === undefined ? undefined : hours(value.longestRunningTurnSeconds)],
  ].filter(([, text]) => text !== undefined)
  return <details className="codexSubscriptionHistory" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('overviewTitle')}</summary>
    <div aria-live="polite">
      {state.status === 'loading' ? <p className="codexSubscriptionEmpty" role="status">{t('overviewLoading')}</p> : null}
      {state.status === 'error' ? <p className="codexSubscriptionError" role="alert">{state.message}</p> : null}
      {state.status === 'ready' && stats.length === 0 ? <p className="codexSubscriptionEmpty" role="status">{t('overviewUnavailable')}</p> : null}
    </div>
    {stats.length === 0 ? null : <>
      <dl className="codexSubscriptionOverviewStats">{stats.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl>
      {value.days.length === 0 ? null : <UsageHeatmap days={value.days} t={t} />}
    </>}
  </details>
}
