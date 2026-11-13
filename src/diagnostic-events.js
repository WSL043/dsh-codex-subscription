import { MODEL_OUTCOMES, safeAttempt } from './model-attempt.js'

const areas = new Set(['login', 'oauth', 'model', 'catalog', 'quota', 'quota-reset', 'search', 'image', 'voice', 'remote', 'connectors', 'predictions'])
export const isNetworkDiagnosticArea = area => areas.has(area)
export const NETWORK_HISTORY_LIMIT = 32
export const NETWORK_FAILURE_LIMIT = areas.size
const codes = new Set(['timeout', 'dns', 'tls', 'connection', 'network', 'http-error'])
const routes = new Set(['host', 'direct', 'environment', 'system', 'bypass', 'proxy', 'model-proxy', 'unknown'])
const elapsedBuckets = new Set(['under-1s', '1-5s', '5-15s', 'over-15s'])

export const safeNetworkTiming = ({ route, elapsed }) => ({
  ...(routes.has(route) ? { route } : {}),
  ...(elapsedBuckets.has(elapsed) ? { elapsed } : {}),
})

/** Process-local bounded evidence. No bodies, URLs, exception strings or identities. */
export function createDiagnosticEvents({ limit = NETWORK_HISTORY_LIMIT, now = Date.now } = {}) {
  const events = []
  const lastFailure = new Map()
  const capacity = Math.max(1, Math.min(128, Number.isInteger(limit) ? limit : NETWORK_HISTORY_LIMIT))
  let dropped = 0, sequence = 0
  return {
    record(area, value) {
      if (!isNetworkDiagnosticArea(area) || !MODEL_OUTCOMES.has(value?.status)) return
      events.push({ sequence: ++sequence, area, status: value.status, observedAt: now(), ...safeAttempt(value), ...safeNetworkTiming(value),
        ...(codes.has(value.code) ? { code: value.code } : {}),
        ...(Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599 ? { httpStatus: value.httpStatus } : {}),
      })
      if (value.status === 'failed') {
        const previous = lastFailure.get(area)
        if (previous && previous.sequence < events[0].sequence) dropped++
        lastFailure.set(area, events.at(-1))
      }
      if (events.length > capacity) {
        const oldest = events.shift()
        if (lastFailure.get(oldest.area) !== oldest) dropped++
      }
    },
    snapshot() {
      const oldest = events[0]?.sequence ?? Infinity
      const retained = [...lastFailure.values()].filter(event => event.sequence < oldest)
      return { scope: 'plugin-process', capacity, dropped,
        events: [...retained, ...events].sort((a, b) => a.sequence - b.sequence).map(value => ({ ...value })) }
    },
  }
}
