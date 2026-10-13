import { useEffect, useRef, useState } from 'react'
import { recoveryCall } from './client-recovery.js'
import { fill } from './client-shared.js'
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
  const top = Math.max(total, ...rows.map(row => row.percent))
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
export function UsageHistory({ rpc, t, signedIn, resetKey }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ status: 'idle' })
  const [selected, setSelected] = useState(0)
  const request = useRef(0)
  useEffect(() => { request.current += 1; setState({ status: 'idle' }); setSelected(0) }, [signedIn, resetKey])
  useEffect(() => {
    if (!open || !signedIn || state.status !== 'idle') return
    const id = ++request.current
    setState({ status: 'loading' })
    void recoveryCall(rpc, 'usage/history', {})
      .then(value => { if (request.current === id) setState({ status: 'ready', value }) })
      .catch(error => { if (request.current === id) setState({ status: 'error', message: error.message }) })
  }, [open, signedIn, state.status, rpc])
  if (!signedIn) return null
  const value = state.value
  const periods = (value?.periods ?? []).filter(period => period.usedPercent !== undefined)
  const period = periods[Math.min(selected, Math.max(0, periods.length - 1))]
  const present = DIMENSIONS.filter(dimension => period?.breakdowns?.[dimension]?.length > 0)
  return <details className="codexSubscriptionHistory" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('historyTitle')}</summary>
    <div aria-live="polite">
      {state.status === 'loading' ? <p className="codexSubscriptionEmpty" role="status">{t('historyLoading')}</p> : null}
      {state.status === 'error' ? <p className="codexSubscriptionError" role="alert">{state.message}</p> : null}
      {state.status === 'ready' && value.available === false ? <p className="codexSubscriptionEmpty" role="status">{t('historyUnavailable')}</p> : null}
      {state.status === 'ready' && value.available !== false && period === undefined ? <p className="codexSubscriptionEmpty" role="status">{t('historyEmpty')}</p> : null}
    </div>
    {period === undefined ? null : <>
      <div className="codexSubscriptionHistoryPeriods" role="group" aria-label={t('historyPeriods')}>
        {periods.map((item, index) => <button type="button" key={item.startsAt} aria-pressed={item === period} onClick={() => setSelected(index)}>{`${day(item.startsAt)}–${day(item.endsAt)}`}</button>)}
      </div>
      <p className="codexSubscriptionHistorySummary">{fill(t('historyUsed'), { value: amount(period.usedPercent) })}{period.complete ? '' : ` ${t('historyPartial')}`}</p>
      {present.map(dimension => <Rows key={dimension} dimension={dimension} rows={period.breakdowns[dimension]} total={period.usedPercent} t={t} />)}
      {value.approximate ? <p className="codexSubscriptionCreditNote">{t('historyApproximate')}</p> : null}
    </>}
  </details>
}
