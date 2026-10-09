import { useEffect, useRef, useState } from 'react'
import { create as createQr } from 'qrcode/lib/core/qrcode.js'
import { Button } from './client-primitives.js'
import { CHANNEL } from './rpc-contract.js'

const PAIR_URL = 'https://chatgpt.com/codex/pair?pairing_code='
const STATUS_KEYS = { connected: 'remoteConnected', connecting: 'remoteConnecting', waiting: 'remoteWaiting', error: 'remoteError', stopped: 'remoteStopped' }
const MARGIN = 2

// Only the encoder is imported: the package's own renderers pull in Node's fs.
function Qr({ value, label }) {
  let modules
  try { modules = createQr(value, { errorCorrectionLevel: 'M' }).modules } catch { return null }
  const size = modules.size
  let path = ''
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) if (modules.get(row, column)) path += `M${column + MARGIN} ${row + MARGIN}h1v1h-1z`
  const span = size + MARGIN * 2
  return <div className="codexSubscriptionRemoteQr" role="img" aria-label={label}>
    <svg viewBox={`0 0 ${span} ${span}`} shapeRendering="crispEdges" aria-hidden="true"><rect width={span} height={span} fill="#fff" /><path d={path} fill="#000" /></svg>
  </div>
}

/** Beta: show this DSH in the ChatGPT mobile app's Codex list (Remote Control). */
export function RemoteControlCard({ rpc, preference, snapshot, t }) {
  const [state, setState] = useState()
  const [pairing, setPairing] = useState()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(Date.now())
  const alive = useRef(false)
  const on = snapshot.remoteControl === 'on'
  const read = async () => {
    try {
      const result = await rpc.call(CHANNEL, 'remote/status', {})
      if (alive.current && result.ok) setState(result.value)
    } catch { /* the next poll retries */ }
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!on) { setState(undefined); setPairing(undefined); return undefined }
    let stopped = false, timer
    const poll = async () => { await read(); if (!stopped) timer = setTimeout(poll, 4000) }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [on, rpc])
  useEffect(() => {
    if (!pairing) return undefined
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [pairing])
  const pair = async () => {
    if (busy) return
    setBusy(true); setFailed(false)
    try {
      const result = await rpc.call(CHANNEL, 'remote/pair', {})
      if (!alive.current) return
      if (!result.ok) { setFailed(true); return }
      setPairing(result.value); setNow(Date.now())
      void read()
    } catch { if (alive.current) setFailed(true) } finally { if (alive.current) setBusy(false) }
  }
  const expired = pairing && pairing.expiresAt <= now
  const minutes = pairing ? Math.max(0, Math.ceil((pairing.expiresAt - now) / 60000)) : 0
  const status = state?.status ?? 'connecting'
  return <section className="codexSubscriptionCard codexSubscriptionPreferencesCard" aria-label={t('remoteTitle')}>
    <div className="codexSubscriptionPreference">
      <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('remoteTitle')} <small>Beta</small></span><span className="codexSubscriptionPreferenceHint">{t('remoteHint')}</span></div>
      <div className="codexSubscriptionQuotaModes" role="radiogroup" aria-label={t('remoteTitle')} aria-busy={snapshot.saving || undefined}>
        {['off', 'on'].map(value => <label key={value} className="codexSubscriptionQuotaMode"><input type="radio" name="codex-remote-control" checked={snapshot.remoteControl === value} disabled={!snapshot.writable} onChange={() => { void preference.set({ remoteControl: value }) }} /><span>{t(`remote_${value}`)}</span></label>)}
      </div>
    </div>
    {on ? <>
      <div className="codexSubscriptionDivider" />
      <div className="codexSubscriptionPreference">
        <span role="status">{t(STATUS_KEYS[status] ?? 'remoteConnecting')}{status === 'error' && state?.lastError ? ` · ${state.lastError}` : ''}{state?.phones > 0 ? ` · ${t('remotePhones').replace('{count}', String(state.phones))}` : ''}</span>
        <Button type="button" variant="outline" disabled={busy || status === 'stopped'} onClick={() => { void pair() }}>{t(pairing ? 'remotePairAgain' : 'remotePair')}</Button>
      </div>
      {failed ? <p role="alert" className="codexSubscriptionHelp">{t('remotePairFailed')}</p> : null}
      {pairing && !expired ? <div className="codexSubscriptionRemotePair">
        <Qr value={`${PAIR_URL}${pairing.pairingCode}`} label={t('remoteQrLabel')} />
        <div>
          <p className="codexSubscriptionHelp">{t('remotePairSteps')}</p>
          {pairing.manualCode ? <p className="codexSubscriptionRemoteCode" aria-label={t('remoteManualCode')}>{pairing.manualCode}</p> : null}
          <p className="codexSubscriptionHelp">{t('remoteExpires').replace('{minutes}', String(minutes))}</p>
        </div>
      </div> : pairing ? <p className="codexSubscriptionHelp">{t('remoteExpired')}</p> : null}
      <p className="codexSubscriptionHelp">{t('remoteLimits')}</p>
    </> : null}
  </section>
}
