import { CodexImageToolRow } from './client-images.jsx'
import { CapabilityPreferences } from './capability-preferences.jsx'
import { quotaWarning } from './capability-settings.js'
import { zh, en } from './client-locales.js'
import { STYLE } from './client-styles.js'
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BoltIcon } from '@heroicons/react/16/solid'
import { Button, IconCheckOutline16, IconChevronDownOutline14, IconChevronRightOutline14, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { createAnnotatedImageReference } from './image-edit-reference.js'
import { SubscriptionImageViewerOverlay } from './subscription-image-viewer.jsx'
import { SUBSCRIPTION_IMAGE_VIEWER_CSS } from './subscription-image-viewer-styles.js'
import { SubscriptionImageViewerService } from './subscription-image-viewer.js'
import {
  CONTEXT_MODE_CUSTOM,
  CONTEXT_MODE_EXTENDED,
  CONTEXT_MODE_FIELD,
  CONTEXT_MODE_STANDARD,
  clampModelContext,
  MIN_CUSTOM_CONTEXT_WINDOW,
  formatContextWindow,
  parseContextWindow,
  QUICK_QUOTA_MODE_BAR,
  QUICK_QUOTA_MODE_FORECAST,
  QUICK_QUOTA_MODE_FIELD,
  QUICK_QUOTA_MODE_OFF,
  QUICK_QUOTA_MODE_PERCENT,
  OUTPUT_VERBOSITY_DEFAULT,
  OUTPUT_VERBOSITY_FIELD,
  OUTPUT_VERBOSITY_HIGH,
  OUTPUT_VERBOSITY_LOW,
  OUTPUT_VERBOSITY_MEDIUM,
  SEARCH_PROVIDER_AUTO,
  SEARCH_PROVIDER_CODEX,
  SEARCH_PROVIDER_DSH,
  SEARCH_PROVIDER_FIELD,
  SETTINGS_NAMESPACE,
  SPEED_MODE_FAST,
  SPEED_MODE_FIELD,
  SPEED_MODE_STANDARD,
  supportsCodexFastMode,
} from './settings-contract.js'
import { selectModelQuotaWindows } from './sidebar-quota.js'
import { readLoginProgress } from './login-progress.js'
import { createPreferenceController } from './preference-controller.js'
import { createAccountStatusController } from './account-status-controller.js'
import { reconcileContextDrafts } from './context-draft-state.js'

export const inject = [
  'slots', 'locale', 'connection', 'remote', 'settingsScope', 'modelDirectories', 'conversation', 'uiConversation', 'sessions',
]

const NS = 'settings.codexSubscription'
const CHANNEL = '/codex-subscription'
const SUPPORT_ISSUE_URL = 'https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml'
const QUICK_QUOTA_REFRESH_EVENT = 'dsh-codex-subscription:refresh-quick-quota'
const QUICK_QUOTA_REFRESH_MS = 60_000

const unwrap = response => {
  if (!response?.ok) throw new Error(response?.error?.message ?? 'Codex RPC failed')
  return response.value
}
const accountStatusErrorText = (error, t) => {
  const key = {
    'credential-unavailable': 'accountCredentialUnavailable',
    'credential-malformed': 'accountCredentialMalformed',
    timeout: 'accountStatusTimeout',
    transport: 'accountStatusTransport',
    unknown: 'accountStatusUnknown',
  }[error?.code]
  return t(key ?? 'accountStatusUnknown')
}
const fill = (text, values) => Object.entries(values).reduce((next, [key, value]) => next.replace(`{${key}}`, String(value)), text)
const maskEmail = value => {
  if (typeof value !== 'string' || !value.includes('@')) return '••••'
  const [local, domain] = value.split('@', 2)
  if (local.length <= 2) return `${local.slice(0, 1)}••@${domain}`
  return `${local[0]}•••${local.at(-1)}@${domain}`
}
const hours = seconds => Math.round((seconds / 3600) * 10) / 10
const percent = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })
const isApproximateWindow = (seconds, expected) => seconds >= expected * 0.95 && seconds <= expected * 1.05
const windowLabel = (seconds, t) => {
  if (isApproximateWindow(seconds, 18_000)) return t('windowFiveHours')
  if (isApproximateWindow(seconds, 86_400)) return t('windowDaily')
  if (isApproximateWindow(seconds, 604_800)) return t('windowWeekly')
  if (isApproximateWindow(seconds, 2_592_000)) return t('windowMonthly')
  if (isApproximateWindow(seconds, 31_536_000)) return t('windowAnnual')
  return seconds >= 86_400 && seconds % 86_400 === 0
    ? fill(t('windowDays'), { value: seconds / 86_400 })
    : fill(t('windowHours'), { value: hours(seconds) })
}
const validDate = value => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}
const usePreferenceSnapshot = preference => useSyncExternalStore(
  preference.subscribe,
  preference.getSnapshot,
)
const useAccountStatusSnapshot = accountStatus => useSyncExternalStore(
  accountStatus.subscribe,
  accountStatus.getSnapshot,
)

