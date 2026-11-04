import { useEffect, useRef, useState } from 'react'
import { recoveryCall } from './client-recovery.js'
import { SIGN_IN_RENEW } from './http-failure.js'
import { accessFailureText, fill, percent, uiLocale, windowLabel } from './client-shared.js'

const when = seconds => new Date(seconds * 1000).toLocaleString(uiLocale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Quota of every signed-in account (read-only; the active account does not change). */
export function useAccountQuotas(rpc, ids, active = true, revision = 0) {
  const [entries, setEntries] = useState({})
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  const flight = useRef()
  const activeRef = useRef(active)
  activeRef.current = active
  const key = ids.join(',')
  const load = force => {
    if (ids.length === 0) return
    if (!activeRef.current || document.visibilityState === 'hidden') return
    if (flight.current) {
      const current = flight.current
      if (force && !current.force) return current.promise.catch(() => {}).then(() => request.current === current.id ? load(true) : undefined)
      return current.promise
    }
    const id = ++request.current
    // A refresh is not an account change. Retain the last result while pending;
    // a completed failure still replaces it with unknown/expired as appropriate.
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
    setEntries({})
    setBusy(false)
    return () => { request.current += 1; flight.current = undefined }
  }, [key, revision, rpc])
  // Retain the snapshot, but only poll the visible account panel in a visible tab.
  useEffect(() => {
    if (ids.length === 0 || !active) return undefined
    let timer
    const stop = () => { clearInterval(timer); timer = undefined }
    const again = () => load(false)
    const wake = () => {
      stop()
      if (document.visibilityState === 'hidden') return
      void load(true)
      timer = setInterval(again, 60_000)
    }
    wake()
    window.addEventListener('codex-subscription:usage-loaded', again)
    document.addEventListener('visibilitychange', wake)
    return () => { window.removeEventListener('codex-subscription:usage-loaded', again); document.removeEventListener('visibilitychange', wake); stop() }
  }, [key, revision, active, rpc])
  return { entries, busy, refresh: () => load(true) }
}

export function AccountQuota({ entry, loading, showQuota, t }) {
  const state = entry === undefined ? loading ? 'loading' : 'unknown'
    : entry.error === SIGN_IN_RENEW ? 'disconnected' : entry.error !== undefined || entry.usage === undefined ? 'unknown' : 'connected'
  const label = {
    connected: 'accountVerified', disconnected: 'accountRenewSignIn',
    loading: 'accountVerifying', unknown: 'accountUnverified',
  }[state]
  const status = <span className="codexSubscriptionStatus"><span className="codexSubscriptionDot" data-state={state} aria-hidden="true" />{t(label)}</span>
  if (entry?.error !== undefined && state !== 'disconnected') {
    const message = accessFailureText(entry.error, t)
    return <small className="codexSubscriptionAccountQuota" role="status">{status}{message !== entry.error ? message : null}</small>
  }
  if (state !== 'connected' || !showQuota) return <small className="codexSubscriptionAccountQuota" role="status">{status}</small>
  const windows = entry.usage?.rateLimits?.find(limit => limit.id === 'codex')?.windows ?? []
  return <small className="codexSubscriptionAccountQuota" role="status">{status}{windows.length === 0 ? t('accountQuotaNone') : windows.map(window => <span key={window.windowSeconds}>
    {fill(t('accountQuotaLeft'), { label: windowLabel(window.windowSeconds, t), value: percent(window.remainingPercent) })}
    {window.resetsAt === undefined ? '' : ` · ${fill(t('accountQuotaResets'), { value: when(window.resetsAt) })}`}
  </span>)}</small>
}
