import { AsyncLocalStorage } from 'node:async_hooks'
import * as dshLlm from '@deepseek-ai/dsh-llm'

/** Keep the provider's wait as a fact; only DSH decides whether and when to retry. */
export function providerRetryAfterMs(headers, at = Date.now()) {
  const read = key => typeof headers?.get === 'function' ? headers.get(key) : headers?.[key]
  const millis = read('retry-after-ms')
  if (millis !== undefined && millis !== null) {
    const value = Number(millis)
    if (Number.isFinite(value)) return value > 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : undefined
  }
  const raw = read('retry-after')
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const seconds = Number(raw), value = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - at
  return Number.isFinite(value) && value > 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : undefined
}

export function createModelRetryHint({ now = Date.now, ErrorClass = dshLlm.LlmError } = {}) {
  let response, outputStarted = false
  return {
    onResponse(info) {
      response = [429, 503].includes(info?.status)
        ? { status: info.status, delay: providerRetryAfterMs(info.headers, now()) } : undefined
    },
    observe(event) {
      if (event && !['start', 'done', 'error'].includes(event.type)) outputStarted = true
    },
    failure(original, signal) {
      if (signal?.aborted || outputStarted || !response || !original || typeof original.message !== 'string' || ['ABORTED', 'QUOTA', 'ACCOUNT_QUOTA', 'QUOTA_EXCEEDED'].includes(original.code) || (typeof dshLlm.isQuotaExceededError === 'function' && dshLlm.isQuotaExceededError(original.message))) return original
      // Codex pi-ai collapses JSON 429 quota and rate-limit codes into the same
      // usage-limit text. Do not guess that such a refusal is transient.
      if (/You have hit your ChatGPT usage limit/iu.test(original.message) || response.status === 429 && original.code !== 'RATE_LIMIT') return original
      let error
      try { error = new ErrorClass(original.message, response.status === 429 ? 'RATE_LIMIT' : 'SERVER', {
        status: response.status,
        ...(response.delay === undefined ? {} : { providerRetryAfterMs: response.delay }),
      }) } catch { return original }
      // Older SDKs may accept options but not preserve their serializable facts.
      return error.failure?.status === response.status && (response.delay === undefined || error.failure.providerRetryAfterMs === response.delay)
        ? { ...original, ...error.failure } : original
    },
  }
}

/** One request-local scope spanning the provider and DSH adapter; no timers or replay. */
export function createModelRetryBridge() {
  const scope = new AsyncLocalStorage()
  const wrapStream = (factory, options) => (async function* () {
    const hint = createModelRetryHint()
    const iterator = scope.run(hint, () => factory(options)[Symbol.asyncIterator]())
    try {
      while (true) {
        const result = await scope.run(hint, () => iterator.next())
        if (result.done) return
        const event = result.value
        if (event.type === 'finish' && event.reason?.kind === 'error') {
          yield { ...event, reason: { ...event.reason, failure: hint.failure(event.reason.failure, options.signal) } }
        } else yield event
      }
    } finally { await scope.run(hint, () => iterator.return?.()) }
  })()
  return {
    current: () => scope.getStore(),
    wrapAdapter(adapter) {
      return new Proxy(adapter, { get(target, property) {
        if (property === 'stream') return options => wrapStream(o => target.stream(o), options)
        if (property === 'prepareCall' && typeof target.prepareCall === 'function') return async (...args) => {
          const call = await target.prepareCall(...args)
          return { ...call, stream: options => wrapStream(o => call.stream(o), options) }
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      } })
    },
  }
}
