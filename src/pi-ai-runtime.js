// Keep every dependency on pi-ai's Codex-specific public surface in one place.
// The exact peer version makes a DSH update fail visibly until this seam is
// re-audited instead of silently changing authentication or cache semantics.
import { openaiCodexProvider as createOpenAICodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { normalizeTransportEvent } from './transport-failure.js'
import {
  CONTEXT_MODE_CUSTOM,
  CONTEXT_MODE_EXTENDED,
  customContextModelKey,
  normalizeInputImageDetail,
  OUTPUT_VERBOSITY_DEFAULT,
  SPEED_MODE_FAST,
  SPEED_MODE_ULTRAFAST,
  supportsCodexFastMode,
  modelContextMaximum,
  clampModelContext,
} from './settings-contract.js'

const FAST_SERVICE_TIER = 'priority'
const ULTRAFAST_SERVICE_TIER = 'ultrafast'

export { createModels } from '@earendil-works/pi-ai'
export { createOpenAICodexProvider as openaiCodexProvider }

/** Apply the chosen detail to user and tool-result images after the provider assembles the request. */
function withInputImageDetail(payload, detail) {
  if (!Array.isArray(payload.input)) return payload
  let changed = false
  const input = payload.input.map(item => {
    const field = Array.isArray(item?.content)
      ? 'content'
      : ['function_call_output', 'custom_tool_call_output'].includes(item?.type) && Array.isArray(item.output)
        ? 'output'
        : undefined
    if (field === undefined) return item
    let itemChanged = false
    const parts = item[field].map(part => {
      if (part?.type !== 'input_image' || part.detail === detail) return part
      itemChanged = true
      return { ...part, detail }
    })
    if (!itemChanged) return item
    changed = true
    return { ...item, [field]: parts }
  })
  return changed ? { ...payload, input } : payload
}

// DSH's experimental Auto review sends its fixed policy as the system prompt.
const DSH_REVIEW_POLICY_PREFIX = 'REVIEW_POLICY\nYou are the final authorization reviewer'
export const REVIEW_MODEL_SESSION = 'session'
export const REVIEW_MODEL_OFFICIAL = 'official'

function systemText(context) {
  if (typeof context?.systemPrompt === 'string') return context.systemPrompt
  const first = Array.isArray(context?.messages) ? context.messages[0] : undefined
  if (first?.role !== 'system') return ''
  return typeof first.content === 'string'
    ? first.content
    : Array.isArray(first.content) ? first.content.map(part => part?.text ?? '').join('') : ''
}

/** Whether this request is DSH Auto review judging one pending tool call. */
export function isDshAutoReview(context) {
  return systemText(context).startsWith(DSH_REVIEW_POLICY_PREFIX)
}

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
export function openaiCodexSubscriptionProvider({
  resolveSpeedMode = () => undefined,
  resolveOutputVerbosity = () => OUTPUT_VERBOSITY_DEFAULT,
  resolveInputImageDetail = () => undefined,
  resolveContextMode = () => undefined,
  resolveCustomContextWindow = () => undefined,
  resolveReviewModel = () => REVIEW_MODEL_SESSION,
  catalog,
  connection,
  compaction,
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
  const modelMetadata = model => catalog?.metadata(model?.id)
  const supportsVerbosity = model => modelMetadata(model)?.supportVerbosity ?? model?.id !== 'gpt-5.3-codex-spark'
  const withPreferences = (model, options = {}) => {
    const metadata = modelMetadata(model)
    const requestedVerbosity = resolveOutputVerbosity()
    const textVerbosity = supportsVerbosity(model)
      ? requestedVerbosity === OUTPUT_VERBOSITY_DEFAULT
        ? metadata?.defaultVerbosity ?? 'medium'
        : requestedVerbosity
      : undefined
    // A tier is sent only when the account catalog advertises it for this model;
    // otherwise the request stays on the standard tier.
    const speedMode = resolveSpeedMode()
    const serviceTier = speedMode === SPEED_MODE_ULTRAFAST && metadata?.supportsUltrafast === true
      ? ULTRAFAST_SERVICE_TIER
      : speedMode === SPEED_MODE_FAST && (metadata?.supportsFast ?? supportsCodexFastMode(model?.id))
        ? FAST_SERVICE_TIER
        : undefined
    const inputImageDetail = normalizeInputImageDetail(resolveInputImageDetail())
    // The ChatGPT Codex backend rejects `temperature` (DSH's auto-review sets it).
    const { temperature: _temperature, onPayload, ...rest } = options
    return {
      ...rest,
      ...(textVerbosity === undefined ? {} : { textVerbosity }),
      ...(serviceTier === undefined ? {} : { serviceTier }),
      async onPayload(payload, requestModel) {
        const preferred = {
          ...payload,
          ...(textVerbosity === undefined ? {} : { text: { ...(payload.text ?? {}), verbosity: textVerbosity } }),
          ...(serviceTier === undefined ? {} : { service_tier: serviceTier }),
        }
        const managed = compaction?.preparePayload(preferred, model?.contextWindow) ?? preferred
        const next = await onPayload?.(managed, requestModel)
        const detailed = inputImageDetail === 'auto'
          ? next ?? managed
          : withInputImageDetail(next ?? managed, inputImageDetail)
        const { temperature: _dropped, ...accepted } = detailed
        return {
          ...accepted,
          ...(textVerbosity === undefined ? {} : { text: { ...(detailed.text ?? {}), verbosity: textVerbosity } }),
          ...(serviceTier === undefined ? {} : { service_tier: serviceTier }),
        }
      },
    }
  }
  const getModels = () => (catalog?.getModels() ?? provider.getModels()).map(model => {
    const maximum = modelContextMaximum(model)
    const mode = resolveContextMode()
    if (model.id === 'gpt-5.3-codex-spark' || ![CONTEXT_MODE_EXTENDED, CONTEXT_MODE_CUSTOM].includes(mode)) return model
    if (mode === CONTEXT_MODE_EXTENDED) {
      // Prefer the explicit catalog maximum; known offline models keep audited presets.
      const contextWindow = maximum
      return { ...model, contextWindow }
    }
    const requested = clampModelContext(resolveCustomContextWindow(customContextModelKey(model.id)), maximum, model.contextWindow)
    return { ...model, contextWindow: requested }
  })
  const review = { requests: 0, routed: 0, sessionModel: 0 }
  // With the official reviewer chosen, a DSH Auto review call uses the model
  // Codex itself reviews approvals with, when this account's catalog lists it.
  const reviewRoute = (model, context) => {
    if (resolveReviewModel() !== REVIEW_MODEL_OFFICIAL || !isDshAutoReview(context)) return undefined
    review.requests += 1
    const route = catalog?.reviewModel?.(model?.id)
    if (route === undefined) review.sessionModel += 1
    else review.routed += 1
    return route
  }
  const withReview = (route, options = {}) => {
    const { temperature: _temperature, onPayload, ...rest } = options
    return {
      ...rest,
      async onPayload(payload, requestModel) {
        const next = await onPayload?.(payload, requestModel) ?? payload
        // The reviewer keeps DSH's prompt and answer contract; only the model and effort change.
        const { temperature: _dropped, service_tier: _tier, text: _text, ...accepted } = next
        return {
          ...accepted,
          model: route.id,
          ...(route.effort === undefined ? {} : { reasoning: { ...(accepted.reasoning ?? {}), effort: route.effort } }),
        }
      },
    }
  }
  const networkIterable = (factory, options, direct = false) => {
    let iterator
    let prepared
    const step = async (method, value) => {
      // Review calls are one-shot: no WebSocket continuation or cloud compaction.
      const request = await (prepared ??= (direct ? undefined : connection?.prepare(options)) ?? Promise.resolve({ options }))
      const result = await runNetwork('model', () => {
        iterator ??= factory(direct ? request.options : compaction?.requestOptions(request.options) ?? request.options)[Symbol.asyncIterator]()
        return iterator[method]?.(value) ?? (method === 'throw' ? Promise.reject(value) : Promise.resolve({ done: true, value }))
      }, direct ? request.network : compaction?.networkOptions(request.network) ?? request.network)
      return result.done ? result : { ...result, value: normalizeTransportEvent(result.value, request.options?.signal) }
    }
    return {
      [Symbol.asyncIterator]() { return this },
      next: value => step('next', value),
      return: value => iterator ? step('return', value) : Promise.resolve({ done: true, value }),
      throw: error => iterator ? step('throw', error) : Promise.reject(error),
    }
  }
  return Object.freeze({
    ...provider,
    auth: Object.freeze({ ...provider.auth, apiKey: requestToken }),
    getModels,
    stream: (model, context, options) => {
      const route = reviewRoute(model, context)
      return route === undefined
        ? networkIterable(prepared => provider.stream(model, context, prepared), withPreferences(model, options))
        : networkIterable(prepared => provider.stream(model, context, prepared), withReview(route, options), true)
    },
    streamSimple: (model, context, options) => {
      const route = reviewRoute(model, context)
      return route === undefined
        ? networkIterable(prepared => provider.streamSimple(model, context, prepared), withPreferences(model, options))
        : networkIterable(prepared => provider.streamSimple(model, context, prepared), withReview(route, options), true)
    },
    reviewCounters: () => ({ ...review }),
  })
}

export const PI_AI_RUNTIME_VERSIONS = Object.freeze(['0.82.1', '0.85.1', '0.87.1'])
