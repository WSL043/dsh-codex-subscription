import { defineTool } from '@deepseek-ai/dsh-tools'

/**
 * The one tool the agent gets while a voice call is running, like Codex's end_realtime_voice_call: the voice model hands
 * "the user said goodbye" over as a request, and the agent hangs up. The voice model itself has no tools.
 */
export function createEndVoiceCallTool({ stop, isActive }) {
  return defineTool({
    name: 'end_voice_call',
    description: 'End the current voice call. Only call this tool when the user clearly intends to end the call. A request to stop work, stop speaking or pause is not enough, and neither is a goodbye word inside other talk. Never call it from a text conversation.',
    parameters: {},
    isConcurrencySafe: () => false,
    async execute(_args, exec) {
      const sessionId = exec.agent?.id
      if (typeof sessionId !== 'string' || !isActive(sessionId)) return { ended: false, message: 'There is no voice call running in this conversation.' }
      stop(sessionId)
      return { ended: true, message: 'The voice call was ended.' }
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
      dispose ??= register(createEndVoiceCallTool({ stop: id => { desktopVoice.stop(id); release(id) }, isActive: id => desktopVoice.status(id).active }))
      return result
    },
    stop(sessionId) { const result = desktopVoice.stop(sessionId); release(sessionId); return result },
    status: sessionId => desktopVoice.status(sessionId),
  })
}
