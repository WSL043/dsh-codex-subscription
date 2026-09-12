/** Experimental SSE bridge; callers must explicitly opt in. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
const clone = value => JSON.parse(JSON.stringify(value))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const key = 'codexCompactionV1'
const historyHash = messages => hash(messages.map(({ source, ...message }) => ({ ...message, source: source && { kind: source.kind, provider: source.provider, model: source.model } })))
const MAX_BYTES = 2 * 1024 * 1024

export function createCompactionBridge({ enabled = () => false, threshold = () => 100000, accountScope, diagnostic = () => {} }) {
 const scope = new AsyncLocalStorage()
 const wrapStream = (factory, options) => (async function* () {
  if (!enabled() || options.provider !== 'openai-codex') { yield* factory(options); return }
  const identity = await accountScope(options)
  if (!identity) throw new Error('Compaction requires a stable account identity')
  const state = { identity: hash([identity, options.model]), original: options.messages, blocks: [], suffix: undefined, completed: false }
  let messages = options.messages
  for (let i = messages.length - 1; i >= 0; i--) {
   const candidate = messages[i].source?.replayState?.response?.[key]
   if (!candidate) continue
   if (candidate.scope === state.identity && candidate.prefix === historyHash(messages.slice(0, i)) && candidate.content === hash(messages[i].content)
    && Array.isArray(candidate.items) && candidate.items[0]?.type === 'compaction' && typeof candidate.items[0].encrypted_content === 'string'
    && candidate.digest === hash(candidate.items) && JSON.stringify(candidate.items).length <= MAX_BYTES) {
    state.suffix = clone(candidate.items)
    messages = [...messages.slice(0, i + 1).filter(m => m.role === 'system'), ...messages.slice(i + 1)]
   }
   break
  }
  const iterator = scope.run(state, () => factory({ ...options, messages })[Symbol.asyncIterator]())
  try {
   while (true) {
    const result = await scope.run(state, () => iterator.next())
    if (result.done) break
    let event = result.value
    if (event.type === 'block-end') state.blocks[event.index] = clone(event.block)
    if (event.type === 'finish') diagnostic({ completed: state.completed, captured: state.captured?.length ?? 0, replay: !!event.replayState })
    if (event.type === 'finish' && ['stop', 'tool-calls'].includes(event.reason?.kind) && !options.signal?.aborted && state.completed && state.captured?.length && event.replayState) {
     const items = state.captured
     const checkpoint = { scope: state.identity, prefix: historyHash(state.original), content: hash(state.blocks.filter(Boolean)), items, digest: hash(items) }
     event = { ...event, replayState: { ...event.replayState, response: { ...event.replayState.response, [key]: checkpoint } } }
    }
    yield event
   }
  } finally { await scope.run(state, () => iterator.return?.()) }
 })()
 return {
  wrapAdapter(adapter) {
   return new Proxy(adapter, { get(target, property) {
    if (property === 'stream') return options => wrapStream(o => target.stream(o), options)
    if (property === 'prepareCall') return async (...args) => { const call = await target.prepareCall(...args); return { ...call, stream: options => wrapStream(o => call.stream(o), options) } }
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
   } })
  },
  preparePayload(payload) {
   const state = scope.getStore()
   if (!state) return payload
   const limit = threshold()
   if (!Number.isSafeInteger(limit) || limit < 1000) throw new Error('Invalid compaction threshold')
   return { ...payload, input: [...(state.suffix ?? []), ...payload.input], context_management: [{ type: 'compaction', compact_threshold: limit }] }
  },
  requestOptions(options) { return scope.getStore() ? { ...options, transport: 'sse' } : options },
  networkOptions(options) {
   const state = scope.getStore()
   if (!state) return options
   return { ...options, websocket: false, transformResponse: (response, target) => {
    if (target.hostname !== 'chatgpt.com' || target.pathname !== '/backend-api/codex/responses' || !response.ok || !response.body) return response
    state.completed = false; state.captured = undefined
    let buffer = '', oversized = false
    const decoder = new TextDecoder()
    const observe = line => {
     if (!line.startsWith('data:')) return
     const data = line.slice(5).trim(); if (data === '[DONE]') return
     let event; try { event = JSON.parse(data) } catch { return }
     if (event.type === 'response.output_item.done') {
      if (event.item?.type === 'compaction') state.captured = [clone(event.item)]
      else if (state.captured) state.captured.push(clone(event.item))
      if (state.captured && JSON.stringify(state.captured).length > MAX_BYTES) { state.captured = undefined; oversized = true }
     }
     if (event.type === 'response.completed' && event.response?.status === 'completed') state.completed = !oversized
    }
    const stream = response.body.pipeThrough(new TransformStream({
     transform(bytes, controller) {
      controller.enqueue(bytes)
      if (oversized) return
      buffer += decoder.decode(bytes, { stream: true })
      let index; while ((index = buffer.indexOf('\n')) >= 0) { observe(buffer.slice(0, index).trimEnd()); buffer = buffer.slice(index + 1) }
      if (buffer.length > MAX_BYTES) { buffer = ''; oversized = true; state.captured = undefined }
     },
     flush() { buffer += decoder.decode(); if (!oversized && buffer) observe(buffer.trimEnd()) },
    }))
    return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers })
   } }
  },
 }
}
