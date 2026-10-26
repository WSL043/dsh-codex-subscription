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
  return <section className="codexSubscriptionCard codexSubscriptionStorage" aria-label={t('storageForecast')}>
    <div className="codexSubscriptionStorageHead">
      <div className="codexSubscriptionStorageTitle"><h3>{t('storageForecast')}</h3><output role="status">{usage ? `${(usage.bytes / 1024).toFixed(1)} / ${(usage.limit / 1024).toFixed(0)} KiB` : t('storageLoading')}</output></div>
      <div className="codexSubscriptionActions">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void read(false)}>{t('runtimeRefresh')}</Button>
        <Button type="button" variant="outline" disabled={busy || !usage?.bytes} onClick={() => setConfirm(true)}>{t('storageClear')}</Button>
      </div>
    </div>
    {usage ? <div className="codexSubscriptionStorageMeter"><progress aria-label={t('storageForecast')} value={usage.bytes} max={usage.limit} /></div> : null}
    <p className="codexSubscriptionHelp">{t('storageHint')}</p>
    {confirm ? <div className="codexSubscriptionConfirm" role="group" aria-label={t('storageClear')}><p>{t('storageConfirm')}</p>
      <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(false)}>{t('sketchCancel')}</Button>{' '}
      <Button type="button" variant="outline" disabled={busy} onClick={() => void read(true)}>{t('storageClear')}</Button></div> : null}
    {error ? <p role="alert">{t('storageFailed')}</p> : null}
  </section>
}
