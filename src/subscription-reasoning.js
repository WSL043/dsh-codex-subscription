import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { isDshAutoReview } from './pi-ai-runtime.js'
import { REASONING_STATE_KEY, isReasoningState, reasoningDigest, reasoningHash, rewriteReasoning, supportsReasoningUpdates } from './reasoning-updates.js'

const MAX_SESSIONS = 256
const ownMessage = message => message.role === 'assistant' || message.source?.kind === 'model'
/** Internal request scope, like the compaction bridge. No global patch or parallel session store. */
export function createReasoningBridge({ enabled = () => false, cloud = () => false, unlimited = () => false, supportsModel = () => false, resolveSession, accountScope, diagnostic = () => {}, lockDiagnostic = () => {}, now = Date.now } = {}) {
  const scope = new AsyncLocalStorage(), fresh = new Set(), pending = new Map(), busy = new Map()
  const startedAt = now(), diagnosticSalt = randomUUID()
  let requestId = 0
  const traceLock = event => { try { lockDiagnostic(event) } catch { /* Diagnostics cannot disturb model calls. */ } }
  const report = reason => { try { diagnostic(reason) } catch { /* Diagnostics cannot disturb model calls. */ } }
  const keyOf = id => typeof id === 'string' && id.length ? reasoningHash(id) : undefined
  // A nested, ineligible request must not inherit an outer request's payload state.
  const unscoped = (factory, options) => {
    const iterator = scope.run(undefined, () => factory(options)[Symbol.asyncIterator]())
    return {
      [Symbol.asyncIterator]() { return this },
      next: (...args) => scope.run(undefined, () => iterator.next(...args)),
      return: (...args) => scope.run(undefined, () => iterator.return?.(...args) ?? Promise.resolve({ done: true, value: args[0] })),
      throw: (...args) => scope.run(undefined, () => iterator.throw?.(...args) ?? Promise.reject(args[0])),
    }
  }
  const wrapStream = (factory, options, path) => (async function* () {
    // Auxiliary prompts share the session id, but do not own its conversation checkpoint.
    // A native compaction summary replays history but only its committed replacement
    // changes the conversation window. Do not let it read or write the live checkpoint.
    if (isDshAutoReview(options) || options.purpose === 'session-title' || options.purpose === 'compaction') {
      yield* unscoped(factory, options); return
    }
    const key = keyOf(options.sessionId)
    const optedIn = enabled() === true, automatic = cloud() === true, alwaysRetry = unlimited() === true
    if (!optedIn || automatic || alwaysRetry || options.provider !== 'openai-codex' || supportsModel(options.model) !== true || !key) {
      if (key) { fresh.delete(key); pending.delete(key) }
      if (optedIn) report(automatic ? 'cloud-compaction' : alwaysRetry ? 'unlimited-retries' : 'unsupported-request')
      yield* unscoped(factory, options); return
    }
    const requestInfo = { id: ++requestId, path, purpose: options.purpose === undefined ? 'conversation' : 'other' }
    const holder = busy.get(key)
    if (holder) {
      holder.session ??= reasoningHash(diagnosticSalt + ':' + key).slice(0, 12)
      traceLock({ event: 'conflict', session: holder.session, request: requestInfo, holder: holder.request, startedAt: holder.startedAt, heldMs: Math.max(0, now() - holder.startedAt) })
      throw new LlmError('Cache-preserving reasoning does not allow concurrent requests in the same session', 'UNSUPPORTED_OPTION')
    }
    if (!pending.has(key) && new Set([...pending.keys(), ...busy.keys()]).size >= MAX_SESSIONS) {
      fresh.delete(key); report('session-limit'); yield* unscoped(factory, options); return
    }
    const lock = { request: requestInfo, startedAt: now(), session: undefined }
    busy.set(key, lock)
    const born = fresh.delete(key)
    let iterator, request
    try {
      options.signal?.throwIfAborted()
      const account = await accountScope?.(options)
      if (!account) { report('unknown-account'); yield* unscoped(factory, options); return }
      const identity = reasoningHash(JSON.stringify([account, options.model]))
      const latest = options.messages.findLast(ownMessage)
      const saved = latest?.source?.provider === options.provider && latest.source.model === options.model
        ? latest.source.replayState?.response?.[REASONING_STATE_KEY] : undefined
      const previous = saved && saved.content === reasoningDigest(latest.content) && isReasoningState(saved.state) ? saved.state : undefined
      // DSH increments this durable surface fold only after a committed replacement
      // or message projection. Failed compaction leaves it unchanged; restore/fork
      // reconstructs it. Do not infer a new window from model-authored summary text.
      const session = resolveSession?.(options.sessionId)
      const generation = session?.surface?.contentGeneration
      const window = Number.isSafeInteger(generation) && generation > 0 ? reasoningHash(`dsh-surface:${generation}`) : undefined
      const replaced = previous && saved.window !== window
      const needsBaseline = !previous || replaced
      const nativeHistory = needsBaseline && session?.deriveMessages?.()
      const nativeDigest = nativeHistory && reasoningDigest(nativeHistory)
      const trustedHistory = nativeDigest !== undefined && nativeDigest === reasoningDigest(options.messages)
      const reset = trustedHistory && needsBaseline
      // The pending state covers transport failures/cancellation without a successful finish.
      const waiting = pending.get(key)
      request = {
        key, identity, window, previous: replaced ? undefined : previous,
        waiting: waiting?.state.scope === identity && waiting.window === window && (!latest || previous !== undefined) ? waiting.state : undefined,
        fresh: born && !latest || reset, blocks: [], candidate: undefined,
      }
      iterator = scope.run(request, () => factory(options)[Symbol.asyncIterator]())
      while (true) {
        const result = await scope.run(request, () => iterator.next())
        if (result.done) break
        let event = result.value
        if (event.type === 'block-end') request.blocks[event.index] = event.block
        if (event.type === 'finish' && request.candidate && event.replayState &&
          ['stop', 'tool-calls'].includes(event.reason?.kind) && !options.signal?.aborted) {
          const content = reasoningDigest(request.blocks.filter(Boolean))
          if (content) event = { ...event, replayState: { ...event.replayState, response: {
            ...event.replayState.response, [REASONING_STATE_KEY]: { state: request.candidate, content, ...(request.window === undefined ? {} : { window: request.window }) },
          } } }
        }
        yield event
      }
    } finally {
      let cleanup = 'closed'
      try { if (iterator) await scope.run(request, () => iterator.return?.()) }
      catch (error) { cleanup = 'failed'; throw error }
      finally {
        busy.delete(key)
        if (lock.session) traceLock({ event: 'release', session: lock.session, request: lock.request, heldMs: Math.max(0, now() - lock.startedAt), aborted: options.signal?.aborted === true, cleanup })
      }
    }
  })()
  return {
    // Creation metadata, not input length, proves an unseeded session was observed from birth.
    sessionCreated(session) {
      if (enabled() !== true || cloud() === true || unlimited() === true || session?.firstLiveSeq !== 0 || session.inheritedEventCount !== 0 ||
        !(session.header?.createdAt >= startedAt && session.header.createdAt <= now()) ||
        session.header?.isSeeded !== false || session.header?.parentSession !== undefined) return
      const key = keyOf(session.id)
      if (key && fresh.size < MAX_SESSIONS) fresh.add(key)
    },
    sessionDisposed(session) { const key = keyOf(session?.id); fresh.delete(key); pending.delete(key) },
    sessionEvent(session, event) {
      if (event?.type === 'compaction/end' && event.data?.error === undefined) {
        const key = keyOf(session?.id)
        fresh.delete(key); pending.delete(key)
      }
    },
    wrapAdapter(adapter) {
      return new Proxy(adapter, { get(target, property) {
        if (property === 'stream') return options => wrapStream(o => target.stream(o), options, 'stream')
        if (property === 'prepareCall') return async (...args) => {
          const call = await target.prepareCall(...args)
          return { ...call, stream: options => wrapStream(o => call.stream(o), options, 'prepared') }
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      } })
    },
    preparePayload(payload, model) {
      const request = scope.getStore()
      model = { ...model, supportsReasoningEffortUpdates: supportsModel(model?.id) === true }
      if (!request || !supportsReasoningUpdates(model)) return payload
      request.candidate = undefined
      const argumentsFor = previous => ({ model, scope: request.identity, previous, fresh: request.fresh })
      let result = request.waiting ? rewriteReasoning(payload, argumentsFor(request.waiting)) : undefined
      if (!result?.state && !result?.error) result = rewriteReasoning(payload, argumentsFor(request.previous))
      if (result.error) throw new LlmError(result.error, 'UNSUPPORTED_OPTION')
      report(result.reason)
      if (!result.state) return payload
      request.candidate = result.state
      request.waiting = result.state
      pending.set(request.key, { state: result.state, window: request.window })
      return result.payload
    },
    snapshot: () => ({ fresh: fresh.size, pending: pending.size, active: busy.size }),
  }
}
