import { useCallback, useEffect, useRef, useState } from 'react'
import { recoveryCall } from './client-recovery.js'
import { accessFailureText, fill } from './client-shared.js'
import { historyPeriodKey, reportedHistoryPeriods, selectHistoryPeriod } from './history-pending.js'
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
export function UsageHistory({ rpc, t, signedIn, resetKey, refreshKey, forceRefreshKey }) {
  const [state, setState] = useState({ status: 'idle' })
  const [selected, setSelected] = useState()
  const request = useRef(0)
  const lastForceRefresh = useRef(forceRefreshKey)
  useEffect(() => { setSelected(undefined) }, [signedIn, resetKey])
  const load = useCallback(force => {
    if (!signedIn) return
    const id = ++request.current
    setState(previous => ({ status: 'loading', resetKey, value: previous.resetKey === resetKey ? previous.value : undefined }))
    void recoveryCall(rpc, 'usage/history', { force }, 20_000)
      .then(value => { if (request.current === id) setState({ status: 'ready', resetKey, value }) })
      .catch(error => { if (request.current === id) setState(previous => ({ status: 'error', resetKey, value: previous.resetKey === resetKey ? previous.value : undefined, message: error.message })) })
  }, [signedIn, rpc, resetKey])
  useEffect(() => {
    const force = lastForceRefresh.current !== forceRefreshKey
    lastForceRefresh.current = forceRefreshKey
    load(force)
    return () => { request.current += 1 }
  }, [signedIn, resetKey, refreshKey, forceRefreshKey, load])
  if (!signedIn) return null
  const value = state.resetKey === resetKey ? state.value : undefined
  const periods = value?.available === false ? [] : reportedHistoryPeriods(value?.periods)
  const period = selectHistoryPeriod(periods, selected)
  if (period === undefined) return null
  const present = DIMENSIONS.filter(dimension => period?.breakdowns?.[dimension]?.length > 0)
  return <details className="codexSubscriptionHistory">
    <summary>{t('historyTitle')}</summary>
    <button className="codexSubscriptionHistoryRefresh" type="button" disabled={state.status === 'loading'} onClick={() => load(true)}>{t('historyRefresh')}</button>
    <div aria-live="polite">
      {state.status === 'loading' ? <p className="codexSubscriptionEmpty" role="status">{t('historyLoading')}</p> : null}
      {state.status === 'error' ? <p className="codexSubscriptionError" role="alert">{accessFailureText(state.message, t)}</p> : null}
    </div>
      <div className="codexSubscriptionHistoryPeriods" role="group" aria-label={t('historyPeriods')}>
        {periods.map(item => <button type="button" key={historyPeriodKey(item)} aria-pressed={item === period} onClick={() => setSelected(historyPeriodKey(item))}>{`${day(item.startsAt)}–${day(item.endsAt)}`}</button>)}
      </div>
      {period.usedPercent !== undefined
        ? <p className="codexSubscriptionHistorySummary">{fill(t('historyUsed'), { value: amount(period.usedPercent) })}{period.complete ? '' : ` ${t('historyPartial')}`}</p>
        : <p className="codexSubscriptionEmpty" role="status">{t('historyTotalUnavailable')}</p>}
      {present.length === 0 ? <p className="codexSubscriptionEmpty" role="status">{t('historyNoBreakdown')}</p> : null}
      {present.map(dimension => <Rows key={dimension} dimension={dimension} rows={period.breakdowns[dimension]} total={period.usedPercent} t={t} />)}
      {value.asOf ? <p className="codexSubscriptionCreditNote">{fill(t('historyAsOf'), { date: new Date(value.asOf).toLocaleDateString(uiLocale(), { month: 'numeric', day: 'numeric' }) })}</p> : null}
      {value.approximate ? <p className="codexSubscriptionCreditNote">{t('historyApproximate')}</p> : null}
  </details>
}
