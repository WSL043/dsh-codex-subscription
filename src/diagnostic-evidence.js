export const EVIDENCE_WINDOW_MS = 15 * 60_000
const areas = { catalog: 'models', quota: 'quota', search: 'search', image: 'images', model: 'transport', login: 'account', 'quota-reset': 'quota' }

// Shared projection: never retain operation inputs, responses, or account data.
export function diagnosticEvidence({ operations, history }, now) {
  return [
    ...(operations?.events ?? []).map(e => ({ capability: e.capability, action: e.action, source: e.source, status: e.status, observedAt: e.observedAt })),
    ...(history?.events ?? []).map(e => ({ capability: areas[e.area], action: e.area, source: 'network', status: e.status === 'ok' ? 'completed' : 'failed', observedAt: e.observedAt })),
  ].filter(e => Number.isSafeInteger(e.observedAt) && now >= e.observedAt && now - e.observedAt <= EVIDENCE_WINDOW_MS)
    .sort((a, b) => a.observedAt - b.observedAt)
}

// Cancellation is not recovery. Only a later success of the same observed
// operation supersedes its failure; another action cannot clear it.
export function unresolvedFailures(events) {
  const failed = new Map()
  for (const event of events) {
    const key = `${event.source}:${event.action}`
    if (event.status === 'failed') failed.set(key, event)
    else if (event.status === 'completed') failed.delete(key)
  }
  return [...failed.values()]
}
