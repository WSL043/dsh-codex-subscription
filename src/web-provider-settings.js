import { CODEX_AUTO_SEARCH_PROVIDER_ID, CODEX_SEARCH_PROVIDER_ID } from './codex-search.js'
import { DSH_SEARCH_PROVIDER_ID } from './dsh-search.js'
import { CODEX_FETCH_PROVIDER_ID, CODEX_FETCH_FALLBACK_PROVIDER_ID } from './codex-fetch.js'
import { FETCH_CHAIN_PROVIDER_ID, FETCH_ORDER_FIELD, isCompositeFetchProvider, validateFetchOrder } from './fetch-order.js'

const WEB = 'web'
const subscriptionSearchIds = new Set([CODEX_SEARCH_PROVIDER_ID, CODEX_AUTO_SEARCH_PROVIDER_ID, DSH_SEARCH_PROVIDER_ID])
const isNativeSearch = id => typeof id === 'string' && id !== '' && !subscriptionSearchIds.has(id)
const isNativeFetch = id => typeof id === 'string' && id !== '' && id !== CODEX_FETCH_PROVIDER_ID && !isCompositeFetchProvider(id)

function nativeDefaults(row, legacy) {
  const values = {}
  const search = row.user?.searchProvider ?? row.value?.searchProvider
  const fetch = row.user?.fetchProvider ?? row.value?.fetchProvider
  if (isNativeSearch(search) && search !== legacy.webSearchFallbackProvider) values.webSearchFallbackProvider = search
  if (isNativeFetch(fetch) && fetch !== legacy.webFetchFallbackProvider) values.webFetchFallbackProvider = fetch
  return values
}

export function createWebProviderSettings(ctx, settings) {
  const forms = ctx.settings
  // These versions expose the native provider picker and live Web settings.
  if (typeof ctx.web.listProviders !== 'function' || typeof forms.describe !== 'function') return undefined
  const describe = () => forms.describe({ redactSecrets: true })
  const web = () => describe().find(row => row.ns === WEB)
  const nativeSearch = () => {
    const { value, base } = web() ?? {}
    return [value?.searchProvider, settings.get().webSearchFallbackProvider, base?.searchProvider]
      .find(isNativeSearch)
  }
  const nativeFetch = () => {
    const { value, base } = web() ?? {}
    return [value?.fetchProvider, settings.get().webFetchFallbackProvider, base?.fetchProvider]
      .find(isNativeFetch)
  }
  const managed = () => settings.get().webProvidersManagedByDsh === true

  async function remember() {
    if (!managed() || forms.writable !== true) return
    const rows = describe()
    const web = rows.find(row => row.ns === WEB)
    const plugin = rows.find(row => row.ns === settings.id)
    if (!web || !plugin) return
    const patch = nativeDefaults(web, settings.get())
    if (Object.keys(patch).length) await settings.update(patch, plugin.revision)
  }

  let migrating
  const migrate = () => {
    if (!migrating) migrating = migrateOnce().finally(() => { migrating = undefined })
    return migrating
  }
  async function migrateOnce() {
    if (managed() || forms.writable !== true) return
    const rows = describe()
    const web = rows.find(row => row.ns === WEB)
    const plugin = rows.find(row => row.ns === settings.id)
    if (!web || !plugin) return
    const currentSearch = web.value?.searchProvider
    const currentFetch = web.value?.fetchProvider
    const legacy = settings.get()
    const patch = {}
    // A saved plugin section distinguishes existing profiles from a clean install.
    // The old router intercepted the configured native id, while explicit plugin ids won.
    if (Object.keys(plugin.user ?? {}).length && currentSearch && !subscriptionSearchIds.has(currentSearch)) {
      if (legacy.searchProvider === 'codex') patch.searchProvider = CODEX_SEARCH_PROVIDER_ID
      if (legacy.searchProvider === 'auto') patch.searchProvider = CODEX_AUTO_SEARCH_PROVIDER_ID
    }
    let fetchId
    if (legacy[FETCH_ORDER_FIELD] !== undefined) {
      validateFetchOrder(legacy[FETCH_ORDER_FIELD])
      fetchId = FETCH_CHAIN_PROVIDER_ID
    } else fetchId = legacy.fetchProvider === 'codex-fallback' ? CODEX_FETCH_FALLBACK_PROVIDER_ID
      : legacy.fetchProvider === 'codex' ? CODEX_FETCH_PROVIDER_ID : undefined
    if (fetchId && currentFetch !== fetchId) patch.fetchProvider = fetchId
    const previous = nativeDefaults(web, legacy)
    if (Object.keys(previous).length) await settings.update(previous, plugin.revision)
    if (Object.keys(patch).length) await forms.update(WEB, patch, web.revision)
    // Read again after the Web edit, which can advance this entry's revision.
    const currentPlugin = describe().find(row => row.ns === settings.id)
    if (currentPlugin) await settings.update({ webProvidersManagedByDsh: true }, currentPlugin.revision)
  }

  return { managed, migrate, nativeSearch, nativeFetch, remember }
}
