const KIND = 'codex-image-output'
const resultsOf = event => event?.type === 'tool/result' && event.data.meta?.kind === 'codex-subscription-image'
  ? (event.data.message?.content ?? []).filter(block => block.type === 'tool-result' && !block.isError
    && block.content?.some(part => part.type === 'image' && part.attachment)) : []

// Presentation only: project existing durable results, without inserting another
// message into the model's context or expanding unrelated tool calls.
export const imageConversationNode = {
  kind: KIND, target: 'chat',
  match(event) {
    if (event.type !== 'turn/end' && resultsOf(event).length === 0) return null
    return { id: String(event.data.turn), role: 'update' }
  },
  start: () => undefined,
  update: context => context.state,
  buildViewNode(context) {
    const end = context.matches.find(match => match.event.type === 'turn/end')
    if (!end) return null
    const blocks = context.matches.flatMap(({ event }) => resultsOf(event).map(block => ({
      ...block, kind: 'tool-result', meta: event.data.meta,
    })))
    if (!blocks.length) return null
    const turn = end.location.turn
    const answer = turn?.steps?.at(-1)?.data.get('assistant-step')
    const lastResultSeq = Math.max(...context.matches.filter(match => resultsOf(match.event).length).map(match => match.event.seq))
    const answerSeq = answer?.finalNode?.seq
    // Between the final answer and its action row, outside the process fold.
    const anchorSeq = answerSeq > lastResultSeq ? answerSeq + 0.025 : end.event.seq - 0.025
    return { key: context.key, id: context.id, kind: KIND, target: 'chat',
      location: end.location, anchorSeq, visibility: 'visible', data: { blocks } }
  },
}
