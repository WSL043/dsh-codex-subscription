import { useSyncExternalStore } from 'react'
import { QUICK_QUOTA_MODE_BAR, QUICK_QUOTA_MODE_FORECAST, QUICK_QUOTA_MODE_OFF } from './settings-contract.js'
import { fill, percent, windowLabel, usePreferenceSnapshot, formatRunway } from './client-shared.js'
import { useQuickQuota } from './client-quota.jsx'
export function CodexComposerQuota({ preference, rpc, t, directory }) {
  const preferenceSnapshot = usePreferenceSnapshot(preference)
  const modelState = useSyncExternalStore(
    listener => directory.subscribe(listener),
    () => directory.getSnapshot(),
  )
  const current = modelState.current
  const codex = current?.provider === 'openai-codex'
  const quotaEnabled = preferenceSnapshot.status === 'ready' && preferenceSnapshot.quickQuotaMode !== QUICK_QUOTA_MODE_OFF && codex
  const forecastMode = preferenceSnapshot.quickQuotaMode === QUICK_QUOTA_MODE_FORECAST
  const quotas = useQuickQuota(rpc, quotaEnabled, current?.model)
  if (!quotaEnabled || quotas === undefined || quotas.length === 0) return null
  return <span className="codexComposerQuotaWindows">{quotas.map((quota, index) => <CodexComposerQuotaWindow key={`${quota.windowSeconds}-${index}`} quota={quota} mode={preferenceSnapshot.quickQuotaMode} forecastMode={forecastMode} t={t} />)}</span>
}

export function CodexComposerQuotaWindow({ quota, mode, forecastMode, t }) {
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
  const content = mode === QUICK_QUOTA_MODE_BAR
    ? <progress className="codexComposerQuotaBar" max={100} value={value} aria-hidden="true" />
    : forecast?.status === 'calibrating'
      ? `${display}% · ${t('quickQuotaForecastCalibrating')}`
      : forecast?.status === 'idle'
        ? `${display}% · ${t('quickQuotaForecastIdle')}`
        : forecast?.status === 'ready' && forecast.survivesReset
          ? `${display}% · ${t('quickQuotaForecastUntilReset')}`
          : forecastMode && duration !== undefined
            ? `${display}% · ≈${duration}`
            : `${display}%`
  const durationLabel = windowLabel(quota.windowSeconds, t)
  const accessibleLabel = `${durationLabel}: ${label}`
  return <span className="codexComposerQuota" role="status" aria-label={accessibleLabel} title={accessibleLabel}><span>{durationLabel}</span>{content}</span>
}