const notifyQuickQuota = () => window.dispatchEvent(new Event(QUICK_QUOTA_REFRESH_EVENT))

const formatRunway = (seconds, t) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  const minutes = Math.max(1, Math.round(seconds / 60))
  const days = Math.floor(minutes / 1_440)
  const hours = Math.floor((minutes % 1_440) / 60)
  if (days > 0) return hours > 0 ? fill(t('runwayDaysHours'), { days, hours }) : fill(t('runwayDays'), { days })
  if (hours > 0) return fill(t('runwayHours'), { hours })
  return fill(t('runwayMinutes'), { minutes })
}

const formatQuotaForecast = (forecast, t) => {
  if (forecast?.status === 'calibrating') return t('quotaForecastCalibrating')
  if (forecast?.status === 'idle') return t('quotaForecastIdle')
  if (forecast?.status !== 'ready') return undefined
  if (forecast.survivesReset) return t('quotaForecastUntilReset')
  const duration = formatRunway(forecast.runwaySeconds, t)
  return duration === undefined ? undefined : fill(t('quotaForecast'), { symbol: '≈', duration })
}

function useQuickQuota(rpc, enabled, model) {
  const [quota, setQuota] = useState()
  useEffect(() => {
    if (!enabled) {
      setQuota(undefined)
      return undefined
    }
    let live = true
    let loading = false
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const account = unwrap(await rpc.call(CHANNEL, 'status', {}))
        if (!live) return
        if (account?.authenticated !== true) {
          setQuota(undefined)
          return
        }
        const usage = unwrap(await rpc.call(CHANNEL, 'usage', { force: false }))
        if (live) setQuota(selectModelQuotaWindows(usage, model))
      } catch {
        if (live) setQuota(undefined)
      } finally {
        loading = false
      }
    }
    const refresh = () => { void load() }
    void load()
    const timer = window.setInterval(refresh, QUICK_QUOTA_REFRESH_MS)
    window.addEventListener(QUICK_QUOTA_REFRESH_EVENT, refresh)
    return () => {
      live = false
      window.clearInterval(timer)
      window.removeEventListener(QUICK_QUOTA_REFRESH_EVENT, refresh)
    }
  }, [rpc, enabled, model])
  return quota
}

function QuickQuotaPreference({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const writable = snapshot.status === 'ready' && snapshot.writable === true
  const choice = (value, label) => <label className="codexSubscriptionQuotaMode"><input type="radio" name="codex-subscription-quota-mode" checked={snapshot.quickQuotaMode === value} disabled={!writable} onChange={() => { void preference.set({ [QUICK_QUOTA_MODE_FIELD]: value }) }} /><span>{label}</span></label>
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('quickQuotaSetting')}</span>{snapshot.quickQuotaMode === QUICK_QUOTA_MODE_FORECAST ? <span className="codexSubscriptionPreferenceHint">{t('quickQuotaForecastHint')}</span> : null}</div>
    <div className="codexSubscriptionQuotaModes" data-saving={snapshot.saving || undefined} aria-busy={snapshot.saving || undefined} role="radiogroup" aria-label={t('quickQuotaSetting')}>
      {choice(QUICK_QUOTA_MODE_OFF, t('quickQuotaOff'))}
      {choice(QUICK_QUOTA_MODE_PERCENT, t('quickQuotaPercent'))}
      {choice(QUICK_QUOTA_MODE_BAR, t('quickQuotaBar'))}
      {choice(QUICK_QUOTA_MODE_FORECAST, <>{t('quickQuotaForecast')} <small>{t('quickQuotaBeta')}</small></>)}
    </div>
  </div>
}

