import { useEffect, useState } from 'react'
import { Button } from './client-primitives.jsx'
import { CHANNEL } from './rpc-contract.js'

export function RuntimeManagement({ rpc, preference, t, active = true, openSubagentBundle }) {
  const [state, setState] = useState()
  const [error, setError] = useState(false)
  const [sending, setSending] = useState(false)
  const busy = ['installing', 'removing'].includes(state?.phase)
  const apply = result => {
    if (!result.ok) throw Error('Runtime request failed')
    setState(result.value)
    setError(false)
  }
  useEffect(() => {
    if (!active) return
    let stopped = false
    rpc.call(CHANNEL, 'runtime/status', {}).then(result => {
      if (!stopped) apply(result)
    }).catch(() => { if (!stopped) setError(true) })
    return () => { stopped = true }
  }, [active, rpc])
  useEffect(() => {
    if (!busy) return
    let stopped = false, timer
    const poll = async () => {
      try {
        const result = await rpc.call(CHANNEL, 'runtime/status', {})
        if (!stopped) apply(result)
      } catch { if (!stopped) setError(true) }
      if (!stopped) timer = setTimeout(poll, 1500)
    }
    timer = setTimeout(poll, 1500)
    return () => { stopped = true; clearTimeout(timer) }
  }, [busy, rpc])
  useEffect(() => {
    if (state?.phase === 'done') void preference.load()
  }, [state?.phase, preference])

  const act = async action => {
    setSending(true)
    setError(false)
    try { apply(await rpc.call(CHANNEL, `runtime/${action}`, {})) }
    catch { setError(true) }
    finally { setSending(false) }
  }
  if (!state) return <p role={error ? 'alert' : 'status'}>{t(error ? 'runtimeFailed' : 'runtimeLoading')}</p>
  if (state.restartRequired) return <p role="status">{t('runtimeRestart')}</p>
  if (state.installed) return null
  if (!state.componentVersion) return <p>{t('runtimeHostUnsupported')}</p>
  if (!state.adapterInstalled) return <div className="codexSubscriptionPreference">
    <span>{t('subagentBackendNeedsRuntime')}</span>
    {openSubagentBundle ? <Button type="button" variant="outline" onClick={openSubagentBundle}>{t('runtimeOpenPlugins')}</Button> : null}
  </div>
  return <>
    <div className="codexSubscriptionPreference">
      <span role="status">{t(busy ? `runtime_${state.phase}` : state.available ? 'runtimeUpdateRequired' : 'runtimeUnavailable')}</span>
      {busy && state.phase === 'installing'
        ? <Button type="button" variant="outline" disabled={sending} onClick={() => void act('cancel')}>{t('runtimeCancel')}</Button>
        : !busy && state.installable
          ? <Button type="button" variant="outline" disabled={sending || state.active > 0} onClick={() => void act('install')}>{t('runtimeInstall')}</Button>
          : null}
    </div>
    {error || state.phase === 'failed' ? <p role="alert">{t('runtimeFailed')}</p> : null}
  </>
}
