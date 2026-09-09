import { recoveryCall } from './client-recovery.js'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { CHANNEL, unwrap, fill, percent, windowLabel, validDate, notifyQuickQuota, formatQuotaForecast } from './client-shared.js'
export function ResetTime({ resetsAt, t }) {
  const date = Number.isSafeInteger(resetsAt) ? validDate(resetsAt * 1_000) : undefined
  if (date === undefined) return <span>{t('resetUnknown')}</span>
  const value = date.toLocaleString(undefined, {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  return <time dateTime={date.toISOString()} title={date.toLocaleString()}>{fill(t('resets'), { value })}</time>
}

export function ResetCreditExpiry({ expiresAt, t }) {
  const date = validDate(expiresAt)
  return <span className="codexSubscriptionResetExpiry">{date === undefined ? t('resetCreditExpiryUnknown') : <time dateTime={date.toISOString()} title={date.toLocaleString()}>{fill(t('resetCreditExpires'), { value: date.toLocaleString() })}</time>}</span>
}

export function ResetCreditList({ rpc, t, count, nextExpiresAt, initialCredits, refreshKey, hasExhaustedQuota, onConsumed }) {
  const fallbackCredits = initialCredits ?? (nextExpiresAt === undefined ? [] : [{ expiresAt: nextExpiresAt }])
  const [credits, setCredits] = useState(fallbackCredits)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let live = true
    setState('loading')
    setCredits([])
    void rpc.call(CHANNEL, 'reset-credit/inspect', {}).then(unwrap).then(value => {
      if (!live) return
      setCredits(Array.isArray(value.credits) ? value.credits : [])
      setState('ready')
    }).catch(() => {
      if (live) setState('error')
    })
    return () => { live = false }
  }, [rpc, count, refreshKey])

  return <div className="codexSubscriptionResetBalance" aria-label={t('resetCredits')}>
    {credits.length === 0 ? <p className="codexSubscriptionCreditNote" role="status">{state === 'loading' ? t('resetCreditExpiryLoading') : t('resetCreditExpiryFailed')}</p> : credits.map((credit, index) => <ResetCreditControl key={credit.ref ?? `pending-${index}`} rpc={rpc} t={t} credit={credit} hasExhaustedQuota={hasExhaustedQuota} onConsumed={onConsumed} />)}
    {state === 'error' ? <p className="codexSubscriptionCreditNote" role="status">{t('resetCreditExpiryFailed')}</p> : null}
  </div>
}

