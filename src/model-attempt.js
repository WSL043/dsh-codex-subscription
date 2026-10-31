import { randomUUID } from 'node:crypto'
import { safeFetchFailure } from './transport-failure.js'

const transports = new Set(['sse', 'websocket'])
const choices = new Set(['sse', 'websocket', 'websocket-cached', 'auto', 'unknown'])
const routes = new Set(['direct', 'environment', 'system', 'bypass', 'proxy', 'unknown'])
const phases = new Set(['prepare', 'request', 'payload', 'stream'])
const elapsedBuckets = new Set(['under-1s', '1-5s', '5-15s', 'over-15s'])
export const MODEL_OUTCOMES = new Set(['ok', 'failed', 'cancelled', 'abandoned'])

/** One bounded, text-free attempt, not one iterator.next() or HTTP header receipt. */
export function safeAttempt(value = {}) {
  const identified = typeof value.attemptId === 'string' && /^[a-f0-9-]{36}$/.test(value.attemptId)
  return {
    ...(identified && routes.has(value.route) ? { route: value.route } : {}),
    ...(identified && phases.has(value.stage) ? { stage: value.stage } : {}),
    ...(identified && elapsedBuckets.has(value.elapsed) ? { elapsed: value.elapsed } : {}),
    ...(typeof value.attemptId === 'string' && /^[a-f0-9-]{36}$/.test(value.attemptId) ? { attemptId: value.attemptId } : {}),
    ...(choices.has(value.preference) ? { preference: value.preference } : {}),
    ...(choices.has(value.requestedTransport) ? { requestedTransport: value.requestedTransport } : {}),
    ...(Array.isArray(value.transports) ? { transports: value.transports.filter(item => transports.has(item)).slice(0, 8) } : {}),
    ...(typeof value.headersReceived === 'boolean' ? { headersReceived: value.headersReceived } : {}),
    ...(typeof value.eventDelivered === 'boolean' ? { eventDelivered: value.eventDelivered } : {}),
    ...(typeof value.contentDelivered === 'boolean' ? { contentDelivered: value.contentDelivered } : {}),
    ...(typeof value.networkFailure === 'string' && value.networkFailure.length <= 256 && /^fetch failed(?: \[[A-Z_, ]+\])?$/.test(value.networkFailure)
      && safeFetchFailure({ errors: (value.networkFailure.match(/[A-Z][A-Z_]+/g) ?? []).map(code => ({ code })) }) === value.networkFailure ? { networkFailure: value.networkFailure } : {}),
  }
}

export function createModelAttempt({ now = Date.now, publish = () => {} } = {}) {
  const started = now()
  const data = { attemptId: randomUUID(), route: 'unknown', transports: [], headersReceived: false, eventDelivered: false, contentDelivered: false }
  let finished = false
  return {
    configure(value) { if (!finished) Object.assign(data, safeAttempt(value)) },
    route(value) { if (!finished && routes.has(value)) data.route = value },
    transport(value) {
      if (!finished && transports.has(value) && data.transports.at(-1) !== value && data.transports.length < 8) data.transports.push(value)
    },
    response() { if (!finished) data.headersReceived = true },
    fetchFailure(error) { if (!finished) data.networkFailure = safeFetchFailure(error) },
    event(event) {
      if (finished || !event || ['error', 'done'].includes(event.type)) return
      data.eventDelivered = true
      if (/_delta$|_end$/.test(event.type)) data.contentDelivered = true
    },
    finish(status, stage) {
      if (finished || !MODEL_OUTCOMES.has(status)) return
      finished = true
      const elapsed = Math.max(0, now() - started)
      Object.assign(data, { status, stage, elapsed: elapsed < 1000 ? 'under-1s' : elapsed < 5000 ? '1-5s' : elapsed < 15000 ? '5-15s' : 'over-15s' })
      try { publish({ ...data, transports: [...data.transports] }) } catch { /* evidence observers cannot replace a model result or strand its lease */ }
    },
    snapshot: () => ({ ...data, transports: [...data.transports] }),
  }
}
