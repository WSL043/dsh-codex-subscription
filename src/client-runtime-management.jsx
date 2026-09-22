import { useEffect, useRef, useState } from 'react'
import { Button } from './client-primitives.js'
import { CHANNEL } from './rpc-contract.js'

export function RuntimeManagement({ rpc, preference, t }) {
  const [state, setState] = useState()
  const [error, setError] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const alive = useRef(false)
  const busy = ['installing', 'removing', 'applying'].includes(state?.phase)
  const read = async () => {
    try {
      const result = await rpc.call(CHANNEL, 'runtime/status', {})
      if (!alive.current) return
      if (!result.ok) { setError(true); return }
      setState(result.value); setError(false)
    } catch { if (alive.current) setError(true) }
  }
  useEffect(() => { alive.current = true; void read(); return () => { alive.current = false } }, [rpc])
  useEffect(() => {
    if (!busy) return
    let stopped = false, timer
    const poll = async () => { await read(); if (!stopped) timer = setTimeout(poll, 1500) }
    timer = setTimeout(poll, 1500)
    return () => { stopped = true; clearTimeout(timer) }
  }, [busy, rpc])
  const act = async action => {
    if (sending) return
    setSending(true); setError(false); setConfirm(false)
    try {
      const result = await rpc.call(CHANNEL, `runtime/${action}`, {})
      if (!alive.current) return
      if (!result.ok) { await read(); if (alive.current) setError(true); return }
      setState(result.value)
      if (action === 'remove') void preference.load()
    } catch { if (alive.current) setError(true) }
    finally { if (alive.current) setSending(false) }
  }
  useEffect(() => {
    if (state?.phase === 'done') void preference.load()
  }, [state?.phase])
  const locked = sending || busy || state?.restartRequired || state?.active > 0
  return <div className="codexSubscriptionRuntime">
    <div className="codexSubscriptionPreference">
      <span role="status">{t(!state ? 'runtimeLoading' : state.restartRequired ? 'runtimeRestart' : busy ? `runtime_${state.phase}` : state.installed ? 'subagentRuntimeInstalled' : state.present ? 'runtimeIncompatible' : 'subagentRuntimeMissing')}</span>
      {state?.available ? <Button type="button" variant="outline" disabled={locked || (state.present && !state.removable)} onClick={() => state.present ? setConfirm(true) : void act('install')}>{t(state.present ? 'runtimeRemove' : 'runtimeInstall')}</Button> : null}
    </div>
    {state?.present && state.available && !state.removable ? <p>{t('runtimeManagedElsewhere')}</p> : null}
    {state?.active > 0 ? <p>{t('runtimeActive')}</p> : null}
    {busy && state.phase === 'installing' ? <Button type="button" variant="outline" disabled={sending} onClick={() => { void act('cancel') }}>{t('runtimeCancel')}</Button> : null}
    {confirm ? <div role="group" aria-label={t('runtimeRemove')}><p>{t('runtimeConfirm')}</p><Button type="button" variant="outline" onClick={() => setConfirm(false)}>{t('runtimeKeep')}</Button> <Button type="button" variant="outline" disabled={locked} onClick={() => { void act('remove') }}>{t('runtimeConfirmRemove')}</Button></div> : null}
    {error || state?.phase === 'failed' ? <p role="alert">{t(state?.error === 'build-blocked' ? 'runtimeBuildBlocked' : 'runtimeFailed')}</p> : null}
    {state?.phase === 'cancelled' ? <p role="status">{t('runtimeCancelled')}</p> : null}
    {!busy ? <Button type="button" variant="outline" disabled={sending} onClick={() => { void read(); void preference.load() }}>{t('runtimeRefresh')}</Button> : null}
    <details>
      <summary>{t('subagentRuntimeManage')}</summary>
      {state && !state.available ? <p>{t('runtimeUnavailable')}</p> : null}
      <p>{t('runtimeInstallHint')}</p>
      <code>@deepseek-ai/dsh-subagent-codex@0.1.5-rc.2</code>
      <p>{t('subagentRuntimeCacheHint')}</p>
      <a href="https://github.com/WSL043/dsh-codex-subscription/blob/main/README.md#codex-subtask-runtime" target="_blank" rel="noreferrer">{t('subagentRuntimePrepare')}</a>
    </details>
  </div>
}
