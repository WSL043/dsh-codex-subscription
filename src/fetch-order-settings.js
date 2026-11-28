import { CODEX_FETCH_PROVIDER_ID, CODEX_FETCH_FALLBACK_PROVIDER_ID } from './codex-fetch.js'
import { FETCH_CHAIN_PROVIDER_ID, FETCH_ORDER_FIELD, FETCH_ORDER_RELOAD_REQUIRED, isCompositeFetchProvider, validateFetchOrder } from './fetch-order.js'

const reloadRequired = (message, cause) => Object.assign(new Error(message, { cause }), { code: FETCH_ORDER_RELOAD_REQUIRED })
const selectionStamp = row => JSON.stringify([row?.value?.fetchProvider, row?.user?.fetchProvider, row?.base?.fetchProvider])

/** Own the effective fetch order and its migration to the shared DSH provider selection. */
export function createFetchOrderSettings({ settings, forms, registry, codex, configuredId, managed, available }) {
  const describe = () => typeof forms.describe === 'function' ? forms.describe({ redactSecrets: true }) : []
  const webRow = () => describe().find(row => row.ns === 'web')
  const pluginRow = () => describe().find(row => row.ns === settings.id)
  const providerFor = id => id === CODEX_FETCH_PROVIDER_ID ? codex : registry?.get(id)
  const sources = () => [...(registry?.values() ?? [])]
    .filter(provider => !isCompositeFetchProvider(provider.id))
    .map(provider => {
      const actual = providerFor(provider.id)
      return { id: provider.id, title: actual.title ?? provider.title ?? provider.id, available: actual.available() }
    })
  const nativeId = () => {
    const base = webRow()?.base?.fetchProvider
    const value = [configuredId(), settings.get().webFetchFallbackProvider, base]
      .find(id => typeof id === 'string' && id && id !== CODEX_FETCH_PROVIDER_ID && !isCompositeFetchProvider(id))
    if (value) return value
    const usable = sources().filter(provider => provider.id !== CODEX_FETCH_PROVIDER_ID && provider.available)
    return usable.length === 1 ? usable[0].id : undefined
  }
  const legacyOrder = mode => {
    if (mode === 'codex' || mode === CODEX_FETCH_PROVIDER_ID) return [CODEX_FETCH_PROVIDER_ID]
    if (mode && !['dsh', 'codex-fallback'].includes(mode) && !isCompositeFetchProvider(mode)) return [mode]
    const native = nativeId()
    if (mode === 'codex-fallback' || mode === CODEX_FETCH_FALLBACK_PROVIDER_ID) return native ? [CODEX_FETCH_PROVIDER_ID, native] : []
    return native ? [native] : []
  }
  const order = () => {
    const saved = settings.get()[FETCH_ORDER_FIELD]
    if (managed()) {
      const selected = configuredId()
      if (selected !== FETCH_CHAIN_PROVIDER_ID) return legacyOrder(selected)
    }
    if (saved !== undefined) return validateFetchOrder(saved)
    return legacyOrder(settings.get().fetchProvider ?? 'dsh')
  }

  let pending = Promise.resolve()
  const serialize = operation => {
    const result = pending.then(operation, operation)
    pending = result.catch(() => {})
    return result
  }
  async function persist(next) {
    if (forms.writable !== true) throw new Error('Webpage reading settings are read-only')
    if (!available()) throw new Error('This DSH version cannot configure webpage reading order')
    const value = validateFetchOrder(next)
    const before = settings.get()[FETCH_ORDER_FIELD]
    const previous = order()
    const registered = new Set(sources().map(provider => provider.id))
    if (value.some(id => !registered.has(id) && !previous.includes(id))) throw new Error('A selected webpage reader is no longer registered')
    const wasManaged = managed()
    const initialWeb = wasManaged ? webRow() : undefined
    if (wasManaged && !initialWeb) throw new Error('DSH Web settings are unavailable')
    const initialSelection = selectionStamp(initialWeb)
    const plugin = pluginRow()
    await settings.update({ [FETCH_ORDER_FIELD]: value }, ...(plugin ? [plugin.revision] : []))
    try {
      if (managed() !== wasManaged) throw reloadRequired('Webpage settings changed during activation; reload settings before retrying')
      if (!wasManaged) return
      const web = webRow()
      if (!web) throw new Error('DSH Web settings are unavailable')
      if (selectionStamp(web) !== initialSelection) throw reloadRequired('The shared webpage source changed during this save; reload settings before retrying')
      if (web.value?.fetchProvider !== FETCH_CHAIN_PROVIDER_ID) {
        await forms.update('web', { fetchProvider: FETCH_CHAIN_PROVIDER_ID }, web.revision)
      }
    } catch (error) {
      const currentPlugin = pluginRow()
      if (JSON.stringify(settings.get()[FETCH_ORDER_FIELD]) !== JSON.stringify(value)) {
        throw reloadRequired('Webpage reading order changed during activation; reload settings before retrying', error)
      }
      try {
        if (before === undefined) {
          if (typeof forms.mutate !== 'function') throw new Error('This host cannot restore an absent webpage order')
          await forms.mutate(settings.id, [{ op: 'unset', path: [FETCH_ORDER_FIELD] }], currentPlugin?.revision)
        } else await settings.update({ [FETCH_ORDER_FIELD]: before }, ...(currentPlugin ? [currentPlugin.revision] : []))
      } catch (restoreError) {
        throw reloadRequired('Could not activate or restore the webpage reading order; reload settings before retrying', restoreError)
      }
      if (wasManaged && selectionStamp(webRow()) !== initialSelection && error?.code !== FETCH_ORDER_RELOAD_REQUIRED) {
        throw reloadRequired('The shared webpage source changed during this save; reload settings before retrying', error)
      }
      throw error
    }
  }

  return Object.freeze({
    order,
    sources,
    nativeId,
    legacyOrder,
    status: () => ({ [FETCH_ORDER_FIELD]: order(), fetchSources: sources(), fetchOrderAvailable: available() }),
    update: next => serialize(() => persist(next)),
    initialize: () => serialize(async () => {
      if (settings.get()[FETCH_ORDER_FIELD] !== undefined || forms.writable !== true || !available()) return
      const current = order()
      if (current.length) await persist(current)
    }),
  })
}
