import { useEffect, useRef, useState } from 'react'
import { Button } from './client-primitives.js'
import { CHANNEL, unwrap } from './rpc-contract.js'

export function StorageCard({ rpc, t }) {
  const [usage, setUsage] = useState()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState(false)
  const mounted = useRef(false)
  const pending = useRef(false)
  const read = async clear => {
    if (pending.current) return
    pending.current = true
    setBusy(true); setError(false)
    try {
      const result = unwrap(await rpc.call(CHANNEL, clear ? 'storage/clear-forecast' : 'storage/status', {}))
      if (mounted.current) { setUsage(result); setConfirm(false) }
    } catch { if (mounted.current) setError(true) }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  useEffect(() => { mounted.current = true; void read(false); return () => { mounted.current = false } }, [rpc])
  return <div className="codexSubscriptionCard">
    <h3>{t('storageTitle')}</h3>
    <p>{t('storageHint')}</p>
    <p role="status">{usage ? `${t('storageForecast')}: ${(usage.bytes / 1024).toFixed(1)} / ${(usage.limit / 1024).toFixed(0)} KiB` : t('storageLoading')}</p>
    <div className="codexSubscriptionActions">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void read(false)}>{t('runtimeRefresh')}</Button>
      <Button type="button" variant="outline" disabled={busy || !usage?.bytes} onClick={() => setConfirm(true)}>{t('storageClear')}</Button>
    </div>
    {confirm ? <div role="group" aria-label={t('storageClear')}><p>{t('storageConfirm')}</p>
      <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(false)}>{t('sketchCancel')}</Button>{' '}
      <Button type="button" variant="outline" disabled={busy} onClick={() => void read(true)}>{t('storageClear')}</Button></div> : null}
    {error ? <p role="alert">{t('storageFailed')}</p> : null}
  </div>
}
