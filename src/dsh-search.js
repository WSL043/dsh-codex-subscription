import { WebError } from '@deepseek-ai/dsh-web'

// Keep the existing provider id for saved profiles; only its hidden account fallback is removed.
export const DSH_SEARCH_PROVIDER_ID = 'codex-subscription-dsh'

export function createDshSearchProvider({ resolveDshProvider, report }) {
  return Object.freeze({
    id: DSH_SEARCH_PROVIDER_ID,
    available: () => true,
    async ready(llmProvider) {
      const provider = resolveDshProvider?.()
      // Preserve native selection errors; only a selected provider can report missing credentials.
      if (!provider || provider.id === DSH_SEARCH_PROVIDER_ID) return true
      return await provider?.ready?.(llmProvider) ?? true
    },
    async search(request, signal) {
      const provider = resolveDshProvider?.()
      if (!provider || provider.id === DSH_SEARCH_PROVIDER_ID || provider.available() !== true) {
        throw new WebError('DSH default search is unavailable', 'WEB_PROVIDER_UNAVAILABLE')
      }
      const result = await provider.search(request, signal)
      report?.(`answered by DSH provider ${provider.id}`)
      return result
    },
  })
}
