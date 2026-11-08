import { Hint } from './client-hint.jsx'
import { useEffect, useRef, useState } from 'react'
import { Button, Input } from './client-primitives.jsx'
import { readLoginProgress } from './login-progress.js'
import { CHANNEL, unwrap, accountStatusErrorText, maskEmail, notifyQuickQuota, accessFailureText } from './client-shared.js'
import { isAccessFailureMessage, SIGN_IN_RENEW } from './http-failure.js'
import { recoveryCall } from './client-recovery.js'
import { AccountQuota, useAccountQuotas } from './client-account-quota.jsx'
const LOGIN_FAILURES = ['account-claim', 'network', 'token-exchange', 'callback', 'account-mismatch']
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

const signedInIds = account => account?.authenticated === true ? (account.accounts ?? []).map(candidate => candidate.id).filter(id => typeof id === 'string') : []

export function AccountCard({ rpc, t, account, setAccount, onSignedOut, active = true, revision }) {
  const [flow, setFlow] = useState()
  const flowGeneration = useRef(0)
  const [manualCode, setManualCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [renewId, setRenewId] = useState()
  const accountFlow = adding || renewId !== undefined
  const [removeId, setRemoveId] = useState()
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [emailVisible, setEmailVisible] = useState(false)
  const accounts = account?.accounts ?? []
  const accountVisibilityKey = `${account?.authenticated === true ? 'signed-in' : 'signed-out'}:${accounts.map(candidate => `${candidate.id ?? ''}:${candidate.active === true}:${candidate.email ?? ''}`).join('|')}`
  const [emailVisibilityKey, setEmailVisibilityKey] = useState(accountVisibilityKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState()
  const quotas = useAccountQuotas(rpc, signedInIds(account), active, revision)
  const call = (endpoint, payload = {}) => recoveryCall(rpc, endpoint, payload)

  useEffect(() => {
    if (emailVisibilityKey === accountVisibilityKey) return
    setEmailVisible(false)
    setEmailVisibilityKey(accountVisibilityKey)
  }, [accountVisibilityKey, emailVisibilityKey])

  useEffect(() => {
    if (busy || flow?.id === undefined || ['failed', 'cancelled'].includes(flow.phase)) return undefined
    let live = true
    let reading = false
    const generation = flowGeneration.current
    const timer = window.setInterval(() => {
      if (reading) return
      reading = true
      const read = accountFlow
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
        if (!live || generation !== flowGeneration.current) return
        setFlow(next.flow)
        setError(undefined)
        if (next.account !== undefined) {
          setAccount(next.account)
          onSignedOut()
          setAdding(false)
          setRenewId(undefined)
          setEmailVisible(false)
          setFlow(undefined)
          notifyQuickQuota()
        }
      }).catch(() => { if (live && generation === flowGeneration.current) setError(t('failed')) })
        .finally(() => { reading = false })
    }, 800)
    return () => { live = false; window.clearInterval(timer) }
  }, [flow?.id, flow?.phase, accountFlow, busy])

  const begin = (method, target = adding ? { label: `Account ${accounts.length + 1}` } : {}) => {
    flowGeneration.current += 1
    setFlow(undefined); setBusy(true); setError(undefined)
    void call('login/start', { method, openExternal: true, ...target }).then(setFlow)
      .catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const cancel = () => {
    if (flow?.id === undefined) return
    flowGeneration.current += 1
    setBusy(true); setError(undefined)
    void call('login/cancel', { id: flow.id }).then(next => {
      setFlow(accountFlow ? undefined : next)
      if (accountFlow) { setAdding(false); setRenewId(undefined); return undefined }
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
    setConfirmSignOut(false)
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
  const loginContent = <>
    {flow?.phase === 'waiting_device' ? <div className="codexSubscriptionFlow"><p>{t('deviceHint')}</p><code className="codexSubscriptionCode">{flow.deviceCode?.userCode}</code><a href={flow.deviceCode?.verificationUri} target="_blank" rel="noreferrer">{t('openLogin')}</a><p>{t('waiting')}</p><Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button></div> : null}
    {flow?.phase === 'waiting_input' ? <form className="codexSubscriptionFlow" onSubmit={submit}><p>{t('manualCode')}</p><Input className="codexSubscriptionInput" value={manualCode} onChange={event => setManualCode(event.currentTarget.value)} autoComplete="off" spellCheck={false} /><div className="codexSubscriptionActions"><Button type="submit" variant="primary" disabled={busy || manualCode.trim() === ''}>{t('submit')}</Button><Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button></div></form> : null}
    {((renewId !== undefined && busy && flow === undefined) || ['starting', 'waiting_browser'].includes(flow?.phase)) ? <div className="codexSubscriptionFlow">
      <p role="status">{t(renewId === undefined ? 'waiting' : 'renewAccountHint')}</p>
      <div className="codexSubscriptionActions">
        {flow?.authUrl === undefined ? null : <a href={flow.authUrl} target="_blank" rel="noreferrer">{t('openLogin')}</a>}
        {renewId === undefined ? null : <Button type="button" variant="outline" disabled={busy} onClick={() => begin('device_code', { renewId })}>{t('deviceLogin')}</Button>}
        {flow === undefined ? null : <Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button>}
      </div>
    </div> : null}
    {flow?.phase === 'failed' || error !== undefined ? <p className="codexSubscriptionError" role="alert">{error ?? (isAccessFailureMessage(flow?.error) ? accessFailureText(flow.error, t) : LOGIN_FAILURES.includes(flow?.failure) ? t(`failed_${flow.failure.replace('-', '_')}`) : t('failed'))}</p> : null}
  </>
  return <div className="codexSubscriptionCard">
    <div className="codexSubscriptionAccountRow">
      <div className="codexSubscriptionStatus" role="status">{accountReady ? signedIn ? t('savedAccounts') : t('disconnected') : t('accountLoading')}</div>
      <div className="codexSubscriptionActions">{signedIn ? <><Button type="button" variant="outline" disabled={busy || loginVisible} onClick={() => { setFlow(undefined); setError(undefined); setRenewId(undefined); setAdding(true) }}>{t('addAccount')}</Button>{confirmSignOut ? <><Button type="button" variant="outline" disabled={busy} onClick={logout}>{t('signOutConfirm')}</Button><Button type="button" variant="outline" onClick={() => setConfirmSignOut(false)}>{t('removeCancel')}</Button></> : <Button type="button" variant="outline" disabled={busy || loginVisible} onClick={() => setConfirmSignOut(true)}>{t(accounts.length > 1 ? 'signOutAll' : 'logout')}</Button>}</> : accountReady && (flow === undefined || ['failed', 'cancelled'].includes(flow.phase)) ? <><Button type="button" variant="primary" disabled={busy} onClick={() => begin('browser')}>{t('browserLogin')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => begin('device_code')}>{t('deviceLogin')}</Button></> : null}</div>
    </div>
    {signedIn && accounts.length > 0 ? <div className="codexSubscriptionAccounts">
      {accounts.map(candidate => {
        const entry = quotas.entries[candidate.id]
        const disabled = busy || loginVisible
        return <div key={candidate.id}>
          <div className="codexSubscriptionAccount" data-active={candidate.active}>
            <div className="codexSubscriptionAccountMain">
              <AccountEmail candidate={candidate} fallback={candidate.label} t={t} emailVisible={emailVisibleForAccount} onClick={toggleEmail} />
              <AccountQuota entry={entry} loading={quotas.busy} showQuota={accounts.length > 1} t={t} />
            </div>
            <div className="codexSubscriptionActions">
              {entry?.error === SIGN_IN_RENEW ? <Button type="button" variant="outline" disabled={disabled} onClick={() => {
                setAdding(false)
                setRenewId(candidate.id)
                begin('browser', { renewId: candidate.id })
              }}>{t('renewAccount')}</Button> : null}
              {candidate.active ? null : <Button type="button" variant="outline" disabled={disabled} onClick={() => selectAccount(candidate.id)}>{t('switchAccount')}</Button>}
              {accounts.length > 1 ? <Button type="button" variant="outline" disabled={disabled} onClick={() => removeAccount(candidate.id)}>{removeId === candidate.id ? t('removeConfirm') : t('removeAccount')}</Button> : null}
              {removeId === candidate.id ? <Button type="button" variant="outline" disabled={busy} onClick={() => setRemoveId(undefined)}>{t('removeCancel')}</Button> : null}
            </div>
          </div>
          {renewId === candidate.id ? loginContent : null}
        </div>
      })}
    </div> : null}
    {signedIn && adding && !loginVisible ? <div className="codexSubscriptionFlow"><div className="codexSubscriptionActions"><Button type="button" variant="primary" disabled={busy} onClick={() => begin('browser')}>{t('browserLogin')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => begin('device_code')}>{t('deviceLogin')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setAdding(false); setRenewId(undefined); setFlow(undefined); setError(undefined) }}>{t('cancel')}</Button></div></div> : null}
    {renewId === undefined ? loginContent : null}
  </div>
}

export function AccountFailureCard({ accountStatus, snapshot, t, rpc, onRecovered }) {
  const retrying = snapshot.retrying === true
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const clear = async () => {
    if (!confirm) { setConfirm(true); return }
    setBusy(true); setFailed(false)
    try { const next = await recoveryCall(rpc, 'logout'); accountStatus.acceptAccount(next); onRecovered(); notifyQuickQuota() }
    catch { setFailed(true) }
    finally { setBusy(false); setConfirm(false) }
  }
  return <div className="codexSubscriptionCard codexSubscriptionRecover" role="alert">
    <p className="codexSubscriptionError">{retrying ? t('accountRetrying') : accountStatusErrorText(snapshot.error, t)}</p>
    <div className="codexSubscriptionActions"><Button type="button" variant="outline" disabled={retrying || busy} aria-busy={retrying} onClick={() => { void accountStatus.retry() }}>{retrying ? t('accountRetrying') : t('accountRetry')}</Button>
    <Button type="button" variant="outline" disabled={busy || retrying} onClick={() => void clear()}>{busy ? t('accountRetrying') : t(confirm ? 'recoveryClearConfirm' : 'recoveryClear')}</Button>{confirm ? <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(false)}>{t('cancel')}</Button> : null}</div>
    <Hint t={t} as="p">{t(confirm ? 'recoveryClearHint' : 'recoveryHint')}</Hint>
    {failed ? <p className="codexSubscriptionError">{t('recoveryFailed')}</p> : null}
  </div>
}
