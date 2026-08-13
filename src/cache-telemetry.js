import { createHash } from 'node:crypto'

const percent = (part, whole) => whole <= 0 ? 0 : Math.round((part / whole) * 1000) / 10

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const digest = value => createHash('sha256').update(canonical(value)).digest('hex')

function prefixParts(request) {
  return {
    model: digest({ provider: request.provider, model: request.model }),
    system: digest(String(request.system ?? '')),
    tools: digest(request.tools ?? []),
  }
}

/** Hash only the model-visible stable prefix. Conversation messages are excluded. */
export function prefixFingerprint(request) {
  return digest(prefixParts(request))
}

const nonNegative = value => Number.isFinite(value) && value > 0 ? value : 0

/**
 * Process-local, content-free cache observability. It deliberately keeps only
 * hashes per session and returns aggregate counters, never prompts or ids.
 */
export class CodexCacheTelemetry {
  #sessions = new Map()
  #now
  #maxSessions
  #evictedSessions = 0
  #requests = 0
  #prefixChanges = 0
  #lastChangedComponent
  #input = 0
  #cacheRead = 0
  #cacheWrite = 0
  #output = 0
  #transport = {
    connectionsCreated: 0,
    connectionsReused: 0,
    cachedContextRequests: 0,
    fullContextRequests: 0,
    deltaRequests: 0,
    websocketFailures: 0,
    sseFallbacks: 0,
  }

  constructor(options = {}) {
    this.#now = options.now ?? Date.now
    this.#maxSessions = options.maxSessions ?? 512
    if (!Number.isInteger(this.#maxSessions) || this.#maxSessions <= 0) {
      throw new Error('Codex cache telemetry maxSessions must be a positive integer')
    }
  }

  #remember(id, session) {
    this.#sessions.delete(id)
    this.#sessions.set(id, session)
    while (this.#sessions.size > this.#maxSessions) {
      const oldest = this.#sessions.keys().next().value
      this.#sessions.delete(oldest)
      this.#evictedSessions += 1
    }
  }

  begin(request) {
    const id = String(request.sessionId ?? '')
    const parts = prefixParts(request)
    const previous = this.#sessions.get(id)
    if (previous !== undefined) {
      for (const component of ['model', 'system', 'tools']) {
        if (previous.parts[component] !== parts[component]) {
          this.#prefixChanges += 1
          this.#lastChangedComponent = component
          break
        }
      }
    }
    this.#remember(id, { parts, ws: previous?.ws, seenAt: this.#now() })
    this.#requests += 1
  }

  finish(request, usage = {}, websocketStats) {
    this.#input += nonNegative(usage.inputTokens)
    this.#cacheRead += nonNegative(usage.cacheReadTokens)
    this.#cacheWrite += nonNegative(usage.cacheWriteTokens)
    this.#output += nonNegative(usage.outputTokens)

    if (websocketStats === undefined) return
    const id = String(request.sessionId ?? '')
    const session = this.#sessions.get(id) ?? { parts: prefixParts(request), seenAt: this.#now() }
    const previous = session.ws ?? {}
    for (const key of Object.keys(this.#transport)) {
      const current = nonNegative(websocketStats[key])
      const before = nonNegative(previous[key])
      this.#transport[key] += Math.max(0, current - before)
    }
    session.ws = structuredClone(websocketStats)
    session.seenAt = this.#now()
    this.#remember(id, session)
  }

  snapshot() {
    const cacheEligible = this.#input + this.#cacheRead + this.#cacheWrite
    return {
      requests: this.#requests,
      observedAt: this.#now(),
      trackedSessions: this.#sessions.size,
      sessionCapacity: this.#maxSessions,
      evictedSessions: this.#evictedSessions,
      serverCache: {
        uncachedInputTokens: this.#input,
        readTokens: this.#cacheRead,
        writeTokens: this.#cacheWrite,
        outputTokens: this.#output,
        hitPercent: percent(this.#cacheRead, cacheEligible),
      },
      transport: {
        ...this.#transport,
        deltaPercent: percent(this.#transport.deltaRequests, this.#transport.cachedContextRequests),
      },
      prefix: {
        state: this.#requests === 0 ? 'unseen' : this.#prefixChanges === 0 ? 'stable' : 'changed',
        changes: this.#prefixChanges,
        ...(this.#lastChangedComponent === undefined ? {} : { lastChangedComponent: this.#lastChangedComponent }),
      },
    }
  }
}
