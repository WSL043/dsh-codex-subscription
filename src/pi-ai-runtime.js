// Keep every dependency on pi-ai's Codex-specific public surface in one place.
// The exact peer version makes a DSH update fail visibly until this seam is
// re-audited instead of silently changing authentication or cache semantics.
import { openaiCodexProvider as createOpenAICodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'

export { createModels } from '@earendil-works/pi-ai'
export { createOpenAICodexProvider as openaiCodexProvider }

/**
 * Preserve pi-ai's native Codex OAuth provider while allowing DSH's generic
 * PiAiAdapter to pass the access token resolved by the host credential store.
 *
 * PiAiAdapter owns a request-local Models collection without a credential
 * store. A pure OAuth provider ignores its `apiKey` request override and fails
 * before dispatch with "Provider is not configured". This non-interactive
 * bridge teaches that collection how to consume only the already-refreshed
 * token for this request; login, refresh, persistence, headers, transport, and
 * model behavior remain owned by the original provider.
 */
export function openaiCodexSubscriptionProvider() {
  const provider = createOpenAICodexProvider()
  const requestToken = Object.freeze({
    name: 'DSH-managed Codex OAuth request token',
    async resolve({ credential }) {
      const token = credential?.type === 'api_key' ? credential.key : undefined
      if (typeof token !== 'string' || token.length === 0) return undefined
      return { auth: { apiKey: token }, source: 'DSH-managed OAuth request' }
    },
  })
  return Object.freeze({
    ...provider,
    auth: Object.freeze({ ...provider.auth, apiKey: requestToken }),
  })
}

export const PI_AI_RUNTIME_VERSION = '0.82.1'
