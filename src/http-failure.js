// The page imports this file too, so it must not pull in Node-only modules: the server hands in its log.
let logAuthFailure
export const setAuthFailureLogger = fn => { logAuthFailure = fn }

// A 401 means the sign-in is no longer accepted. A 403 can also come from the network
// layer in front of ChatGPT (Cloudflare's browser check, a proxy or VPN exit that is
// blocked), which says nothing about the sign-in, so look at who answered first.
export const SIGN_IN_RENEW = 'ChatGPT sign-in needs to be renewed'
export const ACCESS_DENIED = 'ChatGPT denied this request (HTTP 403). Check account access or contact OpenAI Support; signing in again may not resolve it.'
export const DEVICE_LIMIT = 'ChatGPT does not allow this paid account on this device. Use another permitted account you own or contact OpenAI Support. Signing out or resetting usage does not clear this restriction.'
export const PURCHASE_LIMIT = 'ChatGPT blocked this purchase because too many subscriptions are associated with this card or device. Contact OpenAI Support if this is unexpected.'

const PUBLIC_ACCESS_MESSAGES = new Set([ACCESS_DENIED, DEVICE_LIMIT, PURCHASE_LIMIT])
export const isAccessFailureMessage = message => PUBLIC_ACCESS_MESSAGES.has(message)
export const isRestrictionFailureMessage = message => message === DEVICE_LIMIT || message === PURCHASE_LIMIT

// Only wording verified in OpenAI's Help Center / desktop checkout, never inferred wire codes.
// https://help.openai.com/en/articles/20001559-understanding-card-and-device-limits-in-chatgpt
// Do not surface arbitrary response text (which may contain credentials or personal data).
export function restrictionMessage(value) {
  if (typeof value !== 'string' || value.length > 8192) return undefined
  let text = value.trim().replace(/^Codex error:\s*/u, '')
  try {
    const body = JSON.parse(text)
    text = body?.error?.message ?? body?.detail?.message ?? body?.detail ?? body?.message
  } catch { /* pi-ai can retain just the plain error message */ }
  if (typeof text !== 'string') return undefined
  text = text.trim().replace(/\s+/gu, ' ')
  if (PUBLIC_ACCESS_MESSAGES.has(text)) return text
  if (/^Device limit reached[.!]?$/iu.test(text)) return DEVICE_LIMIT
  if (/^Too many subscriptions associated with this card or device\. We can[’']t complete this purchase\.$/u.test(text)) return PURCHASE_LIMIT
  return undefined
}

async function responseRestrictionMessage(response) {
  if (typeof response?.clone !== 'function') return undefined
  if (!/json|text\/plain/iu.test(response.headers?.get?.('content-type') ?? '')) return undefined
  let reader
  try {
    reader = response.clone().body?.getReader()
    if (!reader) return undefined
    const decoder = new TextDecoder()
    let text = '', size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) return restrictionMessage(text + decoder.decode())
      size += value.byteLength
      if (size > 8192) return undefined
      text += decoder.decode(value, { stream: true })
    }
  } catch { return undefined }
  finally { void reader?.cancel().catch(() => {}) }
}
export const REQUEST_BLOCKED = 'ChatGPT blocked this request before it reached your account (HTTP 403); your sign-in is fine, try again later or check your network, proxy or VPN'

const CHALLENGE_MARKERS = /just a moment|cf-chl|_cf_chl_opt|attention required|enable javascript and cookies|challenge-platform/iu

/** Whether error text is a Cloudflare / network-protection page (pi-ai keeps only the body of a failed request, not its status). */
export const isChallengePage = text => typeof text === 'string' && /^\s*<(?:!doctype|html)/iu.test(text) && CHALLENGE_MARKERS.test(text)

/** Whether a 403 response is a Cloudflare / network-protection page rather than an answer from the ChatGPT backend. */
export async function isBlockedByNetwork(response) {
  if (response?.status !== 403) return false
  try {
    const header = name => String(response.headers?.get?.(name) ?? '')
    if (/challenge/iu.test(header('cf-mitigated'))) return true
    if (!/html/iu.test(header('content-type'))) return false
    if (/cloudflare/iu.test(header('server'))) return true
    const text = typeof response.clone === 'function' ? (await response.clone().text()).slice(0, 8192) : ''
    return CHALLENGE_MARKERS.test(text)
  } catch { return false }
}

/** Known restrictions take precedence over status-based authentication advice. */
export async function authFailureMessage(response) {
  if (!response || response.ok || response.status < 400) return undefined
  const restriction = await responseRestrictionMessage(response)
  if (restriction !== undefined) return restriction
  if (response.status !== 401 && response.status !== 403) return undefined
  const blocked = response.status === 403 && await isBlockedByNetwork(response)
  await noteAuthFailure(response, blocked)
  return blocked ? REQUEST_BLOCKED : response.status === 401 ? SIGN_IN_RENEW : ACCESS_DENIED
}

// Keep unexpected backend refusals in host diagnostics, separate from public advice.
async function noteAuthFailure(response, blocked) {
  if (typeof logAuthFailure !== 'function') return
  try {
    const text = blocked || typeof response.clone !== 'function' ? '' : (await response.clone().text()).slice(0, 400)
    logAuthFailure?.(blocked ? 'HTTP 403 from the network layer in front of ChatGPT' : `ChatGPT answered HTTP ${response.status}`, text === '' ? undefined : text)
  } catch { /* the log is best effort */ }
}
