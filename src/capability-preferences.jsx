import { useEffect, useState, useSyncExternalStore } from 'react'
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { SEARCH_MODES, QUOTA_ALERT_MODES, QUOTA_THRESHOLD_FIELDS, validQuotaThreshold, normalizeSearchDomains } from './capability-settings.js'

export function CapabilityPreferences({ preference, t, section }) {
  const snapshot = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const [domains, setDomains] = useState('')
  const [invalid, setInvalid] = useState(false)
  const saved = snapshot.searchDomains.join(', ')
  useEffect(() => { setDomains(saved); setInvalid(false) }, [saved])
  const choices = (field, values) => <div className="codexSubscriptionQuotaModes" role="radiogroup" aria-label={t(field)}>{values.map(value => <label key={value} className="codexSubscriptionQuotaMode"><input type="radio" name={`codex-${field}`} checked={snapshot[field] === value} disabled={!snapshot.writable} onChange={() => { void preference.set({ [field]: value }) }} /><span>{t(`${field}_${value}`)}</span></label>)}</div>
  if (section === 'quota') return <><div className="codexSubscriptionPreference"><div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('quotaAlerts')}</span><span className="codexSubscriptionPreferenceHint">{t('quotaAlertsHint')}</span></div>{choices('quotaAlerts', QUOTA_ALERT_MODES)}</div>{snapshot.quotaAlerts === 'custom' ? <div className="codexQuotaThresholds">{QUOTA_THRESHOLD_FIELDS.map(field => <QuotaThreshold key={field} field={field} snapshot={snapshot} preference={preference} t={t} />)}</div> : null}</>
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
    <p className="codexSubscriptionPreferenceHint">{t('searchModeHint')}</p>
    <label className="codexSubscriptionPreferenceCopy"><span>{t('searchDomains')}</span><Input aria-label={t('searchDomains')} aria-invalid={invalid} value={domains} disabled={!snapshot.writable} placeholder="example.com, example.org" onChange={event => setDomains(event.currentTarget.value)} onBlur={save} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /><span className="codexSubscriptionPreferenceHint">{t('searchDomainsHint')}</span></label>
    {invalid ? <p role="alert" className="codexSubscriptionError">{t('searchDomainsInvalid')}</p> : null}
  </details>
}

function QuotaThreshold({ field, snapshot, preference, t }) {
  const [draft, setDraft] = useState(String(snapshot[field]))
  const [error, setError] = useState(false)
  useEffect(() => { setDraft(String(snapshot[field])); setError(false) }, [snapshot[field]])
  const save = () => { const value = Number(draft); if (!draft.trim() || !validQuotaThreshold(value)) { setError(true); return }; setError(false); if (value !== snapshot[field]) void preference.set({ [field]: value }) }
  return <label>{t(field)} <Input type="number" min={1} max={100} step={1} aria-label={t(field)} aria-invalid={error} value={draft} disabled={!snapshot.writable || snapshot.saving} onChange={event => setDraft(event.target.value)} onBlur={save} onKeyDown={event => { if (event.key === 'Enter') save() }} /> %{error ? <span role="alert">{t('quotaThresholdInvalid')}</span> : null}</label>
}
