// A close error means the response did not finish, even for normal code 1000
// during account-switch cleanup. Never map policy/size rejection to transport.
const TRANSIENT_WEBSOCKET_CLOSE = /^WebSocket closed (?:1000|1006|1011|1012|1013)(?:\s|$)/
// The Codex gateway (Envoy) answers 507 with this text when an upstream attempt
// fails and the request body is too large for it to replay. The request was
// accepted and forwarded, so a fresh send can succeed; pi-ai keeps only the body
// text, so DSH would otherwise treat it as a non-retryable PI_AI_ERROR.
const GATEWAY_REPLAY_BUFFER_EXCEEDED = /^\s*exceeded request buffer limit while retrying upstream\s*$/

export function normalizeTransportEvent(event, signal) {
  if (signal?.aborted || event?.type !== 'error' || event.reason !== 'error') return event
  const message = event.error?.errorMessage
  if (typeof message !== 'string') return event
  if (!TRANSIENT_WEBSOCKET_CLOSE.test(message) && !GATEWAY_REPLAY_BUFFER_EXCEEDED.test(message)) return event
  return { ...event, error: { ...event.error, errorMessage: `Network transport failure: ${message}` } }
}
