export const CHANNEL = '/codex-subscription'
export const RPC_ENDPOINTS = Object.freeze([
  'status', 'login/start', 'login/status', 'login/submit', 'login/cancel', 'logout',
  'account/select', 'account/remove', 'usage', 'diagnostics',
  'preferences/status', 'preferences/models', 'preferences/update',
  'reset-credit/inspect', 'reset-credit/prepare', 'reset-credit/consume',
  'image/original/chunk',
  'sketch/connect', 'sketch/poll', 'sketch/claim', 'sketch/result', 'sketch/disconnect',
])

// Components use a plugin-scoped client; DSH owns transport and authentication.
export function createSubscriptionRpcClient(transport) {
  return Object.freeze({
    call(channel, endpoint, payload, signal) {
      if (channel !== CHANNEL || !RPC_ENDPOINTS.includes(endpoint)) throw new Error('Invalid subscription RPC target')
      return transport.call('/api', `codex-subscription/${endpoint}`, payload, signal)
    },
  })
}

export function unwrap(response) {
  if (!response?.ok) throw new Error(response?.error?.message ?? 'Codex RPC failed')
  return response.value
}
