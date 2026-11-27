import { randomUUID } from 'node:crypto'
import { safeFetchFailure, WEBSOCKET_FAILURE_CODES } from './transport-failure.js'

const transports = new Set(['sse', 'websocket'])
const choices = new Set(['sse', 'websocket', 'websocket-cached', 'auto', 'unknown'])
const routes = new Set(['host', 'direct', 'environment', 'system', 'bypass', 'proxy', 'model-proxy', 'unknown'])
const phases = new Set(['prepare', 'request', 'payload', 'stream'])
const fetchPaths = new Set(['host-fetch', 'dedicated-proxy'])
const elapsedBuckets = new Set(['under-1s', '1-5s', '5-15s', 'over-15s'])
const milestones = ['pre-connect', 'connected', 'request-sent', 'headers', 'first-event', 'text', 'tool-args', 'tool-complete']
const selectionReasons = new Set(['configured-sse', 'forced-sse', 'no-session', 'capacity', 'websocket-preferred', 'probe-busy', 'ws-cooldown', 'ws-probe'])
const counters = ['textDeltaCount', 'reasoningDeltaCount', 'toolCallsStarted', 'toolCallsArgsComplete', 'msToHeaders', 'msToFirstEvent', 'msSinceLastEvent']
const terminalStates = new Set(['done', 'error', 'user-abort', 'network', 'timeout'])
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
    ...(milestones.includes(value.phase) ? { phase: value.phase } : {}),
    ...(selectionReasons.has(value.selectionReason) ? { selectionReason: value.selectionReason } : {}),
    ...(WEBSOCKET_FAILURE_CODES.has(value.websocketFailure) ? { websocketFailure: value.websocketFailure } : {}),
    ...(['before-first-event', 'after-first-event'].includes(value.websocketFailurePhase) ? { websocketFailurePhase: value.websocketFailurePhase } : {}),
    ...(Number.isInteger(value.websocketCloseCode) && value.websocketCloseCode >= 1000 && value.websocketCloseCode <= 4999 ? { websocketCloseCode: value.websocketCloseCode } : {}),
    ...(Number.isInteger(value.websocketHttpStatus) && value.websocketHttpStatus >= 100 && value.websocketHttpStatus <= 599 ? { websocketHttpStatus: value.websocketHttpStatus } : {}),
    ...(terminalStates.has(value.terminal) ? { terminal: value.terminal } : {}),
    ...(typeof value.oversizeRejected === 'boolean' ? { oversizeRejected: value.oversizeRejected } : {}),
    ...(Number.isSafeInteger(value.requestBytesBucket) && value.requestBytesBucket > 0 && value.requestBytesBucket <= 2 ** 31
      && Number.isInteger(Math.log2(value.requestBytesBucket)) ? { requestBytesBucket: value.requestBytesBucket } : {}),
    ...Object.fromEntries(counters.filter(key => Number.isSafeInteger(value[key]) && value[key] >= 0).map(key => [key, value[key]])),
    ...(typeof value.model === 'string' && /^gpt-[a-z0-9][a-z0-9.-]{0,63}$/u.test(value.model) ? { model: value.model } : {}),
    ...(fetchPaths.has(value.fetchPath) ? { fetchPath: value.fetchPath } : {}),
    ...(value.requestCompression === 'zstd-decoded' ? { requestCompression: value.requestCompression } : {}),
    ...(value.failure === 'context-overflow' ? { failure: value.failure } : {}),
    ...(Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599 ? { httpStatus: value.httpStatus } : {}),
    ...(typeof value.cloudCompactionRequested === 'boolean' ? { cloudCompactionRequested: value.cloudCompactionRequested } : {}),
    ...(typeof value.checkpointInPayload === 'boolean' ? { checkpointInPayload: value.checkpointInPayload } : {}),
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
  const data = { attemptId: randomUUID(), route: 'unknown', transports: [], phase: 'pre-connect',
    headersReceived: false, eventDelivered: false, contentDelivered: false }
  let lastEventAt
  const advance = phase => { if (milestones.indexOf(phase) > milestones.indexOf(data.phase)) data.phase = phase }
  const elapsed = from => Math.max(0, Math.round(now() - from))
  const count = key => { data[key] = (data[key] ?? 0) + 1 }
  let finished = false
  return {
    configure(value) { if (!finished) Object.assign(data, safeAttempt(value)) },
    route(value) { if (!finished && routes.has(value)) data.route = value },
    transport(value) {
      if (!finished && transports.has(value) && data.transports.at(-1) !== value && data.transports.length < 8) data.transports.push(value)
    },
    connected() { if (!finished) advance('connected') },
    sent() { if (!finished) advance('request-sent') },
    response(status) {
      if (finished) return
      data.headersReceived = true
      data.msToHeaders ??= elapsed(started)
      advance('headers')
      if (Number.isInteger(status)) data.httpStatus = status
    },
    fetchFailure(error) { if (!finished) data.networkFailure = safeFetchFailure(error) },
    event(event) {
      if (finished || !event || ['start', 'error', 'done'].includes(event.type)) return
      data.eventDelivered = true
      data.msToFirstEvent ??= elapsed(started)
      lastEventAt = now()
      advance('first-event')
      switch (event.type) {
        case 'text_delta': count('textDeltaCount'); advance('text'); data.contentDelivered = true; break
        case 'text_end': advance('text'); data.contentDelivered = true; break
        case 'thinking_delta': count('reasoningDeltaCount'); break
        case 'toolcall_start': count('toolCallsStarted'); advance('tool-args'); break
        case 'toolcall_delta': advance('tool-args'); break
        case 'toolcall_end': count('toolCallsArgsComplete'); advance('tool-complete'); data.contentDelivered = true; break
      }
    },
    finish(status, stage) {
      if (finished || !MODEL_OUTCOMES.has(status)) return
      finished = true
      data.terminal ??= status === 'ok' ? 'done' : status === 'cancelled' || status === 'abandoned' ? 'user-abort'
        : data.networkFailure ? 'network' : 'error'
      if (lastEventAt !== undefined) data.msSinceLastEvent = elapsed(lastEventAt)
      const duration = elapsed(started)
      Object.assign(data, { status, stage, elapsed: duration < 1000 ? 'under-1s' : duration < 5000 ? '1-5s' : duration < 15000 ? '5-15s' : 'over-15s' })
      try { publish({ ...data, transports: [...data.transports] }) } catch { /* evidence observers cannot replace a model result or strand its lease */ }
    },
    snapshot: () => ({ ...data, transports: [...data.transports] }),
  }
}
