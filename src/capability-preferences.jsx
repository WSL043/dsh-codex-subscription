import { useEffect, useState, useSyncExternalStore } from 'react'
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { SEARCH_MODES, QUOTA_ALERT_MODES, normalizeSearchDomains } from './capability-settings.js'

export function CapabilityPreferences({ preference, t, section }) {
  const snapshot = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const [domains, setDomains] = useState('')
  const [invalid, setInvalid] = useState(false)
  const saved = snapshot.searchDomains.join(', ')
  useEffect(() => { setDomains(saved); setInvalid(false) }, [saved])
  const choices = (field, values) => <div className="codexSubscriptionQuotaModes" role="radiogroup" aria-label={t(field)}>{values.map(value => <label key={value} className="codexSubscriptionQuotaMode"><input type="radio" name={`codex-${field}`} checked={snapshot[field] === value} disabled={!snapshot.writable} onChange={() => { void preference.set({ [field]: value }) }} /><span>{t(`${field}_${value}`)}</span></label>)}</div>
  if (section === 'quota') return <div className="codexSubscriptionPreference"><div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('quotaAlerts')}</span><span className="codexSubscriptionPreferenceHint">{t('quotaAlertsHint')}</span></div>{choices('quotaAlerts', QUOTA_ALERT_MODES)}</div>
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
