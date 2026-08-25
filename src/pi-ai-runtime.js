// Keep every dependency on pi-ai's Codex-specific public surface in one place.
// The exact peer version makes a DSH update fail visibly until this seam is
// re-audited instead of silently changing authentication or cache semantics.
import { openaiCodexProvider as createOpenAICodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import {
  CONTEXT_MODE_CUSTOM,
  CONTEXT_MODE_EXTENDED,
  customContextModelKey,
  SPEED_MODE_FAST,
  normalizeCustomContextWindow,
  supportsCodexFastMode,
} from './settings-contract.js'

const FAST_SERVICE_TIER = 'priority'

export { createModels } from '@earendil-works/pi-ai'
export { createOpenAICodexProvider as openaiCodexProvider }

/**
 * Preserve pi-ai's native Codex OAuth provider while allowing DSH's generic
 * PiAiAdapter to pass the access token resolved by the host credential store.
 *
 * PiAiAdapter owns a request-local Models collection backed by the same DSH
 * credential store as this provider. A pure OAuth provider ignores its
 * `apiKey` request override and otherwise fails before dispatch with "Provider
 * is not configured". This non-interactive bridge teaches that collection how
 * to consume only the already-refreshed token for this request; login, refresh,
 * persistence, headers, transport, and model behavior remain owned by the
 * original provider.
 */
const EXTENDED_CONTEXT_WINDOWS = Object.freeze({
  'gpt-5.4': 1_000_000,
  'gpt-5.4-mini': 400_000,
  'gpt-5.5': 1_000_000,
  'gpt-5.6-luna': 1_000_000,
  'gpt-5.6-sol': 1_000_000,
  'gpt-5.6-terra': 1_000_000,
})

export function openaiCodexSubscriptionProvider({
  resolveSpeedMode = () => undefined,
  resolveContextMode = () => undefined,
  resolveCustomContextWindow = () => undefined,
  runNetwork = (_area, operation) => operation(),
} = {}) {
  const provider = createOpenAICodexProvider()
  const requestToken = Object.freeze({
    name: 'DSH-managed Codex OAuth request token',
    async resolve({ credential }) {
      const token = credential?.type === 'api_key' ? credential.key : undefined
      if (typeof token !== 'string' || token.length === 0) return undefined
      return { auth: { apiKey: token }, source: 'DSH-managed OAuth request' }
    },
  })
  const withSpeed = (model, options = {}) => {
    if (resolveSpeedMode() !== SPEED_MODE_FAST || !supportsCodexFastMode(model?.id)) return options
    const onPayload = options.onPayload
    return {
      ...options,
      serviceTier: FAST_SERVICE_TIER,
      async onPayload(payload, requestModel) {
        const fastPayload = { ...payload, service_tier: FAST_SERVICE_TIER }
        const next = await onPayload?.(fastPayload, requestModel)
        return { ...(next ?? fastPayload), service_tier: FAST_SERVICE_TIER }
      },
    }
  }
  const getModels = () => provider.getModels().map(model => {
    const maximum = EXTENDED_CONTEXT_WINDOWS[model.id]
    const mode = resolveContextMode()
    if (maximum === undefined || ![CONTEXT_MODE_EXTENDED, CONTEXT_MODE_CUSTOM].includes(mode)) return model
    if (mode === CONTEXT_MODE_EXTENDED) {
      return { ...model, contextWindow: Math.max(model.contextWindow, maximum) }
    }
    const requested = normalizeCustomContextWindow(resolveCustomContextWindow(customContextModelKey(model.id)), maximum)
    return { ...model, contextWindow: requested }
  })
  const networkIterable = factory => {
    let iterator
    const getIterator = () => (iterator ??= factory()[Symbol.asyncIterator]())
    return {
      [Symbol.asyncIterator]() { return this },
      next: value => runNetwork('model', () => getIterator().next(value)),
      return: value => runNetwork('model', () => getIterator().return?.(value) ?? Promise.resolve({ done: true, value })),
      throw: error => runNetwork('model', () => getIterator().throw?.(error) ?? Promise.reject(error)),
    }
  }
  return Object.freeze({
    ...provider,
    auth: Object.freeze({ ...provider.auth, apiKey: requestToken }),
    getModels,
    stream: (model, context, options) => networkIterable(() => provider.stream(model, context, withSpeed(model, options))),
    streamSimple: (model, context, options) => networkIterable(() => provider.streamSimple(model, context, withSpeed(model, options))),
  })
}

export const PI_AI_RUNTIME_VERSION = '0.82.1'
