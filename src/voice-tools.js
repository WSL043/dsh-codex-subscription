import { defineTool } from '@deepseek-ai/dsh-tools'

/**
 * The one tool the agent gets while a voice call is running, like Codex's end_realtime_voice_call: the voice model hands
 * "the user said goodbye" over as a request, and the agent hangs up. The voice model itself has no tools.
 */
export function createEndVoiceCallTool({ end, isActive }) {
  return defineTool({
    name: 'end_voice_call',
    description: 'End the current voice call. The user is talking to you through a live voice call, so a message that is or ends with a farewell (bye, goodbye, 拜拜, 再见, I am leaving, 先走了) or asks to end the call is a request to end it: call this tool, then say a short goodbye. The words may be rough or have a little more after them. Stopping work, stopping speech or pausing does not end a call. Never call it from a text conversation.',
    parameters: {},
    isConcurrencySafe: () => false,
    async execute(_args, exec) {
      const sessionId = exec.agent?.id
      if (typeof sessionId !== 'string' || !isActive(sessionId)) return { ended: false, message: 'There is no voice call running in this conversation.' }
      end(sessionId)
      return { ended: true, message: 'The voice call is ending; it closes once the voice has finished speaking. Say a short goodbye.' }
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: value.message }] },
  })
}

/** The desktop voice object, with the end-call tool registered for as long as at least one call is open. */
export function withEndCallTool(desktopVoice, register) {
  if (!desktopVoice) return desktopVoice
  const open = new Set()
  let dispose
  const release = sessionId => { open.delete(sessionId); if (open.size === 0 && dispose) { dispose(); dispose = undefined } }
  return Object.freeze({
    async start(params) {
      const result = await desktopVoice.start(params)
      open.add(params.sessionId)
      dispose ??= register(createEndVoiceCallTool({ end: id => desktopVoice.end(id), isActive: id => desktopVoice.status(id).active }))
      return result
    },
    stop(sessionId) { const result = desktopVoice.stop(sessionId); release(sessionId); return result },
    end: sessionId => desktopVoice.end(sessionId),
    interrupt: sessionId => desktopVoice.interrupt(sessionId),
    status: sessionId => desktopVoice.status(sessionId),
  })
}
