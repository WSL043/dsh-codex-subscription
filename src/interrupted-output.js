import { joinAssistantStreamText } from '@deepseek-ai/dsh-llm/assistant-stream'

// Presentation over existing durable records only; never append model messages.
export const requestSourceNode = {
  kind: 'codex-request-source', target: 'chat',
  match: event => event.type === 'request/header' ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match) => ({ provider: match.event.data?.header?.config?.provider }),
  update: context => context.state,
  buildViewNode: () => null,
}

function update(state, event) {
  if (event.type === 'assistant/message') return { ...state, completed: true }
  if (event.type === 'llm/retry') return { ...state, retry: event.data.retry,
    repeated: event.data.retry >= 3 && ['TRANSPORT', 'TIMEOUT'].includes(event.data.failure?.code) }
  if (event.type !== 'assistant/attempt' || state.provider !== 'openai-codex') return state
  let text = ''
  try { if (Array.isArray(event.data.stream)) text = joinAssistantStreamText(event.data.stream) } catch { /* unknown old host stream shape */ }
  return { ...state, attempts: state.attempts + 1, seq: event.seq, text: text || state.text }
}

export const interruptedOutputNode = {
  kind: 'codex-interrupted-output', target: 'chat',
  match(event) {
    if (!['assistant/attempt', 'assistant/message', 'llm/retry'].includes(event.type)) return null
    return { id: `${event.data.turn}:${event.data.step}`, role: event.type === 'assistant/attempt' ? 'start' : 'update' }
  },
  start: (_context, match, reader) => update({ provider: reader?.previous('codex-request-source')?.state?.provider,
    attempts: 0, retry: 0, text: '', completed: false, repeated: false }, match.event),
  update: (context, match) => update(context.state, match.event),
  buildViewNode(context) {
    const state = context.state
    // A null result does not remove an already materialized host node. Publish
    // an explicit hidden upsert when a successful reply replaces this draft.
    if (!state || state.provider !== 'openai-codex' || state.completed || !state.text && !state.repeated) {
      const current = context.current?.get('chat')
      return current ? { ...current, visibility: 'hidden' } : null
    }
    return { key: context.key, id: context.id, kind: 'codex-interrupted-output', target: 'chat',
      location: { kind: 'session' }, anchorSeq: state.seq + 0.01, visibility: 'visible',
      data: { text: state.text, attempts: state.attempts, retry: state.retry, repeated: state.repeated } }
  },
}
