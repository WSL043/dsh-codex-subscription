import { useEffect, useState, useSyncExternalStore } from 'react'
import { SettingsLabel } from './client-hint.jsx'
import { IconChevronDownOutline14, Menu } from './client-primitives.jsx'

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

export const webProviderTitle = (id, t) => id === 'deepseek-official' && t ? t('searchDeepSeekLegacy')
  : Object.hasOwn(nativeTitles, id) ? nativeTitles[id] : id

const options = {
  search: {
    'deepseek-official': ['searchDeepSeekLegacy', 'searchLegacyCost'],
    'deepseek-search-api': ['DeepSeek Search API', 'searchApiCost'],
    'codex-subscription': ['Codex', 'searchCodexHint'],
    'codex-subscription-auto': ['searchAuto', 'searchAutoHint'],
    'codex-subscription-dsh': ['searchDsh', 'searchDshHint'],
  },
  fetch: {
    http: ['HTTP', 'fetchHttpCost'],
    'deepseek-fetch-api': ['DeepSeek Fetch API', 'fetchDeepSeekCost'],
    'codex-subscription-fetch': ['Codex', 'fetchCodexCost'],
  },
}

function ProviderChoice({ kind, title, current, providers, writable, saving, t, change }) {
  const [open, setOpen] = useState(false)
  const names = options[kind]
  const registered = new Map(providers?.map(provider => [provider.id, provider]))
  const ids = new Set([...Object.keys(names).filter(id => registered.has(id)), ...registered.keys()])
  if (current) ids.add(current)
  const describe = id => {
    if (!Object.hasOwn(names, id)) return { label: registered.get(id)?.title ?? webProviderTitle(id, t) }
    const [name, detail] = names[id]
    return { label: name.startsWith('search') ? t(name) : name, description: t(detail) }
  }
  const selected = describe(current)
  const hasNativeSearch = kind === 'search' && [...registered.keys()].some(id => !Object.hasOwn(names, id) || id === 'deepseek-official' || id === 'deepseek-search-api')
  const items = [...ids].filter(id => id !== 'codex-subscription-dsh' || id === current || !hasNativeSearch)
    .map(id => ({ id, disabled: !registered.has(id), ...describe(id) }))
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy">
      <SettingsLabel description={selected.description}>{title}</SettingsLabel>
    </div>
    <Menu open={open} items={items} selectedId={current} align="end"
      onClose={() => setOpen(false)}
      onSelect={id => { setOpen(false); if (id !== current) void change(kind + 'Provider', id) }}
      anchor={<button className="codexSubscriptionContextTrigger codexSubscriptionWebProviderTrigger" type="button"
        aria-label={title} aria-expanded={open} aria-busy={saving || undefined}
        disabled={!writable || !items.some(item => !item.disabled)} onClick={() => setOpen(value => !value)}>
        <span>{selected.label ?? '—'}</span><IconChevronDownOutline14 />
      </button>} />
  </div>
}

export function useWebProviderForm(ctx) {
  return useProviderSnapshot(ctx?.get('configForms')?.get('web'))
}

function useProviderSnapshot(form) {
  return useSyncExternalStore(
    form ? listener => form.subscribe(listener) : idle,
    form ? () => form.getSnapshot() : snapshot,
  )
}

export function WebProviderSettings({ ctx, t }) {
  const form = ctx?.get('configForms')?.get('web')
  const section = useProviderSnapshot(form)
  const [providers, setProviders] = useState()
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!form) return
    const fiber = ctx.inject(['remote.web'], scope => {
      scope.effect(() => {
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
      }, 'codex-subscription: web provider discovery')
    })
    return () => { void fiber.dispose() }
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
  const writable = section.status === 'ready' && section.writable && !saving
  return <>
    {['search', 'fetch'].map(kind => <ProviderChoice key={kind}
      kind={kind} title={t(kind + 'Title')} current={section.value?.[kind + 'Provider']}
      providers={providers?.[kind]} writable={writable} saving={saving} t={t} change={change} />)}
    {failed ? <p className="codexSubscriptionError" role="alert">{t('preferenceFailed')}</p> : null}
  </>
}
