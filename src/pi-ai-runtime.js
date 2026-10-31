// Keep every dependency on pi-ai's Codex-specific public surface in one place.
// The exact peer version makes a DSH update fail visibly until this seam is
// re-audited instead of silently changing authentication or cache semantics.
import { diagnosticLog } from './diagnostic-log.js'
import { redactRequest } from './failure-capture.js'
import { hoistLeadingSystem, runtimeVersions, understandsSystemMessages } from './pi-ai-compat.js'
import { openaiCodexProvider as createOpenAICodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { normalizeTransportEvent, safeFetchFailure } from './transport-failure.js'
import { createModelRetryBridge } from './model-retry-hint.js'
import { authFailureMessage } from './http-failure.js'
import { createModelAttempt } from './model-attempt.js'
import { effectiveContextWindow } from './context-budget.js'
import { createModelStreamHealth } from './model-stream-health.js'
import {
  CONTEXT_MODE_CUSTOM,
  CONTEXT_MODE_EXTENDED,
  customContextModelKey,
  normalizeInputImageDetail,
  normalizeReasoningSummary,
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
// pi-ai 1.1 lets a caller's user-agent replace its own; keep the Codex requests' established one.
export const withoutUserAgent = headers => headers && typeof headers === 'object'
  ? Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'user-agent'))
  : headers

