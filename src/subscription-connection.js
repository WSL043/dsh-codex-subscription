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

const COUNTERS = ['requests', 'connectionsCreated', 'connectionsReused', 'deltaRequests', 'websocketFailures', 'sseFallbacks']
const defaultSdk = { close: closeOpenAICodexWebSocketSessions, reset: resetOpenAICodexWebSocketDebugStats, stats: getOpenAICodexWebSocketDebugStats }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 56)
const zero = () => Object.fromEntries(COUNTERS.map(key => [key, 0]))

/** Policy owns only recovery timing. SDK owns sockets, fallback and continuation. */
export function createSubscriptionConnection({ resolveMode = () => 'sse', resolveProxy = resolveCodexOAuthProxy,
  sdk = defaultSdk, now = () => performance.now(), random = Math.random,
  cooldownMs = 30000, maxCooldownMs = 300000, maxSessions = 256, idleMs = 30 * 60000,
} = {}) {
  let namespace = randomUUID(), epoch = 0
  const sessions = new Map(), retired = new Set(), probes = new Set()
  const totals = zero()
  const recovery = { recoveryAttempts: 0, recoverySuccesses: 0, recoveryDeferrals: 0, cooldownRequests: 0 }
  const delay = streak => Math.min(maxCooldownMs, cooldownMs * 2 ** Math.min(10, Math.max(0, streak - 1)) * (0.8 + 0.4 * random()))
  const observe = entry => {
    const stats = sdk.stats(entry.key) ?? {}
    const failures = Math.max(0, (stats.websocketFailures ?? 0) - entry.seen.websocketFailures)
    for (const key of COUNTERS) {
      const count = Number.isSafeInteger(stats[key]) && stats[key] >= 0 ? stats[key] : 0
      totals[key] = Math.min(Number.MAX_SAFE_INTEGER, totals[key] + Math.max(0, count - entry.seen[key]))
      entry.seen[key] = count
    }
    if (!entry.retired && stats.websocketFallbackActive === true && (!entry.cooling || failures > 0)) {
      entry.streak = Math.min(20, entry.streak + Math.max(1, failures))
      entry.cooling = true
      entry.retryAt = now() + delay(entry.streak)
    }
    return stats
  }
  const clear = entry => {
    observe(entry)
    sdk.close(entry.key)
    sdk.reset(entry.key) // public API also clears sticky fallback; preserve totals first
    entry.seen = zero()
  }
  const evict = entry => { clear(entry); sessions.delete(entry.key) }
  const sse = (options, preference, selectionReason) => ({ options: { ...options, transport: 'sse' }, diagnostic: { preference, selectionReason } })
  return {
    snapshot() {
      for (const entry of [...sessions.values(), ...retired]) observe(entry)
      return { ...totals, ...recovery }
    },
    recoverySnapshot() {
      const time = now()
      return { scope: 'plugin-process', capacity: maxSessions, sessions: [...sessions.values()].map(entry => {
        observe(entry)
        return { scope: entry.key, state: entry.probe ? 'probing' : entry.cooling ? 'cooldown' : 'preferred',
          active: entry.active, cooldownMs: Math.max(0, Math.ceil(entry.retryAt - time)) }
      }) }
    },
    async prepare(options = {}, { model, allowWebSocket = true } = {}) {
      const preference = resolveMode() === 'websocket' ? 'websocket' : 'sse'
      if (preference === 'sse') return sse(options, preference, 'configured-sse')
      if (!allowWebSocket) return sse(options, preference, 'forced-sse')
      if (!options.sessionId || options.cacheRetention === 'none') return sse(options, preference, 'no-session')
      const startedEpoch = epoch
      const endpoint = new URL(model?.baseUrl ?? 'https://chatgpt.com/backend-api')
      const proxy = await resolveProxy({ target: endpoint, signal: options.signal })
      options.signal?.throwIfAborted()
      if (startedEpoch !== epoch) throw new DOMException('Connection scope was cleared', 'AbortError')
      const group = hash([namespace, tokenScope(options.apiKey), endpoint.href, proxy])
      const key = 'dsh-' + hash([namespace, options.sessionId, tokenScope(options.apiKey), endpoint.href, proxy])
      const time = now()
      for (const entry of sessions.values()) if (!entry.active && time - entry.used >= idleMs) evict(entry)
      let entry = sessions.get(key)
      if (!entry) {
        if (sessions.size + retired.size >= maxSessions) {
          const oldest = [...sessions.values()].filter(item => !item.active).sort((a, b) => a.used - b.used)[0]
          if (oldest) evict(oldest)
          else return sse(options, preference, 'capacity')
        }
        entry = { key, group, active: 0, used: time, seen: zero(), streak: 0, retryAt: 0, cooling: false, probe: false, retired: false }
        sessions.set(key, entry)
      }
      observe(entry)
      let transport = 'websocket-cached', selectionReason = 'websocket-preferred', probe = false
      if (entry.probe) { transport = 'sse'; selectionReason = 'probe-busy' }
      else if (entry.cooling) {
        if (time < entry.retryAt) { transport = 'sse'; selectionReason = 'ws-cooldown'; recovery.cooldownRequests++ }
        else if (entry.active || probes.has(group)) { transport = 'sse'; selectionReason = 'probe-busy'; recovery.recoveryDeferrals++ }
        else {
          // No await between quiescence check and lease acquisition/reset.
          probes.add(group); entry.probe = probe = true
          try { clear(entry) } catch (error) { probes.delete(group); entry.probe = false; throw error }
          entry.cooling = false
          selectionReason = 'ws-probe'
          recovery.recoveryAttempts++
        }
      }
      entry.active++; entry.used = time
      let finished = false
      return {
        options: { ...options, sessionId: key, transport, websocketConnectTimeoutMs: 10000, env: {} },
        network: { websocket: true, websocketProxy: proxy },
        diagnostic: { preference, scope: key, selectionReason, cooldownMs: Math.max(0, Math.ceil(entry.retryAt - time)) },
        finish(outcome = {}) {
          if (finished) return
          finished = true
          const stats = observe(entry)
          entry.active--; entry.used = now()
          if (probe) {
            probes.delete(group); entry.probe = false
            if (!entry.retired && outcome.status === 'ok' && outcome.transports?.at(-1) === 'websocket' && !outcome.transports.includes('sse') && stats.websocketFallbackActive !== true) {
              entry.streak = 0; entry.retryAt = 0; entry.cooling = false; recovery.recoverySuccesses++
            } else if (!entry.retired && !entry.cooling) {
              // Cancellation/business failures are not new transport failures.
              entry.cooling = true; entry.retryAt = now() + delay(entry.streak)
            }
          }
          if (entry.retired && !entry.active) { clear(entry); retired.delete(entry) }
        },
      }
    },
    dispose() {
      epoch++; namespace = randomUUID()
      for (const entry of sessions.values()) {
        observe(entry); entry.retired = true
        sdk.close(entry.key)
        if (entry.active) retired.add(entry)
        else clear(entry)
      }
      sessions.clear(); probes.clear()
    },
  }
}
