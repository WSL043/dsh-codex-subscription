import { createHash, randomUUID } from 'node:crypto'
import { closeOpenAICodexWebSocketSessions, resetOpenAICodexWebSocketDebugStats, getOpenAICodexWebSocketDebugStats } from '@earendil-works/pi-ai/api/openai-codex-responses'
import { resolveCodexOAuthProxy } from './oauth-network.js'

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
      const sessionId = options.sessionId && `dsh-${createHash('sha256').update(JSON.stringify([namespace, options.sessionId, options.apiKey, proxy])).digest('hex').slice(0,56)}`
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