// The summary level the person chose goes on the request's reasoning block; "none" asks for no summary at all.
function withReasoningSummary(payload, summary) {
  if (summary === 'auto' || payload?.reasoning === undefined || payload.reasoning === null) return payload
  const { summary: _previous, ...rest } = payload.reasoning
  return { ...payload, reasoning: summary === 'none' ? rest : { ...rest, summary } }
}

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
const REVIEW_RETRIES = 2
// Transient stream/transport drops only; never policy, auth or quota errors.
const TRANSIENT_REVIEW_FAILURE = /stream ended (?:before|without)|\b(?:network|connection|socket)\b|\bECONN[A-Z]+\b|other side closed|premature close|\bterminated\b|WebSocket closed (?:1006|1011|1012|1013)/iu
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
  resolveReasoningSummary = () => undefined,
  resolveContextMode = () => undefined,
  resolveCustomContextWindow = () => undefined,
  resolveReviewModel = () => REVIEW_MODEL_SESSION,
  catalog,
  connection,
  compaction,
  reasoning,
  ultra,
  runNetwork = (_area, operation) => operation(),
  beginModelAttempt = createModelAttempt,
  providerFactory = createOpenAICodexProvider,
} = {}) {
  const provider = providerFactory()
  const streamHealth = createModelStreamHealth({ log: (level, message) => diagnosticLog.log(level, 'model-stream', message) })
  const retryBridge = createModelRetryBridge()
  const requestToken = Object.freeze({
    name: 'DSH-managed Codex OAuth request token',
    async resolve({ credential }) {
      const token = credential?.type === 'api_key' ? credential.key : undefined
      if (typeof token !== 'string' || token.length === 0) return undefined
      return { auth: { apiKey: token }, source: 'DSH-managed OAuth request' }
    },
  })
  const modelMetadata = model => catalog?.metadata?.(model?.id)
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
    const reasoningSummary = normalizeReasoningSummary(resolveReasoningSummary())
    // The ChatGPT Codex backend rejects `temperature` (DSH's auto-review sets it).
    const { temperature: _temperature, onPayload, ...rest } = options
    return {
      ...rest,
      ...(rest.headers === undefined ? {} : { headers: withoutUserAgent(rest.headers) }),
      ...(textVerbosity === undefined ? {} : { textVerbosity }),
      ...(serviceTier === undefined ? {} : { serviceTier }),
      async onPayload(payload, requestModel) {
        const preferred = {
          ...payload,
          ...(textVerbosity === undefined ? {} : { text: { ...(payload.text ?? {}), verbosity: textVerbosity } }),
          ...(serviceTier === undefined ? {} : { service_tier: serviceTier }),
        }
        const managed = compaction?.preparePayload(preferred, model?.contextWindow, options.maxTokens) ?? preferred
        const next = await onPayload?.(managed, requestModel)
        const detailed = inputImageDetail === 'auto'
          ? next ?? managed
          : withInputImageDetail(next ?? managed, inputImageDetail)
        const { temperature: _dropped, ...accepted } = withReasoningSummary(detailed, reasoningSummary)
        const finalPayload = {
          ...accepted,
          ...(textVerbosity === undefined ? {} : { text: { ...(detailed.text ?? {}), verbosity: textVerbosity } }),
          ...(serviceTier === undefined ? {} : { service_tier: serviceTier }),
        }
        const reasoned = reasoning?.preparePayload(finalPayload, requestModel) ?? finalPayload
        return ultra?.preparePayload(reasoned) ?? reasoned
      },
    }
  }
  const getModels = () => (catalog?.getModels() ?? provider.getModels()).map(model => {
    const maximum = modelContextMaximum(model)
    const mode = resolveContextMode()
    let window = model.contextWindow
    if (model.id !== 'gpt-5.3-codex-spark') {
      if (mode === CONTEXT_MODE_EXTENDED) window = maximum
      else if (mode === CONTEXT_MODE_CUSTOM) window = clampModelContext(resolveCustomContextWindow(customContextModelKey(model.id)), maximum, window)
    }
    // Do not add an undefined capacity to provider-native descriptors: older
    // runtimes distinguish an omitted field from an explicitly invalid one.
    return window === undefined ? model : { ...model, contextWindow: effectiveContextWindow(window, modelMetadata(model)?.effectiveContextWindowPercent) }
  })
  const review = { requests: 0, routed: 0, sessionModel: 0, retries: 0 }
  // pi-ai turns an exception raised while it builds or sends a request into an
  // error event that carries only the message. Keep how many requests failed and
  // how far the last one got, so a support report can say where the failure sits.
  const streamFailure = { count: 0, stage: undefined, frame: undefined, request: undefined, adapter: undefined }
  const noteAdapterFailure = (kind, adapterOptions, failure) => {
    try {
      streamFailure.adapter = {
        kind,
        ...(typeof failure?.code === 'string' ? { code: failure.code.slice(0, 40) } : {}),
        message: String(failure?.message ?? '').slice(0, 160),
        request: redactRequest(adapterOptions),
      }
    } catch { streamFailure.adapter = undefined }
  }
  const noteStreamFailure = (stage, error, source, networkFailure, attemptId) => {
    streamFailure.count += 1
    diagnosticLog.error('model', `request failed while ${stage === 'prepare' ? 'preparing' : stage === 'request' ? 'sending' : stage === 'payload' ? 'building the payload' : 'streaming'}${networkFailure ? ': ' + networkFailure : ''}`, error)
    streamFailure.stage = stage
    streamFailure.attemptId = attemptId
    // The request is deterministic input to pi-ai: keep a text-free copy so the failure can be replayed.
    try { streamFailure.request = source === undefined ? undefined : redactRequest(source) } catch { streamFailure.request = undefined }
    const frame = typeof error?.stack === 'string' ? /([\w.@-]+[\\/][\w.-]+\.[cm]?[jt]sx?):(\d+):(\d+)/u.exec(error.stack.split('\n').slice(1).join('\n')) : null
    streamFailure.frame = frame ? `${frame[1].replaceAll('\\', '/')}:${frame[2]}:${frame[3]}` : undefined
  }
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
      ...(rest.headers === undefined ? {} : { headers: withoutUserAgent(rest.headers) }),
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
  // DSH Auto review asks once and blocks the tool on any failure. A review
  // that drops before producing its answer is replayed, buffered so a failed
  // attempt never leaks partial output to the reviewer's parser.
  const reviewIterable = create => {
    let replay
    const run = async function* () {
      for (let attempt = 0; ; attempt += 1) {
        const events = []
        let failure
        let thrown
        try {
          for await (const event of create()) {
            events.push(event)
            if (event?.type === 'error') failure = event.error?.errorMessage
          }
        } catch (error) {
          thrown = error
          failure = error?.message
        }
        if (failure !== undefined && attempt < REVIEW_RETRIES && TRANSIENT_REVIEW_FAILURE.test(failure)) {
          review.retries += 1
          continue
        }
        if (thrown !== undefined && events.length === 0) throw thrown
        yield* events
        if (thrown !== undefined) throw thrown
        return
      }
    }
    return { [Symbol.asyncIterator]: () => (replay ??= run()) }
  }
  const networkIterable = (factory, options, direct = false, source) => {
    const attempt = beginModelAttempt()
    const cancellation = new AbortController()
    const signal = options?.signal ? AbortSignal.any([options.signal, cancellation.signal]) : cancellation.signal
    let iterator, producer, prepared, request, health, effectiveSource = source, stopped = false
    let stage = 'prepare', networkFailure
    const retryHint = direct ? undefined : retryBridge.current()
    const cancelled = () => signal.aborted && signal.reason?.name !== 'TimeoutError'
    const settle = (status, error, healthError = error) => {
      if (attempt.snapshot().status) return
      health?.finish(status === 'ok' ? 'completed' : status === 'abandoned' ? 'cancelled' : status, healthError)
      if (status === 'failed') noteStreamFailure(stage, error, effectiveSource, networkFailure, attempt.snapshot().attemptId)
      attempt.finish(status, stage)
    }
    const finish = () => {
      const { status, transports } = attempt.snapshot()
      request?.finish?.({ status, transports })
    }
    const initialize = async () => {
      const overrides = direct ? undefined : compaction?.networkOptions(undefined)
      request = await (direct ? undefined : connection?.prepare({ ...options, signal }, { model: source?.model, allowWebSocket: overrides?.websocket !== false })) ?? { options }
      const next = { ...(direct ? { ...request.options, transport: 'sse' } : compaction?.requestOptions(request.options) ?? request.options), signal }
      attempt.configure({ preference: request.diagnostic?.preference ?? request.options?.transport ?? 'auto', requestedTransport: next.transport ?? 'auto' })
      effectiveSource = { ...source, options: next }
      health = streamHealth.begin({ sessionId: direct ? undefined : options?.sessionId, configured: request.options?.transport, selected: next.transport })
      const scopedNetwork = direct ? request.network : overrides ?? request.network
      stage = 'request'
      return { next, network: {
        ...scopedNetwork, modelAttempt: true,
        onRoute(route) { attempt.route(route); scopedNetwork?.onRoute?.(route) },
        onTransport(transport) { attempt.transport(transport); scopedNetwork?.onTransport?.(transport) },
        onFetchFailure(error) { networkFailure = safeFetchFailure(error); attempt.fetchFailure(error); scopedNetwork?.onFetchFailure?.(error) },
        async transformResponse(response, target) {
          const value = await (scopedNetwork?.transformResponse?.(response, target) ?? response)
          if (retryHint) retryHint.onAccessFailure(value.ok ? undefined : await authFailureMessage(value))
          return value
        },
      } }
    }
    const step = async (method, value) => {
      if (stopped) return { done: true, value: undefined }
      try {
        const { next, network } = await (prepared ??= initialize())
        signal.throwIfAborted()
        const result = await runNetwork('model', () => {
          if (!iterator) {
            producer = factory({ ...next,
              async onResponse(info, requestModel) { health.response(info); attempt.response(); retryHint?.onResponse(info); return next.onResponse?.(info, requestModel) },
              onProviderStreamEvent(event) { health.providerEvent(); return next.onProviderStreamEvent?.(event) },
              async onPayload(payload, requestModel) {
                stage = 'payload'; signal.throwIfAborted()
                const body = await next.onPayload?.(payload, requestModel)
                signal.throwIfAborted(); stage = 'request'; return body
              },
            })
            iterator = producer[Symbol.asyncIterator]()
            // The producer settles even if the caller stops consuming its iterator.
            producer.result().then(message => {
              const status = cancelled() ? (stopped ? 'abandoned' : 'cancelled') : ['error', 'aborted'].includes(message?.stopReason) ? 'failed' : 'ok'
              settle(status, undefined, message)
              finish()
            }, error => { settle(cancelled() ? 'cancelled' : 'failed', error); finish() })
          }
          return iterator[method]?.(value) ?? (method === 'throw' ? Promise.reject(value) : Promise.resolve({ done: true, value }))
        }, network)
        if (!result.done) {
          health?.observe(result.value)
          attempt.event(result.value)
          retryHint?.observe(result.value, signal)
          if (result.value?.type === 'error') settle(cancelled() ? 'cancelled' : 'failed', undefined, result.value.error)
          else if (result.value?.type === 'done') settle('ok')
          else if (stage === 'payload' || stage === 'request') stage = 'stream'
        } else settle(cancelled() ? 'cancelled' : 'abandoned')
        return result.done ? result : { ...result, value: normalizeTransportEvent(result.value, signal) }
      } catch (error) {
        settle(stopped ? 'abandoned' : cancelled() || error?.name === 'AbortError' ? 'cancelled' : 'failed', error)
        if (!producer) finish()
        throw error
      }
    }
    return {
      [Symbol.asyncIterator]() { return this },
      next: value => step('next', value),
      async return(value) {
        const status = options?.signal?.aborted ? options.signal.reason?.name === 'TimeoutError' ? 'failed' : 'cancelled' : 'abandoned'
        stopped = true; cancellation.abort(); settle(status)
        if (prepared) await prepared.catch(() => {})
        if (!producer) finish()
        return iterator?.return?.(value) ?? { done: true, value }
      },
      throw: error => step('throw', error),
    }
  }
  const routed = (method, model, transcript, options) => {
    // A pi-ai that predates system messages in the transcript gets them as systemPrompt and tools.
    const context = understandsSystemMessages(runtimeVersions().piAi) ? transcript : hoistLeadingSystem(transcript)
    const route = reviewRoute(model, context)
    const source = { method, model, context, options }
    const create = () => route === undefined
      ? networkIterable(prepared => provider[method](model, context, prepared), withPreferences(model, options), isDshAutoReview(context), source)
      : networkIterable(prepared => provider[method](model, context, prepared), withReview(route, options), true, source)
    return isDshAutoReview(context) ? reviewIterable(create) : create()
  }
  return Object.freeze({
    ...provider,
    auth: Object.freeze({ ...provider.auth, apiKey: requestToken }),
    getModels,
    stream: (model, context, options) => routed('stream', model, context, options),
    streamSimple: (model, context, options) => routed('streamSimple', model, context, options),
    reviewCounters: () => ({ ...review }),
    streamFailure: () => ({ ...streamFailure }),
    streamHealth: streamHealth.snapshot,
    noteAdapterFailure,
    wrapRetryAdapter: adapter => retryBridge.wrapAdapter(adapter),
  })
}

export const PI_AI_RUNTIME_VERSIONS = Object.freeze(['0.85.1', '0.87.1', '1.1.0', '1.2.0', '1.3.0', '1.4.0'])
