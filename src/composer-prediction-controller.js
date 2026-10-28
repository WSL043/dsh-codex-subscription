import { CHANNEL, unwrap } from './rpc-contract.js'

const EMPTY = Object.freeze({ prediction: null, status: 'idle' })
const MODELS = new Set(['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra'])
const textOf = (blocks, field) => (Array.isArray(blocks) ? blocks : [])
  .filter(block => block?.[field] === 'text' && typeof block.text === 'string')
  .map(block => block.text).join('\n')

/** Account identity is local admission state, never part of the prediction payload. */
export function composerPredictionAccountKey(snapshot) {
  if (snapshot?.status !== 'ready' || snapshot.account?.authenticated !== true) return undefined
  const accounts = snapshot.account.accounts
  if (!Array.isArray(accounts) || accounts.length === 0) return 'authenticated'
  const active = accounts.find(account => account.active === true) ?? (accounts.length === 1 ? accounts[0] : undefined)
  return typeof active?.id === 'string' && active.id ? active.id : undefined
}

/** Read only the text that the public Chat view presents, never provider history. */
export function composerPredictionContext(chat) {
  if (!Array.isArray(chat?.order) || typeof chat.nodes?.get !== 'function') return null
  const messages = []
  let latest
  let remaining = 24000
  for (let index = chat.order.length - 1; index >= 0; index -= 1) {
    const node = chat.nodes.get(chat.order[index])
    if (node?.visibility !== 'visible') continue
    if (node.kind !== 'user' && node.kind !== 'assistant-step') continue
    const assistant = node.kind === 'assistant-step'
    const data = node.data
    const text = assistant ? textOf(data?.blocks, 'kind') : textOf(data?.content, 'type')
    if (!latest) {
      if (!assistant || data?.status !== 'settled' || !data.finalNode || data.finalNode.interrupted || !text.trim()) return null
      const turn = chat.timeline?.turns?.get(data.turn)
      if (turn?.status !== 'closed' || chat.timeline?.turnOrder?.at(-1) !== data.turn) return null
      latest = { turnId: String(data.turn) }
    }
    if (assistant && data?.status !== 'settled') continue
    if (!text.trim()) continue
    const bounded = text.slice(-remaining)
    messages.unshift({ role: assistant ? 'assistant' : 'user', text: bounded })
    remaining -= bounded.length
    if (messages.length >= 12 || remaining <= 0) break
  }
  return latest && messages.length >= 2 && messages.some(message => message.role === 'user')
    && messages.at(-1).role === 'assistant' ? { ...latest, messages } : null
}

const eligibleDraft = state => state?.enabled === true && state.provider === 'openai-codex'
  && typeof state.accountKey === 'string' && state.accountKey.length > 0
  && MODELS.has(state.model) && state.sessionId
  && state.composing !== true
  && state.input?.phase === 'plain' && typeof state.input.draft === 'string' && !state.input.draft.trim()
  && !state.input.attachmentIds?.length && !state.input.occurrences?.length
  && state.span?.draftRev === state.input.draftRev && state.span.start === state.span.end
  && state.span.end === state.input.draft.length && state.context

const eligible = state => eligibleDraft(state) && state.visible === true && state.focused === true

const sameDraft = (a, b) => a?.sessionId === b?.sessionId && a?.model === b?.model
  && a?.accountKey === b?.accountKey
  && a?.context?.turnId === b?.context?.turnId && a?.input?.draftRev === b?.input?.draftRev
  && a?.input?.draft === b?.input?.draft && a?.span?.start === b?.span?.start && a?.span?.end === b?.span?.end

/** One cancellable prediction per completed turn; late work cannot edit or revive a draft. */
export function createComposerPredictionController(rpc) {
  let snapshot = EMPTY
  let state
  let anchor
  let pending
  let generation = 0
  let disposed = false
  const attempted = new Set()
  const listeners = new Set()
  const publish = next => {
    if (disposed || (snapshot.prediction === next.prediction && snapshot.status === next.status)) return
    snapshot = Object.freeze(next)
    for (const listener of [...listeners]) { if (!disposed) listener() }
  }
  const clear = () => {
    generation += 1
    pending?.abort()
    pending = undefined
    anchor = undefined
    publish(EMPTY)
  }
  const update = next => {
    if (disposed) return
    state = next
    if (!eligibleDraft(next)) { clear(); return }
    // Focus controls presentation and acceptance, not the lifetime of one paid
    // inference. Keep the same request/result while reading the reply or returning
    // from another window. Hidden pages must not start new requests.
    if (anchor && sameDraft(anchor, next)) return
    clear()
    if (next.visible !== true) return
    const key = JSON.stringify([next.accountKey, next.sessionId, next.context.turnId])
    if (attempted.has(key)) return
    anchor = next
    const request = ++generation
    const abort = new AbortController()
    pending = abort
    publish({ prediction: null, status: 'loading' })
    // Guard even the first dispatch: disabling during a subscriber callback does no work.
    Promise.resolve().then(() => {
      if (disposed || generation !== request || abort.signal.aborted) return
      attempted.add(key)
      if (attempted.size > 128) attempted.delete(attempted.values().next().value)
      return rpc.call(CHANNEL, 'predictions/generate', {
        sessionId: next.sessionId, model: next.model, turnId: next.context.turnId, messages: next.context.messages,
      }, abort.signal)
    }).then(response => {
      if (disposed || generation !== request || abort.signal.aborted || !eligibleDraft(state) || !sameDraft(anchor, state)) return
      const value = unwrap(response)
      const prediction = typeof value?.prediction === 'string' ? value.prediction.trim() : ''
      publish(prediction && prediction.length <= 4000
        ? { prediction, status: 'ready' } : EMPTY)
    }).catch(() => {
      if (!disposed && generation === request) publish(EMPTY)
    }).finally(() => { if (generation === request) pending = undefined })
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: listener => {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    update,
    cancel: clear,
    accept(inputActions, current) {
      if (disposed || !snapshot.prediction || !eligible(current) || !sameDraft(anchor, current)) return false
      const span = inputActions.captureInsertion()
      if (span.draftRev !== anchor.span.draftRev || span.start !== anchor.span.start || span.end !== anchor.span.end) { clear(); return false }
      const prediction = snapshot.prediction
      clear()
      if (!inputActions.insertText(prediction, span)) return false
      inputActions.persistDraft?.()
      return true
    },
    dispose() {
      if (disposed) return
      disposed = true
      generation += 1
      pending?.abort()
      pending = undefined
      anchor = undefined
      listeners.clear()
      attempted.clear()
    },
  })
}