export function ResetCreditControl({ rpc, t, credit, hasExhaustedQuota, onConsumed }) {
  const [challenge, setChallenge] = useState()
  const [resetBusy, setResetBusy] = useState(false)
  const [resetAcknowledged, setResetAcknowledged] = useState(false)
  const [resetCountdown, setResetCountdown] = useState(0)
  const [resetError, setResetError] = useState()
  const [resetResult, setResetResult] = useState()

  useEffect(() => {
    if (challenge === undefined) { setResetCountdown(0); return undefined }
    const update = () => setResetCountdown(Math.max(0, Math.ceil((challenge.readyAt - Date.now()) / 1_000)))
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [challenge])

  const prepareReset = () => {
    if (resetBusy || typeof credit.ref !== 'string') return
    setResetBusy(true); setResetError(undefined); setResetResult(undefined)
    void rpc.call(CHANNEL, 'reset-credit/prepare', { creditRef: credit.ref }).then(unwrap)
      .then(next => { setChallenge(next); setResetAcknowledged(false) })
      .catch(error => setResetError(resetCreditErrorText(error, t)))
      .finally(() => setResetBusy(false))
  }
  const cancelReset = () => {
    if (resetBusy) return
    setChallenge(undefined); setResetAcknowledged(false); setResetError(undefined)
  }
  const resetReady = challenge !== undefined
    && resetAcknowledged && resetCountdown === 0
  const consumeReset = () => {
    if (resetBusy) return
    if (!resetReady) return
    setResetBusy(true); setResetError(undefined); setResetResult(undefined)
    void rpc.call(CHANNEL, 'reset-credit/consume', {
      challengeId: challenge.challengeId,
      acknowledged: resetAcknowledged,
    }).then(unwrap).then(result => {
      setChallenge(undefined); setResetAcknowledged(false)
      const message = result.code === 'reset' ? t('resetSuccess')
        : result.code === 'nothing_to_reset' ? t('resetNothing')
          : result.code === 'no_credit' ? t('resetNoCredit') : t('resetAlready')
      setResetResult(message)
      onConsumed()
    }).catch(error => setResetError(resetCreditErrorText(error, t))).finally(() => setResetBusy(false))
  }

  return <div className="codexSubscriptionResetCard">
    {challenge === undefined ? <>
      <div className="codexSubscriptionResetMeta"><strong>{credit.name ?? t('resetCreditDefaultName')}</strong><ResetCreditExpiry expiresAt={credit.expiresAt} t={t} /></div><div className="codexSubscriptionActions"><Button className="codexSubscriptionResetUse" type="button" variant="outline" disabled={resetBusy || typeof credit.ref !== 'string'} aria-busy={resetBusy} onClick={prepareReset}>{resetBusy ? t('resetPreparing') : t('resetUse')}</Button></div>
    </> : <div className="codexSubscriptionResetFlow" role="group" aria-labelledby="codex-reset-confirm-title">
      <h4 id="codex-reset-confirm-title">{challenge.title ?? t('resetConfirmTitle')}</h4>
      {challenge.description ? <p className="codexSubscriptionResetWarning">{challenge.description}</p> : null}
      <ResetCreditExpiry expiresAt={challenge.creditExpiresAt} t={t} />
      <p className="codexSubscriptionResetWarning">{t(hasExhaustedQuota ? 'resetWarning' : 'resetEarlyWarning')}</p>
      <label className="codexSubscriptionResetCheck"><input type="checkbox" checked={resetAcknowledged} disabled={resetBusy} onChange={event => setResetAcknowledged(event.target.checked)} /><span>{t('resetAcknowledge')}</span></label>
      {resetCountdown > 0 ? <p className="codexSubscriptionCreditNote" role="status">{fill(t('resetWait'), { count: resetCountdown })}</p> : null}
      <div className="codexSubscriptionActions"><Button type="button" variant="outline" disabled={resetBusy} onClick={cancelReset}>{t('cancel')}</Button><Button className="codexSubscriptionResetFinal" type="button" variant="outline" disabled={!resetReady || resetBusy} aria-busy={resetBusy} onClick={consumeReset}>{resetBusy ? t('resetUsing') : t('resetFinal')}</Button></div>
    </div>}
    {resetResult ? <p className="codexSubscriptionResetResult" role="status">{resetResult}</p> : null}
    {resetError ? <p className="codexSubscriptionError" role="alert">{resetError || t('resetFailed')}</p> : null}
  </div>
}

export function resetCreditErrorText(error, t) {
  const key = new Map([
    ['ChatGPT subscription is not signed in', 'resetRenewLogin'],
    ['ChatGPT sign-in needs to be renewed', 'resetRenewLogin'],
    ['No quota reset is available', 'resetNoCredit'],
    ['No usable quota reset is available', 'resetNoCredit'],
    ['The available quota reset expires too soon', 'resetExpired'],
    ['This quota reset confirmation is no longer valid', 'resetExpired'],
    ['This quota reset is already in progress', 'resetInProgress'],
    ['Wait before confirming this quota reset', 'resetTooEarly'],
    ['You must acknowledge that this may consume one quota reset', 'resetAcknowledgeRequired'],
    ['The signed-in ChatGPT account changed', 'resetAccountChanged'],
    ['Quota reset result is uncertain; retry this confirmation to check the same request', 'resetUncertain'],
  ]).get(error instanceof Error ? error.message : '')
  return t(key ?? 'resetFailed')
}

export function UsageCard({ rpc, t, signedIn, resetKey, preference }) {
  const [usage, setUsage] = useState()
  const [usageRefreshGeneration, setUsageRefreshGeneration] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState()
  const request = useRef(0)
  const load = force => {
    if (!signedIn) return
    const id = ++request.current
    setBusy(true); setError(undefined)
    void recoveryCall(rpc, 'usage', { force })
      .then(next => {
        if (request.current === id) {
          setUsage(next)
          setUsageRefreshGeneration(value => value + 1)
          if (force) notifyQuickQuota()
        }
      })
      .catch(error => { if (request.current === id) setError(error.message) })
      .finally(() => { if (request.current === id) setBusy(false) })
  }
  useEffect(() => {
    setUsage(undefined)
    if (signedIn) load(false)
    else { request.current += 1; setUsage(undefined); setError(undefined); setBusy(false) }
    return () => { request.current += 1 }
  }, [signedIn, resetKey])
  const visibleUsage = signedIn ? usage : undefined
  const limits = visibleUsage?.rateLimits ?? []
  const exhausted = limits.some(limit => limit.id !== 'code_review'
    && limit.windows.some(window => window.usedPercent >= 100))
  const hasUsageDetails = limits.length > 0 || visibleUsage?.credits !== undefined
    || visibleUsage?.individualLimit !== undefined || visibleUsage?.resetCredits?.availableCount > 0
  const fetchedAt = typeof visibleUsage?.fetchedAt === 'number' ? validDate(visibleUsage.fetchedAt) : undefined
  return <div className="codexSubscriptionCard codexSubscriptionUsageCard">
    <div className="codexSubscriptionSectionHead">
      <div className="codexSubscriptionSectionTitle"><h3>{t('usage')}</h3>{fetchedAt === undefined ? null : <time className="codexSubscriptionFreshness" dateTime={fetchedAt.toISOString()}>{fill(t('usageUpdated'), { value: fetchedAt.toLocaleString() })}</time>}</div>
      <Button className="codexSubscriptionRefresh" type="button" variant="outline" disabled={!signedIn || busy} aria-busy={busy} onClick={() => load(true)}>{busy ? t('refreshing') : t('refresh')}</Button>
    </div>
    <div aria-live="polite">
      {!signedIn ? <p className="codexSubscriptionEmpty">{t('noUsage')}</p> : null}
      {signedIn && busy && usage === undefined ? <p className="codexSubscriptionEmpty" role="status">{t('usageLoading')}</p> : null}
      {signedIn && !busy && error === undefined && usage !== undefined && !hasUsageDetails ? <p className="codexSubscriptionEmpty" role="status">{t('usageEmpty')}</p> : null}
    </div>
    {error === undefined ? null : <p className="codexSubscriptionError" role="alert">{error}</p>}
    {visibleUsage?.spendControlReached === true ? <p className="codexSubscriptionError" role="alert">{t('spendReached')}</p> : null}
    {limits.length === 0 ? null : <div className="codexSubscriptionLimits">{limits.flatMap(limit => limit.windows.map((window, index) => <div className="codexSubscriptionLimit" key={`${limit.id}-${window.windowSeconds}-${index}`}>
        <div className="codexSubscriptionLimitTop"><span className="codexSubscriptionLimitLabel">{limit.name ?? limit.id}</span><strong>{percent(window.remainingPercent)}%</strong></div>
        <progress max="100" value={window.remainingPercent} aria-label={`${limit.name ?? limit.id} ${fill(t('remaining'), { value: percent(window.remainingPercent) })}`} />
        <div className="codexSubscriptionLimitMeta"><span className="codexSubscriptionLimitPeriod"><span>{windowLabel(window.windowSeconds, t)}</span><span>{formatQuotaForecast(window.forecast, t)}</span></span><ResetTime resetsAt={window.resetsAt} t={t} /></div>
      </div>))}</div>}
    {visibleUsage?.credits === undefined && visibleUsage?.individualLimit === undefined && !(visibleUsage?.resetCredits?.availableCount > 0) ? null : <div className="codexSubscriptionCreditSection">
      <p className="codexSubscriptionCreditNote">{t('creditsNote')}</p>
      <div className="codexSubscriptionCreditRows">
        {visibleUsage?.credits ? <div className="codexSubscriptionCreditBalance"><span>{t('creditsBalance')}</span><strong>{visibleUsage.credits.unlimited ? t('unlimited') : `${visibleUsage.credits.balance ?? t('unavailable')} ${t('creditsUnit')}`}</strong></div> : null}
         {visibleUsage?.resetCredits?.availableCount > 0 ? <div className="codexSubscriptionCreditBalance"><span>{t('resetCredits')}</span><ResetCreditList rpc={rpc} t={t} count={visibleUsage.resetCredits.availableCount} nextExpiresAt={visibleUsage.resetCredits.nextExpiresAt} initialCredits={visibleUsage.resetCredits.credits} refreshKey={`${resetKey}:${usageRefreshGeneration}`} hasExhaustedQuota={exhausted} onConsumed={() => load(true)} /></div> : null}
        {visibleUsage?.individualLimit ? <div className="codexSubscriptionSpendLimit">
          <div className="codexSubscriptionSpendTop"><span className="codexSubscriptionCreditLabel">{t('monthlyCreditLimit')}</span><strong>{fill(t('remaining'), { value: percent(visibleUsage.individualLimit.remainingPercent) })}</strong></div>
          <progress max="100" value={visibleUsage.individualLimit.remainingPercent} aria-label={`${t('monthlyCreditLimit')} ${fill(t('remaining'), { value: percent(visibleUsage.individualLimit.remainingPercent) })}`} />
          <div className="codexSubscriptionLimitMeta"><span>{fill(t('creditsUsed'), { used: visibleUsage.individualLimit.used, limit: visibleUsage.individualLimit.limit })}</span><ResetTime resetsAt={visibleUsage.individualLimit.resetsAt} t={t} /></div>
        </div> : null}
      </div>
    </div>}
  </div>
}
