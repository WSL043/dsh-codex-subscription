import { useSyncExternalStore } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
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
  const quota = quotas.reduce((lowest, candidate) => candidate.remainingPercent < lowest.remainingPercent ? candidate : lowest)
  const details = quotas.map(window => describeQuota(window, forecastMode, t)).join('\n')
  return <CodexComposerQuotaWindow quota={quota} mode={preferenceSnapshot.quickQuotaMode} forecastMode={forecastMode} details={details} t={t} />
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
  return `${windowLabel(quota.windowSeconds, t)}: ${label} · ${reset}`
}

export function CodexComposerQuotaWindow({ quota, mode, forecastMode, details, t }) {
  const value = Math.round(Number(quota.remainingPercent) * 10) / 10
  const accessibleLabel = details ?? describeQuota(quota, forecastMode, t)
  return <Tooltip label={accessibleLabel} side="top" maxWidth={320}>
    <span className="codexComposerQuota" role="status" tabIndex={0} aria-label={accessibleLabel}>
      <span className="codexComposerQuotaCaption">{t('quickQuotaCompact')}</span>
      {mode === QUICK_QUOTA_MODE_BAR ? <progress className="codexComposerQuotaBar" max={100} value={value} aria-hidden="true" /> : `${percent(value)}%`}
    </span>
  </Tooltip>
}
