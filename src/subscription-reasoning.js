import { AsyncLocalStorage } from 'node:async_hooks'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { isDshAutoReview } from './pi-ai-runtime.js'
import { REASONING_STATE_KEY, isReasoningState, reasoningDigest, reasoningHash, rewriteReasoning, supportsReasoningUpdates } from './reasoning-updates.js'

const MAX_SESSIONS = 256
const ownMessage = message => message.role === 'assistant' || message.source?.kind === 'model'
/** Internal request scope, like the compaction bridge. No global patch or parallel session store. */
export function createReasoningBridge({ enabled = () => false, cloud = () => false, unlimited = () => false, accountScope, diagnostic = () => {}, now = Date.now } = {}) {
  const scope = new AsyncLocalStorage(), fresh = new Set(), pending = new Map(), busy = new Set()
  const startedAt = now()
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
  const wrapStream = (factory, options) => (async function* () {
    // Review is a one-shot auxiliary call, possibly nested in the same session.
    if (isDshAutoReview(options)) { yield* unscoped(factory, options); return }
    const key = keyOf(options.sessionId)
    const optedIn = enabled() === true, automatic = cloud() === true, alwaysRetry = unlimited() === true
    if (!optedIn || automatic || alwaysRetry || options.provider !== 'openai-codex' || options.model !== 'gpt-6.1-sol' || !key) {
      if (key) { fresh.delete(key); pending.delete(key) }
      if (optedIn) report(automatic ? 'cloud-compaction' : alwaysRetry ? 'unlimited-retries' : 'unsupported-request')
      yield* unscoped(factory, options); return
    }
    if (busy.has(key)) throw new LlmError('Cache-preserving reasoning does not allow concurrent requests in the same session', 'UNSUPPORTED_OPTION')
    if (!pending.has(key) && new Set([...pending.keys(), ...busy]).size >= MAX_SESSIONS) {
      fresh.delete(key); report('session-limit'); yield* unscoped(factory, options); return
    }
    busy.add(key)
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
      // The pending state covers transport failures/cancellation without a successful finish.
      const waiting = pending.get(key)
      request = {
        key, identity, previous, waiting: waiting?.scope === identity && (!latest || previous !== undefined) ? waiting : undefined,
        fresh: born && !latest, blocks: [], candidate: undefined,
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
            ...event.replayState.response, [REASONING_STATE_KEY]: { state: request.candidate, content },
          } } }
        }
        yield event
      }
    } finally {
      try { if (iterator) await scope.run(request, () => iterator.return?.()) }
      finally { busy.delete(key) }
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
    wrapAdapter(adapter) {
      return new Proxy(adapter, { get(target, property) {
        if (property === 'stream') return options => wrapStream(o => target.stream(o), options)
        if (property === 'prepareCall') return async (...args) => {
          const call = await target.prepareCall(...args)
          return { ...call, stream: options => wrapStream(o => call.stream(o), options) }
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      } })
    },
    preparePayload(payload, model) {
      const request = scope.getStore()
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
      pending.set(request.key, result.state)
      return result.payload
    },
    snapshot: () => ({ fresh: fresh.size, pending: pending.size, active: busy.size }),
  }
}
