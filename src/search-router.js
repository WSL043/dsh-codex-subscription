import { CODEX_AUTO_SEARCH_PROVIDER_ID, CODEX_SEARCH_PROVIDER_ID } from './codex-search.js'
import { DSH_ACCOUNT_SEARCH_PROVIDER_ID } from './deepseek-account-search.js'
import { SEARCH_PROVIDER_AUTO, SEARCH_PROVIDER_CODEX } from './settings-contract.js'

const OWN_IDS = new Set([CODEX_SEARCH_PROVIDER_ID, CODEX_AUTO_SEARCH_PROVIDER_ID, DSH_ACCOUNT_SEARCH_PROVIDER_ID])

/**
 * Routes web search by the plugin's "search source" setting without touching which provider DSH has configured.
 *
 * The provider the user (or DSH's own settings page) picked stays the configured one, so DSH's settings keep showing
 * and saving what the user chose (for example the new Search API switch). Only the lookup of that one provider at
 * search time answers with a small router that sends the search to the Codex subscription, to the configured provider
 * (with the DeepSeek account fallback), or by the conversation's model.
 *
 * @returns {Map|undefined} a stand-in for the web registry, or undefined when the registry is not a Map.
 */
export function createSearchRouter({ registry, configuredId, mode, providers }) {
  if (!(registry instanceof Map)) return undefined
  const wrappers = new Map()
  const routerFor = id => {
    let router = wrappers.get(id)
    if (router === undefined) {
      router = Object.freeze({
        id,
        available: () => true,
        search(request, signal) {
          const selected = mode()
          const provider = selected === SEARCH_PROVIDER_CODEX ? providers.codex : selected === SEARCH_PROVIDER_AUTO ? providers.auto : providers.dsh
          return provider.search(request, signal)
        },
      })
      wrappers.set(id, router)
    }
    return router
  }
  return new Proxy(registry, {
    get(target, property) {
      if (property === 'get') {
        return id => {
          const configured = configuredId()
          return typeof id === 'string' && id === configured && !OWN_IDS.has(id) ? routerFor(id) : target.get(id)
        }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
