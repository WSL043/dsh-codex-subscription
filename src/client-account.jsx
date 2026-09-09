import { useEffect, useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { readLoginProgress } from './login-progress.js'
import { CHANNEL, unwrap, accountStatusErrorText, maskEmail, notifyQuickQuota } from './client-shared.js'
export function AccountEmail({ candidate, fallback, t, emailVisible, onClick }) {
  if (typeof candidate?.email !== 'string' || candidate.email.length === 0) {
    return <span title={t('emailUnavailable')}>{fallback ?? candidate?.label ?? t('emailUnavailable')}</span>
  }
  return <button
    type="button"
    className="codexSubscriptionEmail"
    aria-label={t(emailVisible ? 'hideEmail' : 'showEmail')}
    aria-pressed={emailVisible}
    onClick={onClick}
  >{emailVisible ? candidate.email : maskEmail(candidate.email)}</button>
}

export function AccountCard({ rpc, t, account, setAccount, onSignedOut }) {
  const [flow, setFlow] = useState()
  const [manualCode, setManualCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [removeId, setRemoveId] = useState()
  const [emailVisible, setEmailVisible] = useState(false)
  const accounts = account?.accounts ?? []
  const accountVisibilityKey = `${account?.authenticated === true ? 'signed-in' : 'signed-out'}:${accounts.map(candidate => `${candidate.id ?? ''}:${candidate.active === true}:${candidate.email ?? ''}`).join('|')}`
  const [emailVisibilityKey, setEmailVisibilityKey] = useState(accountVisibilityKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState()
  const call = (endpoint, payload = {}) => rpc.call(CHANNEL, endpoint, payload).then(unwrap)

  useEffect(() => {
    if (emailVisibilityKey === accountVisibilityKey) return
    setEmailVisible(false)
    setEmailVisibilityKey(accountVisibilityKey)
  }, [accountVisibilityKey, emailVisibilityKey])

  useEffect(() => {
    if (flow?.id === undefined || ['authenticated', 'failed', 'cancelled'].includes(flow.phase)) return undefined
    const timer = window.setInterval(() => {
      const read = adding
        ? call('login/status', { id: flow.id }).then(async nextFlow => ({
            flow: nextFlow,
            account: nextFlow.phase === 'authenticated' ? await call('status') : undefined,
          }))
        : readLoginProgress({
            flow,
            readFlow: () => call('login/status', { id: flow.id }),
            readAccount: () => call('status'),
          })
      void read.then(next => {
        setFlow(next.flow)
        setError(undefined)
        if (next.account !== undefined) {
          setAccount(next.account)
          onSignedOut()
          setAdding(false)
          setFlow(undefined)
          notifyQuickQuota()
        }
      }).catch(() => setError(t('failed')))
    }, 800)
    return () => window.clearInterval(timer)
  }, [flow?.id, flow?.phase, adding])

  const begin = (method, label) => {
    setFlow(undefined); setBusy(true); setError(undefined)
    const loginLabel = adding && label === undefined ? `Account ${accounts.length + 1}` : label
    void call('login/start', { method, openExternal: true, ...(loginLabel === undefined ? {} : { label: loginLabel }) }).then(setFlow)
      .catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const cancel = () => {
    if (flow?.id === undefined) return
    setBusy(true)
    void call('login/cancel', { id: flow.id }).then(next => {
      setFlow(adding ? undefined : next)
      if (adding) setAdding(false)
      if (adding) return undefined
      return call('status').then(account => {
        if (account.authenticated === true) {
          setAccount(account)
          setFlow({ ...next, phase: 'authenticated', authenticated: true })
          setError(undefined)
          notifyQuickQuota()
        }
      })
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const submit = event => {
    event.preventDefault()
    if (flow?.id === undefined || manualCode.trim() === '') return
    setBusy(true)
    void call('login/submit', { id: flow.id, value: manualCode.trim() }).then(next => {
      setManualCode(''); setFlow(next)
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const logout = () => {
    setBusy(true); setError(undefined)
    void call('logout').then(next => {
      setAccount(next); setFlow(undefined); onSignedOut(); notifyQuickQuota()
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const selectAccount = id => {
    setBusy(true); setError(undefined)
    void call('account/select', { id }).then(next => {
      setAccount(next); onSignedOut(); notifyQuickQuota()
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const removeAccount = id => {
    if (removeId !== id) { setRemoveId(id); return }
    setBusy(true); setError(undefined)
    void call('account/remove', { id }).then(next => {
      setAccount(next); setRemoveId(undefined); onSignedOut(); notifyQuickQuota()
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const signedIn = account?.authenticated === true
  const accountReady = account !== undefined
  const loginVisible = flow !== undefined && !['authenticated', 'failed', 'cancelled'].includes(flow.phase)

  const toggleEmail = () => {
    setEmailVisibilityKey(accountVisibilityKey)
    setEmailVisible(value => emailVisibilityKey === accountVisibilityKey ? !value : true)
  }
  const emailVisibleForAccount = emailVisible && emailVisibilityKey === accountVisibilityKey
  return <div className="codexSubscriptionCard">
    <div className="codexSubscriptionAccountRow">
      <div className="codexSubscriptionStatus" role="status" aria-live="polite"><span className="codexSubscriptionDot" data-state={accountReady ? signedIn ? 'connected' : 'disconnected' : 'loading'} aria-hidden="true" />{accountReady ? signedIn ? t('connected') : t('disconnected') : t('accountLoading')}</div>
      <div className="codexSubscriptionActions">{signedIn ? <><Button type="button" variant="outline" disabled={busy || loginVisible} onClick={() => { setFlow(undefined); setAdding(true) }}>{t('addAccount')}</Button><Button type="button" variant="outline" disabled={busy || loginVisible} onClick={logout}>{t('signOutAll')}</Button></> : accountReady && (flow === undefined || ['failed', 'cancelled'].includes(flow.phase)) ? <><Button type="button" variant="primary" disabled={busy} onClick={() => begin('browser')}>{t('browserLogin')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => begin('device_code')}>{t('deviceLogin')}</Button></> : null}</div>
    </div>
     {signedIn && accounts.length > 0 ? <div className="codexSubscriptionAccounts">{accounts.map(candidate => <div className="codexSubscriptionAccount" data-active={candidate.active} key={candidate.id}><AccountEmail candidate={candidate} fallback={candidate.label} t={t} emailVisible={emailVisibleForAccount} onClick={toggleEmail} /><div className="codexSubscriptionActions">{candidate.active ? null : <Button type="button" variant="outline" disabled={busy || loginVisible} onClick={() => selectAccount(candidate.id)}>{t('switchAccount')}</Button>}{accounts.length > 1 ? <Button type="button" variant="outline" disabled={busy || loginVisible} onClick={() => removeAccount(candidate.id)}>{removeId === candidate.id ? t('removeConfirm') : t('removeAccount')}</Button> : null}{removeId === candidate.id ? <Button type="button" variant="outline" disabled={busy} onClick={() => setRemoveId(undefined)}>{t('removeCancel')}</Button> : null}</div></div>)}</div> : null}
    {signedIn && adding && flow === undefined ? <div className="codexSubscriptionFlow"><div className="codexSubscriptionActions"><Button type="button" variant="primary" disabled={busy} onClick={() => begin('browser')}>{t('browserLogin')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => begin('device_code')}>{t('deviceLogin')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setAdding(false)}>{t('cancel')}</Button></div></div> : null}
    {flow?.phase === 'waiting_device' ? <div className="codexSubscriptionFlow"><p>{t('deviceHint')}</p><code className="codexSubscriptionCode">{flow.deviceCode?.userCode}</code><a href={flow.deviceCode?.verificationUri} target="_blank" rel="noreferrer">{t('openLogin')}</a><p>{t('waiting')}</p></div> : null}
    {flow?.phase === 'waiting_input' ? <form className="codexSubscriptionFlow" onSubmit={submit}><p>{t('manualCode')}</p><Input className="codexSubscriptionInput" value={manualCode} onChange={event => setManualCode(event.currentTarget.value)} autoComplete="off" spellCheck={false} /><div className="codexSubscriptionActions"><Button type="submit" variant="primary" disabled={busy || manualCode.trim() === ''}>{t('submit')}</Button><Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button></div></form> : null}
    {flow !== undefined && ['starting', 'waiting_browser'].includes(flow.phase) ? <div className="codexSubscriptionFlow"><p>{t('waiting')}</p>{flow.authUrl === undefined ? null : <a href={flow.authUrl} target="_blank" rel="noreferrer">{t('openLogin')}</a>}<Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button></div> : null}
    {flow?.phase === 'failed' || error !== undefined ? <p className="codexSubscriptionError" role="alert">{error ?? t('failed')}</p> : null}
  </div>
}

export function AccountFailureCard({ accountStatus, snapshot, t }) {
  const retrying = snapshot.retrying === true
  return <div className="codexSubscriptionCard codexSubscriptionRecover" role="alert">
    <p className="codexSubscriptionError">{retrying ? t('accountRetrying') : accountStatusErrorText(snapshot.error, t)}</p>
    <Button type="button" variant="outline" disabled={retrying} aria-busy={retrying} onClick={() => { void accountStatus.retry() }}>{retrying ? t('accountRetrying') : t('accountRetry')}</Button>
  </div>
}

