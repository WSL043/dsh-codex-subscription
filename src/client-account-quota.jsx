import { useEffect, useRef, useState } from 'react'
import { recoveryCall } from './client-recovery.js'
import { fill, percent, uiLocale, windowLabel } from './client-shared.js'

const when = seconds => new Date(seconds * 1000).toLocaleString(uiLocale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Quota of every signed-in account (read-only; the active account does not change). */
export function useAccountQuotas(rpc, ids) {
  const [entries, setEntries] = useState({})
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  const key = ids.join(',')
  const load = force => {
    if (ids.length < 2) { setEntries({}); return }
    const id = ++request.current
    setBusy(true)
    void recoveryCall(rpc, 'usage/accounts', { force })
      .then(value => { if (request.current === id) setEntries(Object.fromEntries((value?.accounts ?? []).map(entry => [entry.id, entry]))) })
      .catch(() => { if (request.current === id) setEntries(Object.fromEntries(ids.map(account => [account, { id: account, error: 'Could not read ChatGPT usage' }]))) })
      .finally(() => { if (request.current === id) setBusy(false) })
  }
  useEffect(() => { load(false); return () => { request.current += 1 } }, [key])
  // Stay current: when the usage card reloads, and once a minute while the page is open (the server caches, so this is cheap).
  useEffect(() => {
    if (ids.length < 2) return undefined
    const again = () => load(false)
    window.addEventListener('codex-subscription:usage-loaded', again)
    const timer = setInterval(again, 60_000)
    return () => { window.removeEventListener('codex-subscription:usage-loaded', again); clearInterval(timer) }
  }, [key])
  return { entries, busy, refresh: () => load(true) }
}

export function AccountQuota({ entry, loading, t }) {
  if (entry === undefined) return loading ? <small className="codexSubscriptionAccountQuota">{t('accountQuotaLoading')}</small> : null
  if (entry.error !== undefined) return <small className="codexSubscriptionAccountQuota" data-state="error">{entry.error === 'ChatGPT sign-in needs to be renewed' ? t('resetRenewLogin') : t('accountQuotaError')}</small>
  const windows = entry.usage?.rateLimits?.find(limit => limit.id === 'codex')?.windows ?? []
  if (windows.length === 0) return <small className="codexSubscriptionAccountQuota">{t('accountQuotaNone')}</small>
  return <small className="codexSubscriptionAccountQuota">{windows.map(window => <span key={window.windowSeconds}>
    {fill(t('accountQuotaLeft'), { label: windowLabel(window.windowSeconds, t), value: percent(window.remainingPercent) })}
    {window.resetsAt === undefined ? '' : ` · ${fill(t('accountQuotaResets'), { value: when(window.resetsAt) })}`}
  </span>)}</small>
}
