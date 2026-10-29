const transportOf = value => value?.startsWith('websocket') ? 'websocket' : value === 'sse' ? 'sse' : 'unknown'
const failureCode = error => {
  const text = String(error?.errorMessage ?? error?.message ?? '')
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ERR_STREAM_PREMATURE_CLOSE'].find(code => error?.code === code || text.includes(code))
    ?? (/timeout/i.test(text) ? 'TIMEOUT' : /WebSocket closed/i.test(text) ? 'WS_CLOSED' : 'OTHER')
}

/** Bounded request-level facts; no prompts, response bodies, credentials or public session ids. */
export function createModelStreamHealth({ now = Date.now, log = () => {} } = {}) {
  const recent = [], streaks = new Map()
  return {
    snapshot: () => recent.map(value => ({ ...value })),
    begin({ sessionId, configured, selected }) {
      const start = now(), configuredTransport = transportOf(configured), selectedTransport = transportOf(selected)
      let done = false, providerEvents = false, lastEvent, firstEvent, count = 0, output = false, httpStatus
      let effectiveTransport = 'unknown'
      const event = () => { const at = now(); firstEvent ??= at; lastEvent = at; count++ }
      return {
        response(info) { effectiveTransport = 'sse'; if (Number.isInteger(info?.status)) httpStatus = info.status },
        providerEvent() { providerEvents = true; event(); if (effectiveTransport === 'unknown' && selectedTransport === 'websocket') effectiveTransport = 'websocket' },
        observe(value) {
          if (value?.type?.endsWith('_delta')) output = true
          if (!providerEvents && !['start', 'error', 'done'].includes(value?.type)) {
            event()
            if (effectiveTransport === 'unknown' && selectedTransport === 'websocket') effectiveTransport = 'websocket'
          }
        },
        finish(status, error) {
          if (done) return
          done = true
          const end = now(), code = status === 'failed' ? failureCode(error) : undefined
          const previous = typeof sessionId === 'string' ? streaks.get(sessionId) : undefined
          const signature = `${effectiveTransport}:${code}`
          const consecutiveFailures = status === 'failed' && typeof sessionId === 'string'
            ? previous?.signature === signature ? Math.min(previous.count + 1, 1000) : 1 : 0
          if (typeof sessionId === 'string') {
            streaks.delete(sessionId)
            if (consecutiveFailures) streaks.set(sessionId, { signature, count: consecutiveFailures })
            if (streaks.size > 100) streaks.delete(streaks.keys().next().value)
          }
          const value = { status, configured: configuredTransport, selected: selectedTransport, effective: effectiveTransport,
            durationMs: Math.max(0, end - start), eventCount: count, eventSource: providerEvents ? 'provider' : 'adapter', outputStarted: output,
            ...(firstEvent === undefined ? {} : { firstEventMs: Math.max(0, firstEvent - start), lastEventAgoMs: Math.max(0, end - lastEvent) }),
            ...(httpStatus === undefined ? {} : { httpStatus }), ...(code === undefined ? {} : { code, consecutiveFailures }) }
          recent.push(value); if (recent.length > 20) recent.shift()
          if (status !== 'cancelled') log(status === 'failed' ? 'warn' : 'info', `stream ${status}: configured=${configuredTransport} selected=${selectedTransport} effective=${effectiveTransport} duration_ms=${value.durationMs} first_event_ms=${value.firstEventMs ?? 'none'} last_event_ago_ms=${value.lastEventAgoMs ?? 'none'} events=${count}${code ? ` failure=${code} consecutive=${consecutiveFailures}` : ''}`)
        },
      }
    },
  }
}

export function safeStreamHealth(value) {
  if (!Array.isArray(value)) return []
  return value.slice(-20).filter(item => ['completed', 'failed', 'cancelled'].includes(item?.status)).map(item => ({
    status: item.status,
    ...Object.fromEntries(['configured', 'selected', 'effective'].filter(key => ['sse', 'websocket', 'unknown'].includes(item[key])).map(key => [key, item[key]])),
    ...Object.fromEntries(['durationMs', 'firstEventMs', 'lastEventAgoMs', 'eventCount', 'consecutiveFailures', 'httpStatus'].filter(key => Number.isSafeInteger(item[key]) && item[key] >= 0).map(key => [key, item[key]])),
    ...(['provider', 'adapter'].includes(item.eventSource) ? { eventSource: item.eventSource } : {}),
    ...(typeof item.outputStarted === 'boolean' ? { outputStarted: item.outputStarted } : {}),
    ...(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ERR_STREAM_PREMATURE_CLOSE', 'TIMEOUT', 'WS_CLOSED', 'OTHER'].includes(item.code) ? { code: item.code } : {}),
  }))
}