function SearchProviderPreference({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const writable = snapshot.status === 'ready' && snapshot.writable === true
  const choice = (value, label, hint) => <label className="codexSubscriptionSearchChoice"><input className="codexSubscriptionSearchInput" type="radio" name="codex-subscription-search-provider" checked={snapshot.searchProvider === value} disabled={!writable} onChange={() => { void preference.set({ [SEARCH_PROVIDER_FIELD]: value }) }} /><span className="codexSubscriptionSearchCopy"><strong>{label}</strong><span>{hint}</span></span></label>
  return <div className="codexSubscriptionSearch">
    <div className="codexSubscriptionSearchHead"><h3>{t('searchTitle')}</h3><span className="codexSubscriptionSearchScope">{t('searchScope')}</span></div>
    <div className="codexSubscriptionSearchChoices" data-saving={snapshot.saving || undefined} aria-busy={snapshot.saving || undefined} role="radiogroup" aria-label={t('searchTitle')}>
      {choice(SEARCH_PROVIDER_AUTO, t('searchAuto'), t('searchAutoHint'))}
      {choice(SEARCH_PROVIDER_DSH, t('searchDsh'), t('searchDshHint'))}
      {choice(SEARCH_PROVIDER_CODEX, t('searchCodex'), t('searchCodexHint'))}
    </div>
    <CapabilityPreferences preference={preference} t={t} section="search" />
  </div>
}

function ContextWindowPreference({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const writable = snapshot.status === 'ready' && snapshot.writable === true
  const [menuOpen, setMenuOpen] = useState(false)
  const modelRows = snapshot.contextModels.filter(model => model.fixed !== true)
  const fixedRows = snapshot.contextModels.filter(model => model.fixed === true)
  const [drafts, setDrafts] = useState({})
  const previousSavedValues = useRef()
  const draftSeed = modelRows.map(model => `${model.key}\u0000${snapshot.customContextWindows[model.key]}`).join('\u0001')
  useEffect(() => {
    const savedValues = Object.fromEntries(modelRows.map(model => [model.key, String(snapshot.customContextWindows[model.key])]))
    const previous = previousSavedValues.current
    setDrafts(current => reconcileContextDrafts({
      modelRows,
      drafts: current,
      previousSavedValues: previous,
      savedValues,
    }))
    previousSavedValues.current = savedValues
  }, [draftSeed])
  const hint = snapshot.contextMode === CONTEXT_MODE_EXTENDED
    ? t('contextExtendedHint')
    : snapshot.contextMode === CONTEXT_MODE_CUSTOM
      ? t('contextCustomHint')
      : t('contextStandardHint')
  const commit = modelKey => {
    const parsed = parseContextWindow(drafts[modelKey])
    if (!Number.isInteger(parsed)) {
      setDrafts(current => ({ ...current, [modelKey]: String(snapshot.customContextWindows[modelKey]) }))
      return
    }
    const value = clampModelContext(parsed, modelRows.find(model => model.key === modelKey).maximum)
    setDrafts(current => ({ ...current, [modelKey]: String(value) }))
    if (value !== snapshot.customContextWindows[modelKey]) void preference.set({ customContextModels: { ...snapshot.customContextModels, [modelKey]: value } })
  }
  const contextModeItems = [
    { id: CONTEXT_MODE_STANDARD, label: t('contextStandard') },
    { id: CONTEXT_MODE_EXTENDED, label: t('contextExtended') },
    { id: CONTEXT_MODE_CUSTOM, label: t('contextCustom') },
  ]
  const selectedMode = contextModeItems.find(item => item.id === snapshot.contextMode)?.label ?? t('contextStandard')
  return <div className="codexSubscriptionContext">
    <div className="codexSubscriptionContextHead">
      <div className="codexSubscriptionContextCopy"><span className="codexSubscriptionPreferenceLabel">{t('contextTitle')}</span><span className="codexSubscriptionContextHint">{hint}</span></div>
      <Menu open={menuOpen} items={contextModeItems} selectedId={snapshot.contextMode} onSelect={value => { setMenuOpen(false); void preference.set({ [CONTEXT_MODE_FIELD]: value }) }} onClose={() => setMenuOpen(false)} align="end" side="bottom" portal compact anchor={<button className="codexSubscriptionContextTrigger" type="button" aria-label={t('contextTitle')} aria-haspopup="menu" aria-expanded={menuOpen} disabled={!writable} onClick={() => setMenuOpen(value => !value)}><span>{selectedMode}</span><IconChevronDownOutline14 /></button>} />
    </div>
    {snapshot.contextMode === CONTEXT_MODE_CUSTOM ? <div className="codexSubscriptionContextModels">{modelRows.map(model => <div className="codexSubscriptionContextModel" key={model.key}><span className="codexSubscriptionContextModelCopy"><strong>{model.label}</strong><span>{fill(t('contextMaximum'), { minimum: String(Math.min(MIN_CUSTOM_CONTEXT_WINDOW, model.maximum)), value: String(model.maximum) })}</span></span><Input aria-label={`${model.label} ${t('contextTokens')}`} className="codexSubscriptionContextInput" type="number" inputMode="numeric" min={Math.min(MIN_CUSTOM_CONTEXT_WINDOW, model.maximum)} max={model.maximum} step={1} value={drafts[model.key] ?? ''} disabled={!writable} onChange={event => { const nextValue = event.currentTarget.value; setDrafts(current => ({ ...current, [model.key]: nextValue })) }} onBlur={() => commit(model.key)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></div>)}{fixedRows.map(model => <div className="codexSubscriptionContextModel" key={model.key}><span className="codexSubscriptionContextModelCopy"><strong>{model.label}</strong><span>{fill(t('contextFixed'), { value: formatContextWindow(model.maximum) })}</span></span><span className="codexSubscriptionContextHint">{formatContextWindow(model.maximum)}</span></div>)}</div> : null}
    <div className="codexSubscriptionPreference"><span className="codexSubscriptionPreferenceHint">{t(snapshot.catalogStatus?.source === 'online' ? 'catalogOnline' : 'catalogFallback')}</span><Button type="button" variant="outline" disabled={snapshot.modelsLoading} aria-busy={snapshot.modelsLoading} onClick={() => { void preference.refreshModels() }}>{t(snapshot.modelsLoading ? 'refreshing' : 'catalogRefresh')}</Button></div>
    {snapshot.modelError ? <p className="codexSubscriptionError" role="alert">{t('modelDirectoryFailed')}</p> : null}
  </div>
}

function PreferencesCard({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  return <div className="codexSubscriptionCard codexSubscriptionPreferencesCard">
    <SearchProviderPreference preference={preference} t={t} />
    <div className="codexSubscriptionDivider" />
    <ContextWindowPreference preference={preference} t={t} />
    <div className="codexSubscriptionDivider" />
    <QuickQuotaPreference preference={preference} t={t} />
    <CapabilityPreferences preference={preference} t={t} section="quota" />
    {snapshot.error ? <div className="codexSubscriptionRecover" role="alert"><p className="codexSubscriptionError">{t('preferenceFailed')}</p><Button type="button" variant="outline" onClick={() => { void preference.retry() }}>{t('preferenceRetry')}</Button></div> : null}
  </div>
}

function CodexComposerQuota({ preference, rpc, t, directory }) {
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

function CodexComposerQuotaWindow({ quota, mode, forecastMode, t }) {
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

function CodexModelSelect({ locked, available, directory, load, select, preference, t }) {
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const preferenceSnapshot = usePreferenceSnapshot(preference)
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState('root')
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const id = useId()
  const choices = useMemo(() => state.groups.flatMap(group => group.models.map(model => ({
    group,
    model,
    selection: {
      provider: group.id,
      model: model.id,
      ...(model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: model.reasoning.defaultEffort }),
    },
  }))), [state.groups])
  const currentChoice = choices.find(choice => choice.selection.provider === state.current?.provider && choice.selection.model === state.current?.model)
  const reasoning = currentChoice?.model.reasoning
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('providerDefault')
      : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortChoices = useMemo(() => reasoning === undefined ? [] : [
    ...(reasoning.defaultEffort === undefined ? [{ key: 'provider-default', effort: undefined, label: t('providerDefault') }] : []),
    ...reasoning.efforts.map(effort => ({
      key: `effort:${effort.id}`,
      effort: effort.id,
      label: effort.name,
      ...(effort.description === undefined ? {} : { description: effort.description }),
    })),
  ], [reasoning, t])
  const modelLabel = currentChoice?.model.name ?? t('selectModel')
  const speedSupported = state.current?.provider === 'openai-codex' && (preferenceSnapshot.fastModels?.includes(state.current?.model) ?? supportsCodexFastMode(state.current?.model))
  const speedWritable = preferenceSnapshot.status === 'ready' && preferenceSnapshot.writable === true
  const fast = speedSupported && preferenceSnapshot.speedMode === SPEED_MODE_FAST
  const verbositySupported = state.current?.provider === 'openai-codex' && preferenceSnapshot.verbosityModels.includes(state.current?.model)
  const verbosityWritable = preferenceSnapshot.status === 'ready' && preferenceSnapshot.writable === true
  const verbosityItems = [
    { id: OUTPUT_VERBOSITY_DEFAULT, label: t('verbosityDefault'), description: t('verbosityDefaultHint') },
    { id: OUTPUT_VERBOSITY_LOW, label: t('verbosityLow'), description: t('verbosityLowHint') },
    { id: OUTPUT_VERBOSITY_MEDIUM, label: t('verbosityMedium'), description: t('verbosityMediumHint') },
    { id: OUTPUT_VERBOSITY_HIGH, label: t('verbosityHigh'), description: t('verbosityHighHint') },
  ]
  const verbosityLabel = verbosityItems.find(item => item.id === preferenceSnapshot.outputVerbosity)?.label ?? t('verbosityDefault')
  const busy = state.status === 'selecting'

  useEffect(() => {
    if (available) load()
  }, [available, load])
  useEffect(() => {
    if (!open) return undefined
    const closeOutside = event => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
        setPane('root')
      }
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])
  useEffect(() => {
    if (!speedSupported && pane === 'speed') setPane('root')
    if (!verbositySupported && pane === 'verbosity') setPane('root')
  }, [pane, speedSupported, verbositySupported])
  if (!available) return null

  const close = (restoreFocus = false) => {
    setOpen(false)
    setPane('root')
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus())
  }
  const settleSelection = accepted => {
    if (accepted) close(true)
  }
  const chooseModel = selection => {
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      close(true)
      return
    }
    void select(selection).then(settleSelection)
  }
  const chooseEffort = effort => {
    if (state.current === null) return
    if (effectiveEffort === effort) {
      close(true)
      return
    }
    void select({
      provider: state.current.provider,
      model: state.current.model,
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
    }).then(settleSelection)
  }
  const chooseSpeed = speedMode => {
    close(true)
    void preference.set({ [SPEED_MODE_FIELD]: speedMode })
  }
  const chooseVerbosity = outputVerbosity => {
    close(true)
    void preference.set({ [OUTPUT_VERBOSITY_FIELD]: outputVerbosity })
  }
  const option = ({ key, label, description, selected, disabled, onClick }) => <button
    key={key}
    type="button"
    role="menuitemradio"
    aria-checked={selected}
    className="codexModelSelectOption"
    disabled={disabled}
    onClick={onClick}
  >
    <span className="codexModelSelectOptionCopy"><span className="codexModelSelectOptionName">{label}</span>{description === undefined ? null : <span className="codexModelSelectOptionDescription">{description}</span>}</span>
    <span className="codexModelSelectCheck">{selected ? <IconCheckOutline16 /> : null}</span>
  </button>
  const cell = (target, label, value) => <button
    type="button"
    role="menuitem"
    className="codexModelSelectCell"
    data-open={pane === target}
    aria-haspopup="menu"
    aria-expanded={pane === target}
    onClick={() => setPane(current => current === target ? 'root' : target)}
  >
    <span className="codexModelSelectCellLabel">{label}</span>
    <span className="codexModelSelectCellValue">{value}</span>
    <IconChevronRightOutline14 className="codexModelSelectCellChevron" />
  </button>

  let submenu = null
  if (pane === 'model') {
    submenu = <div className="codexModelSelectSubmenu" role="menu" aria-label={t('modelLabel')}>
      {state.status === 'loading' ? <div className="codexModelSelectStatus">{t('modelsLoading')}</div> : null}
      {state.error === null ? null : <div className="codexModelSelectError"><span>{fill(t('modelFailed'), { value: state.error })}</span><button className="codexModelSelectRetry" type="button" onClick={load}>{t('modelRetry')}</button></div>}
      {state.failures.map(failure => <div className="codexModelSelectWarning" key={failure.id}>{fill(t('groupFailed'), { name: failure.name, value: failure.message })}</div>)}
      <div className="codexModelSelectGroups scrollable">{state.groups.map(group => <section className="codexModelSelectGroup" role="group" aria-labelledby={`${id}-${group.id}`} key={group.id}>
        <div className="codexModelSelectGroupTitle" id={`${id}-${group.id}`}>{group.name}</div>
        {group.models.map(model => option({
          key: model.id,
          label: model.name,
          description: model.description,
          selected: state.current?.provider === group.id && state.current.model === model.id,
          disabled: busy,
          onClick: () => chooseModel({ provider: group.id, model: model.id }),
        }))}
      </section>)}</div>
      {state.status === 'ready' && choices.length === 0 ? <div className="codexModelSelectEmpty">{t('modelsEmpty')}</div> : null}
    </div>
  } else if (pane === 'effort') {
    submenu = <div className="codexModelSelectSubmenu" role="menu" aria-label={t('effortLabel')}>
      {effortChoices.length === 0 ? <div className="codexModelSelectEmpty">{t('effortsEmpty')}</div> : effortChoices.map(level => option({
        key: level.key,
        label: level.label,
        description: level.description,
        selected: effectiveEffort === level.effort,
        disabled: busy,
        onClick: () => chooseEffort(level.effort),
      }))}
    </div>
  } else if (pane === 'speed') {
    submenu = <div className="codexModelSelectSubmenu" role="menu" aria-label={t('speedTitle')}>
      {option({ key: SPEED_MODE_STANDARD, label: t('speedStandard'), description: t('speedStandardHint'), selected: !fast, disabled: !speedWritable, onClick: () => chooseSpeed(SPEED_MODE_STANDARD) })}
      {option({ key: SPEED_MODE_FAST, label: t('speedFast'), description: t(state.current?.model === 'gpt-6-astra' ? 'speedFastAstraHint' : 'speedFastHint'), selected: fast, disabled: !speedWritable, onClick: () => chooseSpeed(SPEED_MODE_FAST) })}
    </div>
  } else if (pane === 'verbosity') {
    submenu = <div className="codexModelSelectSubmenu" role="menu" aria-label={t('verbosityTitle')}>
      {verbosityItems.map(item => option({ key: item.id, label: item.label, description: item.description, selected: preferenceSnapshot.outputVerbosity === item.id, disabled: !verbosityWritable, onClick: () => chooseVerbosity(item.id) }))}
    </div>
  }

  return <div className="codexModelSelect" ref={rootRef} onKeyDown={event => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    if (pane === 'root') close(true)
    else setPane('root')
  }}>
    <button
      ref={triggerRef}
      type="button"
      className="codexModelSelectTrigger"
      aria-label={modelLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? `${id}-menu` : undefined}
      title={modelLabel}
      disabled={locked}
      onClick={() => open ? close() : (setPane('root'), setOpen(true), load())}
    >
      {fast && <BoltIcon className="codexModelSelectBolt" aria-hidden="true" />}
      <span className="codexModelSelectLabel">{modelLabel}</span>
      {effortLabel === undefined ? null : <span className="codexModelSelectEffort">{effortLabel}</span>}
      <IconChevronDownOutline14 className="codexModelSelectChevron" />
    </button>
    {open ? <div className="codexModelSelectMenu" id={`${id}-menu`} role="menu" aria-label={t('modelMenuAria')} aria-busy={state.status === 'loading' || busy}>
      {cell('model', t('modelLabel'), modelLabel)}
      {reasoning === undefined ? null : cell('effort', t('effortLabel'), effortLabel)}
      {speedSupported && cell('speed', t('speedTitle'), t(fast ? 'speedFast' : 'speedStandard'))}
      {verbositySupported && cell('verbosity', t('verbosityTitle'), verbosityLabel)}
      {submenu}
    </div> : null}
  </div>
}

function AccountEmail({ candidate, fallback, t, emailVisible, onClick }) {
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

function AccountCard({ rpc, t, account, setAccount, onSignedOut }) {
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

function AccountFailureCard({ accountStatus, snapshot, t }) {
  const retrying = snapshot.retrying === true
  return <div className="codexSubscriptionCard codexSubscriptionRecover" role="alert">
    <p className="codexSubscriptionError">{retrying ? t('accountRetrying') : accountStatusErrorText(snapshot.error, t)}</p>
    <Button type="button" variant="outline" disabled={retrying} aria-busy={retrying} onClick={() => { void accountStatus.retry() }}>{retrying ? t('accountRetrying') : t('accountRetry')}</Button>
  </div>
}

function DiagnosticsCard({ rpc, t }) {
  const [report, setReport] = useState()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const load = () => {
    setBusy(true); setError(false); setCopied(false)
    void rpc.call(CHANNEL, 'diagnostics', {}).then(unwrap).then(setReport)
      .catch(() => setError(true)).finally(() => setBusy(false))
  }
  const copy = () => {
    if (report === undefined) return
    void navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => setCopied(true)).catch(() => setError(true))
  }
  return <div className="codexSubscriptionCard codexSubscriptionDiagnostics">
    <div className="codexSubscriptionSectionHead">
      <div className="codexSubscriptionSectionTitle"><h3>{t('diagnostics')}</h3></div>
      <div className="codexSubscriptionActions"><Button type="button" variant="outline" disabled={busy} onClick={load}>{busy ? t('diagnosticsLoading') : t('diagnosticsLoad')}</Button>{report === undefined ? null : <Button type="button" variant="outline" onClick={copy}>{copied ? t('diagnosticsCopied') : t('diagnosticsCopy')}</Button>}<a className="codexSubscriptionLink" href={SUPPORT_ISSUE_URL} target="_blank" rel="noreferrer">{t('feedbackOpen')}</a></div>
    </div>
    {report === undefined ? null : <pre>{JSON.stringify(report, null, 2)}</pre>}
    {error ? <p className="codexSubscriptionError" role="alert">{t('diagnosticsFailed')}</p> : null}
  </div>
}

function ResetTime({ resetsAt, t }) {
  const date = Number.isSafeInteger(resetsAt) ? validDate(resetsAt * 1_000) : undefined
  if (date === undefined) return <span>{t('resetUnknown')}</span>
  const value = date.toLocaleString(undefined, {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  return <time dateTime={date.toISOString()} title={date.toLocaleString()}>{fill(t('resets'), { value })}</time>
}

function ResetCreditExpiry({ expiresAt, t }) {
  const date = validDate(expiresAt)
  return <span className="codexSubscriptionResetExpiry">{date === undefined ? t('resetCreditExpiryUnknown') : <time dateTime={date.toISOString()} title={date.toLocaleString()}>{fill(t('resetCreditExpires'), { value: date.toLocaleString() })}</time>}</span>
}

function ResetCreditList({ rpc, t, count, nextExpiresAt, initialCredits, refreshKey, hasExhaustedQuota, onConsumed }) {
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

function ResetCreditControl({ rpc, t, credit, hasExhaustedQuota, onConsumed }) {
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

function resetCreditErrorText(error, t) {
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

function UsageCard({ rpc, t, signedIn, resetKey, preference }) {
  const preferenceSnapshot = usePreferenceSnapshot(preference)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!signedIn) return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [signedIn])
  const [usage, setUsage] = useState()
  const [usageRefreshGeneration, setUsageRefreshGeneration] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState()
  const request = useRef(0)
  const load = force => {
    if (!signedIn) return
    const id = ++request.current
    setBusy(true); setError(undefined)
    void rpc.call(CHANNEL, 'usage', { force }).then(unwrap)
      .then(next => {
        if (request.current === id) {
          setUsage(next)
          setNow(Date.now())
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
  const warning = error === undefined ? quotaWarning(visibleUsage, preferenceSnapshot.quotaAlerts, now) : undefined
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
    {warning === undefined ? null : <p className="codexSubscriptionError" role="status">{fill(t('quotaWarning'), { window: windowLabel(warning.windowSeconds, t), value: percent(warning.remainingPercent) })}</p>}
    {visibleUsage?.spendControlReached === true ? <p className="codexSubscriptionError" role="alert">{t('spendReached')}</p> : null}
    {limits.length === 0 ? null : <div className="codexSubscriptionLimits">{limits.flatMap(limit => limit.windows.map((window, index) => <div className="codexSubscriptionLimit" key={`${limit.id}-${window.windowSeconds}-${index}`}>
        <div className="codexSubscriptionLimitTop"><span className="codexSubscriptionLimitLabel">{limit.name ?? limit.id}</span><strong>{percent(window.remainingPercent)}%</strong></div>
        <progress max="100" value={window.remainingPercent} aria-label={`${limit.name ?? limit.id} ${fill(t('remaining'), { value: percent(window.remainingPercent) })}`} />
        <div className="codexSubscriptionLimitMeta"><span>{formatQuotaForecast(window.forecast, t) ?? windowLabel(window.windowSeconds, t)}</span><ResetTime resetsAt={window.resetsAt} t={t} /></div>
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

function CodexSection({ preference, rpc, accountStatus, t }) {
  const accountSnapshot = useAccountStatusSnapshot(accountStatus)
  const account = accountSnapshot.account
  const [resetKey, setResetKey] = useState(0)
  const setAccount = accountStatus.acceptAccount
  const accountChanged = () => {
    setResetKey(value => value + 1)
    void preference.refreshModels()
  }
  useEffect(() => {
    void accountStatus.load()
    void preference.refreshModels()
  }, [accountStatus, preference])
  return <section className="codexSubscription">
    <div className="codexSubscriptionHead"><h2>{t('title')}</h2></div>
    {accountSnapshot.status === 'error' ? <AccountFailureCard accountStatus={accountStatus} snapshot={accountSnapshot} t={t} /> : <AccountCard rpc={rpc} t={t} account={account} setAccount={setAccount} onSignedOut={accountChanged} />}
    <PreferencesCard preference={preference} t={t} />
    {account === undefined ? null : <UsageCard rpc={rpc} t={t} signedIn={account.authenticated === true} resetKey={resetKey} preference={preference} />}
    <DiagnosticsCard rpc={rpc} t={t} />
  </section>
}

export function apply(ctx) {
  const imageViewer = new SubscriptionImageViewerService()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'codex-subscription: copy')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-codex-subscription'
    tag.textContent = STYLE + SUBSCRIPTION_IMAGE_VIEWER_CSS
    document.head.append(tag)
    return () => tag.remove()
  }, 'codex-subscription: style')
  const connection = ctx.get('connection')
  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE })
  const preference = createPreferenceController(scope, connection.rpc)
  const accountStatus = createAccountStatusController(connection.rpc)
  ctx.effect(() => {
    void preference.load()
    void accountStatus.load()
    const disposeReset = ctx.on('connection/reset', () => { void preference.load(); void preference.refreshModels(); void accountStatus.reload() })
    return () => {
      disposeReset?.()
      preference.dispose()
      accountStatus.dispose()
    }
  }, 'codex-subscription: preferences and account status')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'codex-subscription-image-viewer', order: 20,
    inject: () => ({ service: imageViewer, t }),
  }, SubscriptionImageViewerOverlay))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'codex-subscription', order: 15,
    label: () => t('nav'), locale: NS, inject: () => ({ preference, rpc: connection.rpc, accountStatus, t }),
  }, CodexSection))
  const sessions = ctx.get('sessions')
  const installDirectorySlots = scope => {
    const modelDirectories = scope.get('modelDirectories')
    scope.slots.inject('conversation.input.right', () => scope.slots.register({
      name: 'conversation.input.right', id: 'codex-subscription-quota', order: 15,
      locale: NS,
      inject: sessionId => ({
        preference,
        rpc: connection.rpc,
        t,
        directory: modelDirectories.directoryFor(sessionId).store,
      }),
    }, CodexComposerQuota))
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model', priority: -10, locale: NS,
      inject: sessionId => {
        const directory = modelDirectories.directoryFor(sessionId)
        const available = sessions.subagentAddress(sessionId) === undefined
        return {
          available,
          directory: directory.store,
          load: () => { if (available) void directory.load() },
          select: selection => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false),
          preference,
        }
      },
    }, CodexModelSelect))
  }
  if (ctx.get('remote.session') === undefined) installDirectorySlots(ctx)
  else ctx.inject(['remote.session'], installDirectorySlots)
  const conversation = ctx.get('conversation')
  const uiConversation = ctx.get('uiConversation')
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: 'codex_image_generate', locale: NS,
    inject: sessionId => ({
      sessionId,
      rpc: connection.rpc,
      t,
      loadImage: attachment => uiConversation.imageUrl(sessionId, attachment),
      getImageViewer: () => {
        try {
          return ctx.get('nativeImageViewer')
        } catch {
          return undefined
        }
      },
      getInternalImageViewer: () => imageViewer,
      attachForEdit: async (src, filename, draft, annotations = [], referenceName) => {
        const actx = sessions.scope(sessionId)
        if (actx === undefined || typeof conversation.createDraftImages !== 'function' || conversation.input?.for === undefined) {
          throw new Error('This DSH version does not provide the image composer bridge')
        }
        const response = await fetch(src)
        if (!response.ok) throw new Error('Could not read generated image')
        const blob = await response.blob()
        const files = [new File([blob], filename, { type: blob.type || 'image/png' })]
        if (annotations.length > 0) {
          const reference = await createAnnotatedImageReference(blob, annotations)
          files.push(new File([reference], referenceName, { type: 'image/png' }))
        }
        const created = conversation.createDraftImages(files)
        const input = conversation.input.for(actx)
        if (!input.addImages(created.map(item => item.id))) {
          conversation.releaseDraftImages(created)
          throw new Error('The composer is busy')
        }
        sessions.open(sessionId)
        input.setDraft(draft)
      },
    }),
  }, CodexImageToolRow))
}
