export { CHANNEL, unwrap } from './rpc-contract.js'
import { useSyncExternalStore } from 'react'
import { quotaForecastView, formatQuotaRunout } from './quota-forecast-view.js'
import { ACCESS_DENIED, DEVICE_LIMIT, PURCHASE_LIMIT } from './http-failure.js'
const ACCESS_FAILURE_KEYS = new Map([[ACCESS_DENIED, 'accessDenied'], [DEVICE_LIMIT, 'deviceLimit'], [PURCHASE_LIMIT, 'purchaseLimit']])
export const accessFailureText = (message, t) => {
  const key = ACCESS_FAILURE_KEYS.get(message)
  return key === undefined ? message : t(key)
}
export const NS = 'settings.codexSubscription'
export const SUPPORT_ISSUE_URL = 'https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml'
export const QUICK_QUOTA_REFRESH_EVENT = 'dsh-codex-subscription:refresh-quick-quota'

export const accountStatusErrorText = (error, t) => {
  const key = {
    'credential-unavailable': 'accountCredentialUnavailable',
    'credential-malformed': 'accountCredentialMalformed',
    timeout: 'accountStatusTimeout',
    transport: 'accountStatusTransport',
    unknown: 'accountStatusUnknown',
  }[error?.code]
  return t(key ?? 'accountStatusUnknown')
}
export const fill = (text, values) => Object.entries(values).reduce((next, [key, value]) => next.replace(`{${key}}`, String(value)), text)
export const maskEmail = value => {
  if (typeof value !== 'string' || !value.includes('@')) return '••••'
  const [local, domain] = value.split('@', 2)
  if (local.length <= 2) return `${local.slice(0, 1)}••@${domain}`
  return `${local[0]}•••${local.at(-1)}@${domain}`
}
export const hours = seconds => Math.round((seconds / 3600) * 10) / 10
/** The language DSH shows its interface in, so dates and numbers match the text around them rather than the OS. */
export const uiLocale = () => (typeof document === 'undefined' ? undefined : document.documentElement.lang || undefined)
export const percent = value => Number(value).toLocaleString(uiLocale(), { maximumFractionDigits: 1 })
// The API reports credits as a long decimal string; two decimals are enough to read.
export const creditAmount = value => Number.isFinite(Number(value)) && String(value).trim() !== '' ? Number(value).toLocaleString(uiLocale(), { maximumFractionDigits: 2 }) : value
export const isApproximateWindow = (seconds, expected) => seconds >= expected * 0.95 && seconds <= expected * 1.05
export const windowLabel = (seconds, t) => {
  if (isApproximateWindow(seconds, 18_000)) return t('windowFiveHours')
  if (isApproximateWindow(seconds, 86_400)) return t('windowDaily')
  if (isApproximateWindow(seconds, 604_800)) return t('windowWeekly')
  if (isApproximateWindow(seconds, 2_592_000)) return t('windowMonthly')
  if (isApproximateWindow(seconds, 31_536_000)) return t('windowAnnual')
  return seconds >= 86_400 && seconds % 86_400 === 0
    ? fill(t('windowDays'), { value: seconds / 86_400 })
    : seconds >= 172_800
      ? fill(t('windowDays'), { value: Math.round(seconds / 8640) / 10 })
      : fill(t('windowHours'), { value: hours(seconds) })
}
export const validDate = value => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}
export const usePreferenceSnapshot = preference => useSyncExternalStore(
  preference.subscribe,
  preference.getSnapshot,
)
export const useAccountStatusSnapshot = accountStatus => useSyncExternalStore(
  accountStatus.subscribe,
  accountStatus.getSnapshot,
)

export const notifyQuickQuota = () => window.dispatchEvent(new Event(QUICK_QUOTA_REFRESH_EVENT))

export const formatQuotaForecast = (forecast, t, options = {}) => {
  const view = quotaForecastView(forecast, options)
  if (view.kind !== 'time') return t(({ resolution: 'forecastResolution', 'changing-pace': 'forecastChanging', stale: 'forecastStale', idle: 'quotaForecastIdle', reset: 'quotaForecastUntilReset', exhausted: 'quotaExhausted' })[view.kind] ?? 'quotaForecastCalibrating')
  const when = formatQuotaRunout(view, { t, locale: options.locale ?? uiLocale(), now: options.now, timeZone: options.timeZone })
  return fill(t(view.provisional ? 'quotaForecastRoughAt' : 'quotaForecastAt'), { when })
}
