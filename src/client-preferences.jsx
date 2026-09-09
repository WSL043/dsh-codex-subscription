import { CapabilityPreferences } from './capability-preferences.jsx'
import { ImagePreferences } from './image-preferences.jsx'
import { useEffect, useRef, useState } from 'react'
import { Button, IconChevronDownOutline14, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { CONTEXT_MODE_CUSTOM, CONTEXT_MODE_EXTENDED, CONTEXT_MODE_FIELD, CONTEXT_MODE_STANDARD, clampModelContext, MIN_CUSTOM_CONTEXT_WINDOW, formatContextWindow, parseContextWindow, QUICK_QUOTA_MODE_BAR, QUICK_QUOTA_MODE_FORECAST, QUICK_QUOTA_MODE_FIELD, QUICK_QUOTA_MODE_OFF, QUICK_QUOTA_MODE_PERCENT, SEARCH_PROVIDER_AUTO, SEARCH_PROVIDER_CODEX, SEARCH_PROVIDER_DSH, SEARCH_PROVIDER_FIELD } from './settings-contract.js'
import { reconcileContextDrafts } from './context-draft-state.js'
import { fill, usePreferenceSnapshot } from './client-shared.js'
export function QuickQuotaPreference({ preference, t }) {
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

export function SearchProviderPreference({ preference, t }) {
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

export function ContextWindowPreference({ preference, t }) {
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

export function PreferencesCard({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  return <div className="codexSubscriptionCard codexSubscriptionPreferencesCard">
    <SearchProviderPreference preference={preference} t={t} />
    <div className="codexSubscriptionDivider" />
    <ContextWindowPreference preference={preference} t={t} />
    <div className="codexSubscriptionDivider" />
    <QuickQuotaPreference preference={preference} t={t} />
    <CapabilityPreferences preference={preference} t={t} section="quota" />
    <ImagePreferences preference={preference} t={t} />
    {snapshot.error ? <div className="codexSubscriptionRecover" role="alert"><p className="codexSubscriptionError">{t('preferenceFailed')}</p><Button type="button" variant="outline" onClick={() => { void preference.retry() }}>{t('preferenceRetry')}</Button></div> : null}
  </div>
}

