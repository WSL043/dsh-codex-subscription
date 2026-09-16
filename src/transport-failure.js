// pi-ai emits a message-only error event for WebSocket closes. Limit this
// compatibility mapping to transient close codes, never policy/size rejection.
export function normalizeTransportEvent(event, signal) {
  if (signal?.aborted || event?.type !== 'error' || event.reason !== 'error') return event
  const message = event.error?.errorMessage
  if (typeof message !== 'string' || !/^WebSocket closed (?:1006|1011|1012|1013)(?:\s|$)/.test(message)) return event
  return { ...event, error: { ...event.error, errorMessage: `Network transport failure: ${message}` } }
}
