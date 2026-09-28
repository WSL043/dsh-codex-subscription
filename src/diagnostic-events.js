const areas = new Set(['login', 'model', 'catalog', 'quota', 'quota-reset', 'search', 'image'])
const codes = new Set(['timeout', 'dns', 'tls', 'connection', 'network', 'http-error'])

/** Process-local bounded evidence. No bodies, URLs, exception strings or identities. */
export function createDiagnosticEvents({ limit = 32, now = Date.now } = {}) {
  const events = []
  const capacity = Math.max(1, Math.min(128, Number.isInteger(limit) ? limit : 32))
  let dropped = 0, sequence = 0
  return {
    record(area, value) {
      if (!areas.has(area) || !['ok', 'failed'].includes(value?.status)) return
      events.push({ sequence: ++sequence, area, status: value.status, observedAt: now(),
        ...(codes.has(value.code) ? { code: value.code } : {}),
        ...(Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599 ? { httpStatus: value.httpStatus } : {}),
      })
      if (events.length > capacity) { events.shift(); dropped++ }
    },
    snapshot: () => ({ scope: 'plugin-process', capacity, dropped, events: events.map(value => ({ ...value })) }),
  }
}
