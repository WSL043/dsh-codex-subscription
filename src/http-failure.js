// The page imports this file too, so it must not pull in Node-only modules: the server hands in its log.
let logAuthFailure
export const setAuthFailureLogger = fn => { logAuthFailure = fn }

// A 401 means the sign-in is no longer accepted. A 403 can also come from the network
// layer in front of ChatGPT (Cloudflare's browser check, a proxy or VPN exit that is
// blocked), which says nothing about the sign-in, so look at who answered first.
export const SIGN_IN_RENEW = 'ChatGPT sign-in needs to be renewed'
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

/** The error message for a 401 or 403 answer, or undefined for any other status. */
export async function authFailureMessage(response) {
  if (response?.status !== 401 && response?.status !== 403) return undefined
  const blocked = response.status === 403 && await isBlockedByNetwork(response)
  await noteAuthFailure(response, blocked)
  return blocked ? REQUEST_BLOCKED : SIGN_IN_RENEW
}

// The same sentence covers an expired sign-in and an account the service refuses; what the
// server said (cleaned, short) goes to the log so a report can tell the two apart.
async function noteAuthFailure(response, blocked) {
  try {
    const text = blocked || typeof response.clone !== 'function' ? '' : (await response.clone().text()).slice(0, 400)
    logAuthFailure?.(blocked ? 'HTTP 403 from the network layer in front of ChatGPT' : `ChatGPT answered HTTP ${response.status}`, text === '' ? undefined : text)
  } catch { /* the log is best effort */ }
}
