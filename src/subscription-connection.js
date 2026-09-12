import { createHash, randomUUID } from 'node:crypto'
import { closeOpenAICodexWebSocketSessions, resetOpenAICodexWebSocketDebugStats } from '@earendil-works/pi-ai/api/openai-codex-responses'
import { resolveCodexOAuthProxy } from './oauth-network.js'

// Keep the native protocol, continuation and pre-stream fallback. Scope its
// cache even on older pi-ai hosts whose socket pool is keyed by session alone.
export function createSubscriptionConnection({ resolveMode = () => 'sse', resolveProxy = resolveCodexOAuthProxy } = {}) {
  const namespace = randomUUID()
  const sessions = new Set()
  return {
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
