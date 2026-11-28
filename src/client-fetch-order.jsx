import { useEffect, useRef, useState } from 'react'
import { Hint, SettingsLabel } from './client-hint.jsx'
import { Button, IconChevronDownOutline14, Menu } from './client-primitives.jsx'
import { fill, usePreferenceSnapshot } from './client-shared.js'
import { useWebProviderForm, webProviderTitle } from './client-web-provider-settings.jsx'
import { FETCH_ORDER_FIELD, FETCH_STOP, changeFetchOrder, fetchOrderOptions, isCompositeFetchProvider } from './fetch-order.js'

const sourceCatalog = sources => new Map((sources ?? []).filter(source => !isCompositeFetchProvider(source.id)).map(source => [source.id, source]))
const costKeys = { http: 'fetchHttpCost', 'deepseek-fetch-api': 'fetchDeepSeekCost', 'codex-subscription-fetch': 'fetchCodexCost' }

export function FetchOrderPreference({ preference, t, webSettingsContext }) {
  const snapshot = usePreferenceSnapshot(preference)
  const web = useWebProviderForm(webSettingsContext)
  const previousSharedProvider = useRef(web.value?.fetchProvider)
  const [openIndex, setOpenIndex] = useState(null)
  const activity = useRef({ saving: false, pending: false, refresh: null })
  useEffect(() => {
    if (!webSettingsContext?.inject) return
    const state = activity.current
    let active = true
    const refresh = () => {
      if (!active) return
      state.pending = true
      const current = preference.getSnapshot()
      if (state.saving || current.saving || current.error) return
      state.pending = false
      void preference.load()
    }
    state.refresh = refresh
    const fiber = webSettingsContext.inject(['remote.web'], scope => {
      scope.effect(() => {
        const remote = scope.get('remote')
        const off = remote.$on('web/providers-changed', refresh)
        const offSettings = remote.$on('settings/document-updated', refresh)
        const offReset = scope.on('connection/reset', refresh)
        return () => { off(); offSettings(); offReset() }
      }, 'codex-subscription: fetch source discovery')
    })
    return () => {
      active = false
      state.pending = false
      state.refresh = null
      void fiber.dispose()
    }
  }, [preference, webSettingsContext])
  useEffect(() => {
    const selected = web.value?.fetchProvider
    if (selected === previousSharedProvider.current) return
    previousSharedProvider.current = selected
    if (snapshot.webProvidersManagedByDsh) activity.current.refresh?.()
  }, [web.value?.fetchProvider, snapshot.webProvidersManagedByDsh])
  useEffect(() => {
    if (!snapshot.saving && activity.current.pending) activity.current.refresh?.()
    if (snapshot.saving || snapshot.status !== 'ready' || !snapshot.writable || snapshot.fetchOrderNeedsReload || !snapshot.fetchOrderAvailable) setOpenIndex(null)
  }, [snapshot.saving, snapshot.status, snapshot.writable, snapshot.fetchOrderNeedsReload, snapshot.fetchOrderAvailable])

  const catalog = sourceCatalog(snapshot.fetchSources)
  const providerIds = [...catalog.keys()]
  const order = Array.isArray(snapshot[FETCH_ORDER_FIELD]) ? snapshot[FETCH_ORDER_FIELD] : []
  const writable = snapshot.status === 'ready' && snapshot.writable === true && !snapshot.fetchOrderNeedsReload && snapshot.fetchOrderAvailable === true && !snapshot.saving
  const rows = order.length ? [...order] : catalog.size ? [undefined] : []
  if (order.length && fetchOrderOptions(order, order.length, providerIds).some(id => id !== FETCH_STOP)) rows.push(FETCH_STOP)
  const title = id => id === 'codex-subscription-fetch' ? 'Codex'
    : catalog.get(id)?.title && catalog.get(id).title !== id ? catalog.get(id).title : webProviderTitle(id, t)
  const describe = (id, index) => {
    if (id === FETCH_STOP) return { label: t('fetchOrderStop'), description: t(index === order.length ? 'fetchOrderAppendHint' : 'fetchOrderStopHint') }
    const source = catalog.get(id)
    const label = source ? source.available ? title(id) : fill(t('fetchOrderUnavailableSource'), { title: title(id) }) : fill(t('fetchOrderMissingSource'), { title: title(id) })
    const position = order.indexOf(id)
    const description = !source ? t('fetchOrderMissingHint') : !source.available ? t('fetchOrderSourceUnavailableHint')
      : [position >= 0 && position !== index ? fill(t('fetchOrderSwap'), { number: position + 1 }) : undefined,
        Object.hasOwn(costKeys, id) ? t(costKeys[id]) : source.description].filter(Boolean).join(' ') || undefined
    return { label, description, disabled: !source?.available }
  }
  const change = async (index, id) => {
    setOpenIndex(null)
    const current = preference.getSnapshot()
    if (activity.current.saving || current.saving || current.status !== 'ready' || !current.writable || current.fetchOrderNeedsReload || !current.fetchOrderAvailable) return
    const sources = sourceCatalog(current.fetchSources)
    const currentOrder = current[FETCH_ORDER_FIELD] ?? []
    if (index > currentOrder.length) return
    if ((id === FETCH_STOP && index === 0) || (id !== FETCH_STOP && !sources.get(id)?.available)) return
    if (!fetchOrderOptions(currentOrder, index, [...sources.keys()]).includes(id)) return
    const nextOrder = changeFetchOrder(currentOrder, index, id, [...sources.keys()])
    if (!nextOrder.length || nextOrder.length === currentOrder.length && nextOrder.every((value, position) => value === currentOrder[position])) return
    activity.current.saving = true
    try {
      await preference.set({ [FETCH_ORDER_FIELD]: nextOrder })
    } finally {
      activity.current.saving = false
      if (activity.current.pending) activity.current.refresh?.()
    }
  }

  return <div className="codexSubscriptionSearch" aria-busy={snapshot.saving || undefined} data-saving={snapshot.saving || undefined}>
    <SettingsLabel as="h3" className="" description={t('fetchOrderEditHint')}>{t('fetchTitle')}</SettingsLabel>
    <Hint>{t('fetchOrderHint')}</Hint>
    {snapshot.status !== 'ready' ? <Hint>{t(snapshot.status === 'unavailable' ? 'fetchOrderLoadFailed' : 'fetchOrderLoading')}</Hint> : !snapshot.fetchOrderAvailable ? <Hint>{t('fetchOrderUnsupported')}</Hint> : null}
    {snapshot.status === 'ready' && !catalog.size ? <Hint>{t('fetchOrderEmpty')}</Hint> : null}
    {snapshot.status === 'ready' && !snapshot.writable && !snapshot.fetchOrderNeedsReload ? <Hint>{t('settingsReadonly')}</Hint> : null}
    {snapshot.fetchOrderNeedsReload ? <div className="codexSubscriptionError" role="alert">
      <p>{t('fetchOrderReloadRequired')}</p>
      <Button variant="outline" size="sm" disabled={snapshot.status === 'loading' || snapshot.saving} onClick={() => { void preference.load() }}>{t('refresh')}</Button>
    </div> : null}
    {rows.map((id, index) => {
      const options = fetchOrderOptions(order, index, providerIds).filter(option => index !== 0 || option !== FETCH_STOP)
      const menuItems = options.map(option => ({ id: option, ...describe(option, index) }))
      if (id !== undefined && id !== FETCH_STOP && !catalog.has(id)) menuItems.unshift({ id, ...describe(id, index) })
      const selected = id === undefined ? { label: t('fetchOrderChoose') } : describe(id, index)
      const label = fill(t('fetchOrderPosition'), { number: index + 1 })
      return <div key={index} className="codexSubscriptionPreference">
        <div className="codexSubscriptionPreferenceCopy">
          <span className="codexSubscriptionPreferenceLabel">{label}</span>
          {id !== undefined && id !== FETCH_STOP && !catalog.get(id)?.available ? <Hint>{selected.description}</Hint> : null}
        </div>
        <Menu open={openIndex === index && writable} items={menuItems} selectedId={id} align="end"
          onClose={() => setOpenIndex(null)} onSelect={next => change(index, next)}
          anchor={<button className="codexSubscriptionContextTrigger codexSubscriptionWebProviderTrigger" type="button"
            aria-label={`${label}: ${selected.label}`} aria-expanded={openIndex === index && writable} aria-busy={snapshot.saving || undefined}
            disabled={!writable || !menuItems.some(item => !item.disabled && item.id !== id)} onClick={() => setOpenIndex(current => current === index ? null : index)}>
            <span>{selected.label}</span><IconChevronDownOutline14 />
          </button>} />
      </div>
    })}
    {snapshot.saving ? <div role="status"><Hint>{t('fetchOrderSaving')}</Hint></div> : null}
    {snapshot.error && !snapshot.fetchOrderNeedsReload ? <p className="codexSubscriptionError" role="alert">{t('preferenceFailed')}</p> : null}
  </div>
}
