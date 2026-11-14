import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { Hint, SettingsLabel } from './client-hint.jsx'

const empty = Object.freeze({})
const idle = () => () => {}
const snapshot = () => empty
const nativeTitles = {
  'deepseek-search-api': 'DeepSeek Search API',
  'deepseek-official': 'DeepSeek',
  'deepseek-fetch-api': 'DeepSeek Fetch API',
  http: 'HTTP',
  'codex-subscription': 'Codex Subscription',
  'codex-subscription-auto': 'Codex Subscription (Auto)',
  'codex-subscription-dsh': 'DSH (Codex Subscription)',
}

export const webProviderTitle = id => nativeTitles[id] ?? id

export function useWebProviderForm(ctx) {
  return useProviderSnapshot(ctx?.get('configForms')?.get('web'))
}

function useProviderSnapshot(form) {
  return useSyncExternalStore(
    form ? listener => form.subscribe(listener) : idle,
    form ? () => form.getSnapshot() : snapshot,
  )
}

export function WebProviderSettings({ ctx, t, preference }) {
  const radioId = useId()
  const form = ctx?.get('configForms')?.get('web')
  const section = useProviderSnapshot(form)
  const subscription = useProviderSnapshot(ctx?.get('configForms')?.get('codex-subscription'))
  const preferences = preference.getSnapshot()
  const [providers, setProviders] = useState()
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!form) return
    return ctx.inject(['remote.web'], scope => scope.effect(() => {
      const remote = scope.get('remote')
      let generation = 0
      const load = async () => {
        const current = ++generation
        const result = await remote.web.listProviders().catch(() => undefined)
        if (current === generation) setProviders(result?.ok ? result.value : undefined)
      }
      const off = remote.$on('web/providers-changed', load)
      const offReset = scope.on('connection/reset', load)
      void load()
      return () => { generation++; off(); offReset() }
    }))
  }, [ctx, form])

  const change = async (field, value) => {
    setSaving(true)
    setFailed(false)
    try {
      const path = [field]
      const op = !value || value === section.base?.[field] ? { op: 'unset', path } : { op: 'set', path, value }
      setFailed(!await form.mutate([op], section.revision))
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }
  const row = (capability, label, ids, selected) => {
    const field = capability + 'Provider'
    const id = section.value?.[field]
    const providerName = providers?.[capability]?.find(provider => provider.id === id)?.title ?? webProviderTitle(id)
    const showProvider = selected === 'dsh' && id && id !== 'codex-subscription-dsh'
    const hint = capability === 'search' ? `search${{ auto: 'Auto', codex: 'Codex', dsh: 'Dsh' }[selected]}Hint` : selected === 'codex' ? 'fetchCodexHint' : 'fetchDshHint'
    return <div className="codexSubscriptionPreference">
      <div className="codexSubscriptionPreferenceCopy">
        <SettingsLabel description={t(hint)}>{label}</SettingsLabel>
        {section.status === 'ready' && showProvider ? <Hint>{providerName}</Hint> : null}
      </div>
      <div className="codexSubscriptionSearchChoices codexSubscriptionQuotaModes" role="radiogroup" aria-label={label} aria-busy={saving || undefined}>
        {Object.entries(ids).map(([mode, target]) => <label className="codexSubscriptionQuotaMode" key={mode}>
          <input type="radio" name={`${radioId}-${field}`} checked={section.status === 'ready' && selected === mode}
            disabled={section.status !== 'ready' || !section.writable || saving}
            onChange={() => { void change(field, target) }} />
          <span>{mode === 'auto' ? t('searchAuto') : mode === 'codex' ? 'Codex' : 'DSH'}</span>
        </label>)}
      </div>
    </div>
  }
  const search = section.value?.searchProvider
  const fetch = section.value?.fetchProvider
  const baseFetch = section.base?.fetchProvider
  const nativeSearch = subscription.user?.webSearchFallbackProvider ?? preferences.webSearchFallbackProvider
  const nativeFetch = subscription.user?.webFetchFallbackProvider ?? preferences.webFetchFallbackProvider
  return <>
    {row('search', t('searchTitle'), { auto: 'codex-subscription-auto', dsh: nativeSearch ?? 'codex-subscription-dsh', codex: 'codex-subscription' },
      search === 'codex-subscription-auto' ? 'auto' : search === 'codex-subscription' ? 'codex' : 'dsh')}
    {row('fetch', t('fetchTitle'), { dsh: nativeFetch ?? (baseFetch === 'codex-subscription-fetch' ? 'http' : baseFetch), codex: 'codex-subscription-fetch' },
      fetch === 'codex-subscription-fetch' ? 'codex' : 'dsh')}
    {failed ? <p className="codexSubscriptionError" role="alert">{t('preferenceFailed')}</p> : null}
  </>
}
