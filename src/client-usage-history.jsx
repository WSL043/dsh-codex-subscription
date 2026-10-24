import { useCallback, useEffect, useRef, useState } from 'react'
import { recoveryCall } from './client-recovery.js'
import { fill } from './client-shared.js'
import { historyPeriodKey, pendingReason, selectHistoryPeriod } from './history-pending.js'
import { uiLocale } from './client-usage-overview.jsx'

const DIMENSIONS = ['model', 'surface', 'thread_source', 'turn_trigger']
const LABELS = new Map([
  ['desktop_app', 'historyDesktopApp'], ['cli', 'historyCli'], ['ide_extension', 'historyIde'], ['web', 'historyWeb'], ['mobile', 'historyMobile'],
  ['user', 'historyUser'], ['subagent', 'historySubagent'], ['memory_consolidation', 'historyMemory'], ['review', 'historyReview'],
  ['composer', 'historyComposer'], ['automation', 'historyAutomation'],
])
const day = value => new Date(value).toLocaleDateString(uiLocale(), { month: 'numeric', day: 'numeric' })
const amount = value => (value > 0 && value < 0.1 ? '<0.1' : (value >= 10 ? Math.round(value) : Math.round(value * 10) / 10).toLocaleString(uiLocale()))
const labelOf = (dimension, key, t) => (dimension === 'model' ? key : LABELS.has(key) ? t(LABELS.get(key)) : key.replaceAll('_', ' '))

function Rows({ dimension, rows, total, t }) {
  const top = Math.max(total ?? 0, ...rows.map(row => row.percent))
  return <div className="codexSubscriptionHistoryGroup">
    <h4>{t(`historyBy_${dimension}`)}</h4>
    {rows.toSorted((a, b) => b.percent - a.percent).map(row => <div className="codexSubscriptionHistoryRow" key={row.key}>
      <span className="codexSubscriptionHistoryKey">{labelOf(dimension, row.key, t)}</span>
      <progress max={top} value={row.percent} aria-label={`${labelOf(dimension, row.key, t)} ${amount(row.percent)}%`} />
      <strong>{amount(row.percent)}%</strong>
    </div>)}
  </div>
}

// What the weekly allowance was spent on, from the same report the official Codex /usage dashboard shows.
export function UsageHistory({ rpc, t, signedIn, resetKey, refreshKey }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ status: 'idle' })
  const [selected, setSelected] = useState()
  const request = useRef(0)
  useEffect(() => { request.current += 1; setState({ status: 'idle' }); setSelected(undefined) }, [signedIn, resetKey])
  const load = useCallback(force => {
    if (!signedIn) return
    const id = ++request.current
    setState(previous => ({ status: 'loading', value: previous.value }))
    void recoveryCall(rpc, 'usage/history', { force }, 20_000)
      .then(value => { if (request.current === id) setState({ status: 'ready', value }) })
      .catch(error => { if (request.current === id) setState({ status: 'error', message: error.message }) })
  }, [signedIn, rpc])
  useEffect(() => {
    if (!open || !signedIn) return
    load(false)
    return () => { request.current += 1 }
  }, [open, signedIn, resetKey, refreshKey, load])
  if (!signedIn) return null
  const value = state.value
  // Newest first, including periods for which the official report has not supplied figures.
  const periods = [...(value?.periods ?? [])].sort((a, b) => b.startsAt - a.startsAt)
  const period = selectHistoryPeriod(periods, selected)
  const reason = period === undefined ? undefined : pendingReason(period)
  const asOfDate = value?.asOf ? new Date(value.asOf).toLocaleDateString(uiLocale(), { month: 'numeric', day: 'numeric' }) : ''
  const present = DIMENSIONS.filter(dimension => period?.breakdowns?.[dimension]?.length > 0)
  return <details className="codexSubscriptionHistory" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('historyTitle')}</summary>
    <button className="codexSubscriptionHistoryRefresh" type="button" disabled={state.status === 'loading'} onClick={() => load(true)}>{t('historyRefresh')}</button>
    <div aria-live="polite">
      {state.status === 'loading' ? <p className="codexSubscriptionEmpty" role="status">{t('historyLoading')}</p> : null}
      {state.status === 'error' ? <p className="codexSubscriptionError" role="alert">{state.message}</p> : null}
      {state.status === 'ready' && value?.available === false ? <p className="codexSubscriptionEmpty" role="status">{t('historyUnavailable')}</p> : null}
      {state.status === 'ready' && value?.available !== false && period === undefined ? <p className="codexSubscriptionEmpty" role="status">{t('historyEmpty')}</p> : null}
    </div>
    {period === undefined ? null : <>
      <div className="codexSubscriptionHistoryPeriods" role="group" aria-label={t('historyPeriods')}>
        {periods.map(item => <button type="button" key={historyPeriodKey(item)} aria-pressed={item === period} title={item.usedPercent === undefined ? t('historyPending') : undefined} onClick={() => setSelected(historyPeriodKey(item))}>{`${day(item.startsAt)}–${day(item.endsAt)}`}</button>)}
      </div>
      {reason === undefined
        ? <p className="codexSubscriptionHistorySummary">{fill(t('historyUsed'), { value: amount(period.usedPercent) })}{period.complete ? '' : ` ${t('historyPartial')}`}</p>
        : <p className="codexSubscriptionEmpty" role="status">{fill(t(reason === 'current' ? 'historyPendingCurrent' : asOfDate ? 'historyPendingPast' : 'historyPendingPastUnknown'), { date: asOfDate })}</p>}
      {reason === undefined && present.length === 0 ? <p className="codexSubscriptionEmpty" role="status">{t('historyNoBreakdown')}</p> : null}
      {present.map(dimension => <Rows key={dimension} dimension={dimension} rows={period.breakdowns[dimension]} total={period.usedPercent} t={t} />)}
      {value.asOf ? <p className="codexSubscriptionCreditNote">{fill(t('historyAsOf'), { date: new Date(value.asOf).toLocaleDateString(uiLocale(), { month: 'numeric', day: 'numeric' }) })}</p> : null}
      {value.approximate ? <p className="codexSubscriptionCreditNote">{t('historyApproximate')}</p> : null}
    </>}
  </details>
}
