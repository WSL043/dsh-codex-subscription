import { isChallengePage, REQUEST_BLOCKED } from './http-failure.js'
// A close error means the response did not finish, even for normal code 1000
// during account-switch cleanup. Never map policy/size rejection to transport.
const TRANSIENT_WEBSOCKET_CLOSE = /^WebSocket closed (?:1000|1006|1011|1012|1013)(?:\s|$)/
// The Codex gateway (Envoy) answers 507 with this text when an upstream attempt
// fails and the request body is too large for it to replay. The request was
// accepted and forwarded, so a fresh send can succeed; pi-ai keeps only the body
// text, so DSH would otherwise treat it as a non-retryable PI_AI_ERROR.
const GATEWAY_REPLAY_BUFFER_EXCEEDED = /^\s*exceeded request buffer limit while retrying upstream\s*$/

// Only owned network error codes may reach support logs. Never retain messages,
// hostnames, addresses, headers, request bodies or arbitrary nested properties.
const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
  'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT'])
export function safeFetchFailure(error) {
  const pending = [error], seen = new Set(), codes = new Set()
  for (let i = 0; pending.length && i < 12; i++) {
    const value = pending.shift()
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    if (NETWORK_CODES.has(value.code)) codes.add(value.code)
    if (value.cause) pending.push(value.cause)
    if (Array.isArray(value.errors)) pending.push(...value.errors.slice(0, 8))
  }
  return 'fetch failed' + (codes.size ? ' [' + [...codes].join(', ') + ']' : '')
}

export function normalizeTransportEvent(event, signal) {
  if (signal?.aborted || event?.type !== 'error' || event.reason !== 'error') return event
  const message = event.error?.errorMessage
  if (typeof message !== 'string') return event
  // A Cloudflare check page arrives as the raw HTML body; say what it is instead of pasting the page.
  if (isChallengePage(message)) return { ...event, error: { ...event.error, errorMessage: REQUEST_BLOCKED } }
  if (!TRANSIENT_WEBSOCKET_CLOSE.test(message) && !GATEWAY_REPLAY_BUFFER_EXCEEDED.test(message)) return event
  return { ...event, error: { ...event.error, errorMessage: `Network transport failure: ${message}` } }
}
