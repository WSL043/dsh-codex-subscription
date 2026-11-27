import { CHANNEL, unwrap } from './rpc-contract.js'
import { normalizeOutputVerbosity, normalizeSessionSpeedMode, OUTPUT_VERBOSITY_FIELD, SPEED_MODE_FIELD } from './settings-contract.js'

const idle = Object.freeze({ status: 'loading', writable: false, saving: false })
const fields = { [SPEED_MODE_FIELD]: normalizeSessionSpeedMode, [OUTPUT_VERBOSITY_FIELD]: normalizeOutputVerbosity }
const valid = (field, value) => typeof value === 'string' && fields[field](value) === value

function ready(value) {
  // Older hosts ignore sessionId and return the full profile status. Reject it
  // rather than ever enabling a session-looking control that would write globally.
  if (!value || Object.keys(value).length !== 3 || !Object.hasOwn(value, 'writable') || typeof value.writable !== 'boolean' ||
    !Object.keys(fields).every(field => Object.hasOwn(value, field) && valid(field, value[field]))) {
    throw new Error('Invalid session preference response')
  }
  return { status: 'ready', writable: value.writable, saving: false, speedMode: value.speedMode, outputVerbosity: value.outputVerbosity }
}

// Settings and the catalog have a profile-wide controller. Composer choices must
// never fall back to it: every operation is bound to the Session that owns the slot.
export function createSessionPreferenceController(rpc) {
  const entries = new Map()
  let disposed = false
  const active = entry => entry?.listeners.size > 0
  const publish = (entry, snapshot) => {
    entry.snapshot = snapshot
    for (const listener of entry.listeners) listener()
  }
  const load = async (sessionId, entry) => {
    entry.request?.abort()
    const request = entry.request = new AbortController()
    publish(entry, idle)
    if (request.signal.aborted) return
    try {
      const value = ready(unwrap(await rpc.call(CHANNEL, 'preferences/status', { sessionId }, request.signal)))
      if (!request.signal.aborted) publish(entry, value)
    } catch {
      if (!request.signal.aborted) publish(entry, { ...idle, status: 'unavailable' })
    } finally {
      if (entry.request === request) entry.request = undefined
    }
  }
  return {
    getSnapshot(sessionId) {
      const entry = entries.get(sessionId)
      return active(entry) ? entry.snapshot : idle
    },
    subscribe(sessionId, listener) {
      if (disposed || typeof sessionId !== 'string' || sessionId.length === 0) return () => {}
      let entry = entries.get(sessionId)
      const fresh = !entry
      if (fresh) {
        entry = { snapshot: idle, listeners: new Set() }
        entries.set(sessionId, entry)
      }
      entry.listeners.add(listener)
      if (fresh) void load(sessionId, entry)
      return () => {
        entry.listeners.delete(listener)
        if (active(entry) || entry.snapshot.saving || entries.get(sessionId) !== entry) return
        entry.request?.abort()
        entries.delete(sessionId)
      }
    },
    async set(sessionId, patch, expected) {
      const entry = entries.get(sessionId)
      const before = entry?.snapshot
      if (!active(entry) || before.status !== 'ready' || !before.writable || before.saving || (expected && before !== expected)) return
      const updates = Object.entries(patch)
      if (!updates.length || !updates.every(([field, value]) => Object.hasOwn(fields, field) && valid(field, value))) return
      const request = entry.request = new AbortController()
      publish(entry, { ...before, saving: true, error: undefined })
      if (request.signal.aborted) return
      try {
        const value = ready(unwrap(await rpc.call(CHANNEL, 'preferences/update', { ...patch, sessionId }, request.signal)))
        if (request.signal.aborted) return
        publish(entry, value)
        return true
      } catch {
        if (request.signal.aborted) return
        publish(entry, { ...before, error: true })
        return false
      } finally {
        // Navigation must not cancel a write the user already made. Let it
        // settle against the old Session; evict the entry if it is no longer visible.
        if (entry.request === request && entries.get(sessionId) === entry) {
          entry.request = undefined
          if (!active(entry)) entries.delete(sessionId)
          else if (entry.reloadAfterWrite) {
            entry.reloadAfterWrite = false
            void load(sessionId, entry)
          }
        }
      }
    },
    reload() {
      for (const [sessionId, entry] of entries) {
        if (!active(entry)) continue
        if (entry.snapshot.saving) entry.reloadAfterWrite = true
        else void load(sessionId, entry)
      }
    },
    dispose() {
      disposed = true
      for (const entry of entries.values()) {
        entry.listeners.clear()
        entry.request?.abort()
      }
      entries.clear()
    },
  }
}
