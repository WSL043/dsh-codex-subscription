import { randomUUID } from 'node:crypto'
import { VOICE_NOTE_SOURCE } from './remote-control-realtime.js'

/** Persist voice notes through the agent inbox; the loop owns message ordering. */
export function createVoiceContextRecorder({ resolveAgent, flushSession }) {
  const savedIds = agent => {
    const ids = new Set()
    for (const messages of [agent.session.deriveMessages(), agent.inbox?.nextStep ?? [], agent.inbox?.nextTurn ?? []]) {
      for (const message of messages) if (message.source?.kind === VOICE_NOTE_SOURCE) ids.add(message.id)
    }
    return ids
  }
  return {
    async recordedIds(threadId, ids) {
      if (typeof flushSession !== 'function') return
      const agent = await resolveAgent(threadId)
      const saved = savedIds(agent)
      const found = new Set([...ids].filter(id => saved.has(id)))
      if (found.size && await flushSession(agent.session) === true) return found
    },
    async record(threadId, text, checkpointId) {
      const agent = await resolveAgent(threadId)
      if (typeof agent.inject !== 'function') return false
      // Recording must not wake an idle agent or interrupt a running tool step.
      while (agent.status === 'running' && typeof agent.whenIdle === 'function') await agent.whenIdle()
      if (agent.status === 'running') return false
      const id = checkpointId ?? randomUUID()
      if (!savedIds(agent).has(id)) agent.inject({
        id, role: 'user', content: [{ type: 'text', text }], source: { kind: VOICE_NOTE_SOURCE },
      })
      // A queued note is already durable after flush, even before its first turn.
      // Recovery must recognize that inbox entry after restart and avoid duplicates.
      return typeof flushSession === 'function' ? await flushSession(agent.session) === true : false
    },
  }
}
