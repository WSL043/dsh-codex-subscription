import { createHash, randomUUID } from 'node:crypto'
import { closeOpenAICodexWebSocketSessions, resetOpenAICodexWebSocketDebugStats, getOpenAICodexWebSocketDebugStats } from '@earendil-works/pi-ai/api/openai-codex-responses'
import { resolveCodexOAuthProxy } from './oauth-network.js'

/**
 * Who a bearer token belongs to, stable across refreshes: the ChatGPT account id inside the token, so a
 * refreshed token keeps the same prompt-cache key and socket. A token without one falls back to itself.
 */
export function tokenScope(apiKey) {
  try {
    const payload = JSON.parse(Buffer.from(String(apiKey).split('.')[1], 'base64url').toString('utf8'))
    const account = payload?.['https://api.openai.com/auth']?.chatgpt_account_id
    if (typeof account === 'string' && account.length > 0 && account.length <= 128) return `account:${account}`
  } catch { /* not a readable token */ }
  return `token:${apiKey}`
}

// Keep the native protocol, continuation and pre-stream fallback, with its
// socket cache scoped to this plugin's own sessions.
export function createSubscriptionConnection({ resolveMode = () => 'sse', resolveProxy = resolveCodexOAuthProxy } = {}) {
  const namespace = randomUUID()
  const sessions = new Set()
  return {
    snapshot() {
      // Deliberately exclude response IDs, session IDs and raw error messages.
      const totals = Object.fromEntries(['requests', 'connectionsCreated', 'connectionsReused', 'deltaRequests', 'websocketFailures', 'sseFallbacks'].map(key => [key, 0]))
      for (const session of sessions) {
        const stats = getOpenAICodexWebSocketDebugStats(session)
        for (const key of Object.keys(totals)) if (Number.isSafeInteger(stats?.[key]) && stats[key] >= 0) totals[key] = Math.min(Number.MAX_SAFE_INTEGER, totals[key] + stats[key])
      }
      return totals
    },
    async prepare(options = {}) {
      if (resolveMode() !== 'websocket') return { options: { ...options, transport: 'sse' } }
      const proxy = await resolveProxy({ target: new URL('https://chatgpt.com/') })
      const sessionId = options.sessionId && `dsh-${createHash('sha256').update(JSON.stringify([namespace, options.sessionId, tokenScope(options.apiKey), proxy])).digest('hex').slice(0,56)}`
      if (sessionId) sessions.add(sessionId)
      return {
        options: { ...options, sessionId, transport: 'websocket-cached', websocketConnectTimeoutMs: 10000, env: {} },
        network: { websocket: true, websocketProxy: proxy },
      }
    },
    dispose() {
      for (const session of sessions) {
        closeOpenAICodexWebSocketSessions(session)
        resetOpenAICodexWebSocketDebugStats(session)
      }
      sessions.clear()
    },
  }
}
