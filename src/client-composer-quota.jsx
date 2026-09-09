import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import { QUICK_QUOTA_MODE_BAR, QUICK_QUOTA_MODE_FORECAST, QUICK_QUOTA_MODE_OFF } from './settings-contract.js'
import { fill, percent, windowLabel, usePreferenceSnapshot, formatRunway } from './client-shared.js'
import { useQuickQuota } from './client-quota.jsx'

export function CodexComposerQuota({ preference, rpc, t, directory }) {
  const preferenceSnapshot = usePreferenceSnapshot(preference)
  const modelState = useSyncExternalStore(listener => directory.subscribe(listener), () => directory.getSnapshot())
  const current = modelState.current
  const quotaEnabled = preferenceSnapshot.status === 'ready' && preferenceSnapshot.quickQuotaMode !== QUICK_QUOTA_MODE_OFF && current?.provider === 'openai-codex'
  const quotas = useQuickQuota(rpc, quotaEnabled, current?.model)
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)
  const panel = useRef(null)
  const pinned = useRef(false)
  const dismissTimer = useRef(null)
  const enter = () => { clearTimeout(dismissTimer.current); setOpen(true) }
  const leave = () => { if (!pinned.current) dismissTimer.current = setTimeout(() => setOpen(false), 150) }
  const dismiss = () => { pinned.current = false; setOpen(false) }
  useEffect(() => () => clearTimeout(dismissTimer.current), [])
  const id = useId()
  const visible = open && quotaEnabled && !!quotas?.length
  const position = useAnchoredPosition({ open: visible, anchorRef: trigger, panelRef: panel, side: 'top', gap: 8, margin: 12 })
  useDismissOnOutsidePointer(trigger, visible, dismiss, panel)
  useEffect(() => { setOpen(false) }, [current?.model, quotaEnabled])
  useEffect(() => {
    if (!visible) return
    const escape = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      dismiss()
      trigger.current?.focus()
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [visible])
  if (!quotaEnabled || !quotas?.length) return null
  const forecastMode = preferenceSnapshot.quickQuotaMode === QUICK_QUOTA_MODE_FORECAST
  const label = quotas.map(quota => `${windowLabel(quota.windowSeconds, t)}: ${fill(t('remaining'), { value: percent(quota.remainingPercent) })}`).join('; ')
  return <>
    <button ref={trigger} type="button" className="codexComposerQuota" aria-label={`${t('quotaDetails')}: ${label}`}
      aria-haspopup="dialog" aria-expanded={visible} aria-controls={visible ? id : undefined}
      onMouseEnter={enter} onMouseLeave={leave}
      onClick={() => { if (pinned.current) dismiss(); else { pinned.current = true; setOpen(true); requestAnimationFrame(() => panel.current?.focus()) } }}>
      {quotas.map((quota, index) => <span className="codexQuotaCompactWindow" key={`${quota.windowSeconds}-${index}`}>
        <span>{shortWindow(quota.windowSeconds, t)}</span>
        {preferenceSnapshot.quickQuotaMode === QUICK_QUOTA_MODE_BAR ? <progress className="codexComposerQuotaBar" max={100} value={quota.remainingPercent} aria-hidden="true" /> : null}
        <span>{forecastMode ? forecastText(quota, t) : `${percent(quota.remainingPercent)}%`}</span>
      </span>)}
    </button>
    {visible ? createPortal(<section ref={panel} id={id} role="dialog" aria-label={t('quotaDetails')}
      className="codexQuotaPopover" tabIndex={-1} onMouseEnter={enter} onMouseLeave={leave}
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }}>
      {quotas.map((quota, index) => <div className="codexQuotaDetail" key={`${quota.windowSeconds}-${index}`}>
        <div><span>{windowLabel(quota.windowSeconds, t)}</span><strong>{fill(t('remaining'), { value: percent(quota.remainingPercent) })}</strong><span className="codexQuotaReset">{shortReset(quota, t)}</span></div>
        {forecastMode ? <p>{forecastText(quota, t)}</p> : null}
      </div>)}
    </section>, document.body) : null}
  </>
}

function shortWindow(seconds, t) {
  if (Math.abs(seconds - 604800) < 60) return t('quotaShortWeek')
  if (Math.abs(seconds - 86400) < 60) return t('quotaShortDay')
  return seconds < 86400 ? `${Math.round(seconds / 360) / 10}h` : `${Math.round(seconds / 8640) / 10}d`
}
function shortReset(quota, t) {
  if (!Number.isSafeInteger(quota.resetsAt)) return t('resetUnknown')
  const value = new Date(quota.resetsAt * 1000).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return fill(t('resets'), { value })
}
function forecastText(quota, t) {
  const forecast = quota.forecast
  if (forecast?.status === 'calibrating') return t('quickQuotaForecastCalibrating')
  if (forecast?.status === 'idle') return t('quickQuotaForecastIdle')
  if (forecast?.status === 'ready' && forecast.survivesReset) return t('quickQuotaForecastUntilReset')
  if (forecast?.status === 'ready') return `≈${formatRunway(forecast.runwaySeconds, t)}`
  return `${percent(quota.remainingPercent)}%`
}
