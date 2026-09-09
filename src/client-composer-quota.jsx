import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Tooltip, IconDataOutline16, useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import { QUICK_QUOTA_MODE_FORECAST, QUICK_QUOTA_MODE_OFF } from './settings-contract.js'
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
  const closeButton = useRef(null)
  const id = useId()
  const visible = open && quotaEnabled && !!quotas?.length
  const position = useAnchoredPosition({ open: visible, anchorRef: trigger, panelRef: panel, side: 'top', gap: 8, margin: 12 })
  useDismissOnOutsidePointer(trigger, visible, setOpen, panel)
  useEffect(() => { setOpen(false) }, [current?.model, quotaEnabled])
  useEffect(() => {
    if (!visible) return
    closeButton.current?.focus()
    const escape = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [visible])
  if (!quotaEnabled || !quotas?.length) return null
  const forecastMode = preferenceSnapshot.quickQuotaMode === QUICK_QUOTA_MODE_FORECAST
  const label = quotas.map(quota => `${windowLabel(quota.windowSeconds, t)}: ${fill(t('remaining'), { value: percent(quota.remainingPercent) })}`).join('; ')
  return <>
    <Tooltip label={label} side="top" maxWidth={280} disabled={visible}><button ref={trigger} type="button" className="codexComposerQuota" aria-label={`${t('quotaDetails')}: ${label}`}
      aria-haspopup="dialog" aria-expanded={visible} aria-controls={visible ? id : undefined} onClick={() => setOpen(value => !value)}>
      <IconDataOutline16 />
    </button></Tooltip>
    {visible ? createPortal(<section ref={panel} id={id} role="dialog" aria-label={t('quotaDetails')}
      className="codexQuotaPopover" style={{ ...position, visibility: position ? 'visible' : 'hidden' }}>
      <header><strong>{t('quotaDetails')}</strong><button ref={closeButton} type="button" aria-label={t('sketchCancel')} onClick={() => { setOpen(false); trigger.current?.focus() }}>×</button></header>
      <p className="codexQuotaPopoverHint">{t('quotaSeparateWindows')}</p>
      {quotas.map((quota, index) => <div className="codexQuotaDetail" key={`${quota.windowSeconds}-${index}`}>
        <div><span>{windowLabel(quota.windowSeconds, t)}</span><strong>{fill(t('remaining'), { value: percent(quota.remainingPercent) })}</strong></div>
        <progress className="codexComposerQuotaBar" max={100} value={quota.remainingPercent} aria-label={windowLabel(quota.windowSeconds, t)} />
        <p>{describeQuota(quota, forecastMode, t)}</p>
      </div>)}
    </section>, document.body) : null}
  </>
}

function describeQuota(quota, forecastMode, t) {
  const value = Math.round(Number(quota.remainingPercent) * 10) / 10
  const display = percent(value)
  const forecast = forecastMode ? quota.forecast : undefined
  const duration = forecast?.status === 'ready' && !forecast.survivesReset ? formatRunway(forecast.runwaySeconds, t) : undefined
  const label = forecast?.status === 'calibrating'
    ? fill(t('quickQuotaForecastCalibratingStatus'), { value: display })
    : forecast?.status === 'idle'
      ? fill(t('quickQuotaForecastIdleStatus'), { value: display })
      : forecast?.status === 'ready' && forecast.survivesReset
        ? fill(t('quickQuotaForecastUntilResetStatus'), { value: display })
        : duration === undefined
          ? fill(t('quickQuotaStatus'), { value: display })
          : fill(t('quickQuotaForecastStatus'), { value: display, duration })
  const reset = Number.isSafeInteger(quota.resetsAt) ? fill(t('resets'), { value: new Date(quota.resetsAt * 1000).toLocaleString() }) : t('resetUnknown')
  return forecastMode ? `${label} · ${reset}` : reset
}
