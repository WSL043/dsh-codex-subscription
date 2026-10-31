import { useEffect, useRef, useState } from 'react'
import { recoveryCall } from './client-recovery.js'
import { accessFailureText, fill, percent, uiLocale, windowLabel } from './client-shared.js'

const when = seconds => new Date(seconds * 1000).toLocaleString(uiLocale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Quota of every signed-in account (read-only; the active account does not change). */
export function useAccountQuotas(rpc, ids, active = true) {
  const [entries, setEntries] = useState({})
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  const flight = useRef()
  const activeRef = useRef(active)
  activeRef.current = active
  const key = ids.join(',')
  const load = force => {
    if (ids.length < 2) { setEntries({}); return }
    if (!activeRef.current || document.visibilityState === 'hidden') return
    if (flight.current) {
      const current = flight.current
      if (force && !current.force) return current.promise.catch(() => {}).then(() => request.current === current.id ? load(true) : undefined)
      return current.promise
    }
    const id = ++request.current
    setBusy(true)
    const current = { id, force }
    current.promise = recoveryCall(rpc, 'usage/accounts', { force })
      .then(value => { if (request.current === id) setEntries(Object.fromEntries((value?.accounts ?? []).map(entry => [entry.id, entry]))) })
      .catch(() => { if (request.current === id) setEntries(Object.fromEntries(ids.map(account => [account, { id: account, error: 'Could not read ChatGPT usage' }]))) })
      .finally(() => { if (flight.current === current) flight.current = undefined; if (request.current === id) setBusy(false) })
    flight.current = current
    return current.promise
  }
  useEffect(() => {
    if (ids.length < 2) { setEntries({}); setBusy(false) }
    return () => { request.current += 1; flight.current = undefined }
  }, [key, rpc])
  // Retain the snapshot, but only poll the visible account panel in a visible tab.
  useEffect(() => {
    if (ids.length < 2 || !active) return undefined
    let timer
    const stop = () => { clearInterval(timer); timer = undefined }
    const again = () => load(false)
    const wake = () => {
      stop()
      if (document.visibilityState === 'hidden') return
      void again()
      timer = setInterval(again, 60_000)
    }
    wake()
    window.addEventListener('codex-subscription:usage-loaded', again)
    document.addEventListener('visibilitychange', wake)
    return () => { window.removeEventListener('codex-subscription:usage-loaded', again); document.removeEventListener('visibilitychange', wake); stop() }
  }, [key, active, rpc])
  return { entries, busy, refresh: () => load(true) }
}

export function AccountQuota({ entry, loading, t }) {
  if (entry === undefined) return loading ? <small className="codexSubscriptionAccountQuota">{t('accountQuotaLoading')}</small> : null
  if (entry.error !== undefined) {
    const message = accessFailureText(entry.error, t)
    return <small className="codexSubscriptionAccountQuota" data-state="error">{entry.error === 'ChatGPT sign-in needs to be renewed' ? t('resetRenewLogin') : message !== entry.error ? message : t('accountQuotaError')}</small>
  }
  const windows = entry.usage?.rateLimits?.find(limit => limit.id === 'codex')?.windows ?? []
  if (windows.length === 0) return <small className="codexSubscriptionAccountQuota">{t('accountQuotaNone')}</small>
  return <small className="codexSubscriptionAccountQuota">{windows.map(window => <span key={window.windowSeconds}>
    {fill(t('accountQuotaLeft'), { label: windowLabel(window.windowSeconds, t), value: percent(window.remainingPercent) })}
    {window.resetsAt === undefined ? '' : ` · ${fill(t('accountQuotaResets'), { value: when(window.resetsAt) })}`}
  </span>)}</small>
}
