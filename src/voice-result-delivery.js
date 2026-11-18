import { createVoiceTranscriptRecovery } from './voice-transcript-recovery.js'

const WINDOW = 30 * 60_000
const states = new Set(['pending', 'offered', 'announcing', 'heard', 'screen-only'])
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 128
const valid = value => value?.id === 'voice-results' && Array.isArray(value.entries) && value.entries.length <= 16
  && value.entries.every(entry => validId(entry?.requestId) && validId(entry.messageId)
    && states.has(entry.state) && [0, 1, 2].includes(entry.attempts) && Number.isFinite(entry.completedAt))

export const createVoiceResultStore = directory => createVoiceTranscriptRecovery(directory, valid)

export function createVoiceResultDelivery({ store, warn = () => {}, now = Date.now } = {}) {
  const threads = new Map()
  const thread = id => {
    let result = threads.get(id)
    if (!result) threads.set(id, result = { entries: new Map(), queued: new Map() })
    for (const [key, entry] of result.entries) if (now() - entry.completedAt > WINDOW) result.entries.delete(key)
    return result
  }
  const persist = id => {
    if (!store) return
    void store.save(id, { id: 'voice-results', entries: [...thread(id).entries.values()].map(entry => ({ ...entry })) }).catch(warn)
  }
  return {
    thread,
    tracks(id) {
      const current = threads.get(id)
      return Boolean(current?.queued.size || current?.running)
    },
    async restore(id) {
      const value = await store?.load(id)
      const current = thread(id)
      for (const entry of value?.entries ?? []) {
        if (now() - entry.completedAt <= WINDOW && !current.entries.has(entry.requestId)) {
          if (entry.state === 'announcing') entry.state = entry.attempts >= 2 ? 'screen-only' : 'pending'
          current.entries.set(entry.requestId, entry)
        }
      }
      while (current.entries.size > 16) current.entries.delete(current.entries.keys().next().value)
    },
    complete(id, requestId, messageId) {
      const current = thread(id)
      const prior = current.entries.get(requestId)
      if (prior) return prior
      if (!validId(requestId) || !validId(messageId)) return
      const entry = { requestId, messageId, state: 'pending', attempts: 0, completedAt: now() }
      current.entries.set(requestId, entry)
      if (current.entries.size > 16) current.entries.delete(current.entries.keys().next().value)
      persist(id)
      return entry
    },
    update(id, entry, state) {
      entry.state = state
      if (state === 'announcing') entry.attempts++
      persist(id)
    },
  }
}
