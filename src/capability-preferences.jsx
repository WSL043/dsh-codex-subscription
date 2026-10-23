import { Hint } from './client-hint.jsx'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Input } from './client-primitives.js'
import { SEARCH_MODES, QUOTA_ALERT_MODES, QUOTA_THRESHOLD_FIELDS, validQuotaThreshold, normalizeSearchDomains, ACCOUNT_SEARCH_FALLBACK_FIELD, ACCOUNT_SEARCH_FALLBACK_MODES } from './capability-settings.js'

export function CapabilityPreferences({ preference, t, section, disabled = false }) {
  const snapshot = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const [domains, setDomains] = useState('')
  const [invalid, setInvalid] = useState(false)
  const saved = snapshot.searchDomains.join(', ')
  useEffect(() => { setDomains(saved); setInvalid(false) }, [saved])
  const choices = (field, values) => <div className="codexSubscriptionQuotaModes" role="radiogroup" aria-label={t(field)}>{values.map(value => <label key={value} className="codexSubscriptionQuotaMode"><input type="radio" name={`codex-${field}`} checked={snapshot[field] === value} disabled={!snapshot.writable || disabled} onChange={() => { void preference.set({ [field]: value }) }} /><span>{t(`${field}_${value}`)}</span></label>)}</div>
  if (section === 'quota') return <><div className="codexSubscriptionPreference"><div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('quotaAlerts')}</span><Hint t={t}>{t('quotaAlertsHint')}</Hint></div>{choices('quotaAlerts', QUOTA_ALERT_MODES)}</div>{snapshot.quotaAlerts === 'custom' ? <div className="codexQuotaThresholds">{QUOTA_THRESHOLD_FIELDS.map(field => <QuotaThreshold key={field} field={field} snapshot={snapshot} preference={preference} t={t} />)}</div> : null}</>
  const save = () => {
    try {
      const next = normalizeSearchDomains(domains.trim() === '' ? [] : domains.split(/[,，\s]+/u).filter(Boolean))
      setInvalid(false)
      if (JSON.stringify(next) !== JSON.stringify(snapshot.searchDomains)) void preference.set({ searchDomains: next })
    } catch { setInvalid(true) }
  }
  if (snapshot.searchProvider === 'dsh') return null
  return <details className="codexSubscriptionSearchOptions">
    <summary>{t('searchOptions')}<span>{t(`searchMode_${snapshot.searchMode}`)}{snapshot.searchDomains.length > 0 ? ` · ${snapshot.searchDomains.length} ${t('searchDomainCount')}` : ''}</span></summary>
    <div className="codexSubscriptionPreference"><span className="codexSubscriptionPreferenceLabel">{t('searchMode')}</span>{choices('searchMode', SEARCH_MODES)}</div>
    <Hint t={t} as="p">{t('searchModeHint')}</Hint>
    <label className="codexSubscriptionPreferenceCopy"><span>{t('searchDomains')}</span><Input aria-label={t('searchDomains')} aria-invalid={invalid} value={domains} disabled={!snapshot.writable} placeholder="example.com, example.org" onChange={event => setDomains(event.currentTarget.value)} onBlur={save} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /><Hint t={t}>{t('searchDomainsHint')}</Hint></label>
    {invalid ? <p role="alert" className="codexSubscriptionError">{t('searchDomainsInvalid')}</p> : null}
  </details>
}

/**
 * The account route spends the DeepSeek balance per successful Search API request, so it is
 * rendered next to the source radios (not inside the search-scope details, which hide for DSH).
 */
export function AccountSearchFallbackPreference({ preference, t }) {
  const snapshot = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const label = t('accountSearchFallback')
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{label}</span><Hint t={t}>{t('accountSearchFallbackHint')}</Hint></div>
    <div className="codexSubscriptionQuotaModes" role="radiogroup" aria-label={label}>
      {ACCOUNT_SEARCH_FALLBACK_MODES.map(value => <label key={value} className="codexSubscriptionQuotaMode"><input type="radio" name="codex-account-search-fallback" checked={snapshot[ACCOUNT_SEARCH_FALLBACK_FIELD] === value} disabled={!snapshot.writable} onChange={() => { void preference.set({ [ACCOUNT_SEARCH_FALLBACK_FIELD]: value }) }} /><span>{t(`accountSearchFallback_${value}`)}</span></label>)}
    </div>
  </div>
}

function QuotaThreshold({ field, snapshot, preference, t }) {
  const [draft, setDraft] = useState(String(snapshot[field]))
  const [error, setError] = useState(false)
  useEffect(() => { setDraft(String(snapshot[field])); setError(false) }, [snapshot[field]])
  const save = () => { const value = Number(draft); if (!draft.trim() || !validQuotaThreshold(value)) { setError(true); return }; setError(false); if (value !== snapshot[field]) void preference.set({ [field]: value }) }
  return <label>{t(field)} <Input type="number" min={1} max={100} step={1} aria-label={t(field)} aria-invalid={error} value={draft} disabled={!snapshot.writable || snapshot.saving} onChange={event => setDraft(event.target.value)} onBlur={save} onKeyDown={event => { if (event.key === 'Enter') save() }} /> %{error ? <span role="alert">{t('quotaThresholdInvalid')}</span> : null}</label>
}
