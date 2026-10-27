import { createRequire } from 'node:module'

const unavailableModule = (error, id) => error?.code === 'MODULE_NOT_FOUND'
  && error.message?.startsWith(`Cannot find module '${id}'`)
  || error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
  && error.message?.includes("'./message-projections'")
  && error.message.replaceAll('\\', '/').includes('/@deepseek-ai/dsh-session-format-catalog/package.json')
const failure = (code, message) => Object.assign(new Error(message), { code })

/** Read a detached native observation. No agent attachment or private log reader. */
export function createRemoteHistorySource({ query, loadModule = createRequire(import.meta.url) }) {
  const derived = new WeakMap()
  let sdk
  const modules = () => {
    if (sdk) return sdk
    const load = id => {
      try { return loadModule(id) }
      catch (error) { if (!unavailableModule(error, id)) throw error }
    }
    const session = load('@deepseek-ai/dsh-session')
    if (!session) return undefined
    const catalog = load('@deepseek-ai/dsh-session-format-catalog/message-projections')
    if (typeof session.foldSurface !== 'function' || typeof session.deriveEventMessage !== 'function'
      || !Array.isArray(catalog?.currentSessionMessageProjections)) return undefined
    sdk = { ...session, projections: catalog.currentSessionMessageProjections }
    return sdk
  }
  return Object.freeze({
    async read(id, { signal } = {}) {
      signal?.throwIfAborted()
      const service = query()
      if (typeof service?.observeSession !== 'function') return undefined
      const native = modules()
      if (!native) return undefined
      const source = await service.observeSession(id, { signal, projectionMode: 'none' })
      try {
        signal?.throwIfAborted()
        const header = source?.header
        if (header?.id !== id) throw failure('SESSION_QUERY_SOURCE_CONFLICT', 'Session observation identity does not match the thread')
        if (header.origin === 'subagent' || typeof header.cwd !== 'string' || header.cwd.trim() === '') {
          throw failure('SESSION_QUERY_SESSION_NOT_FOUND', 'Thread is not available')
        }
        const events = source.events
        if (!Array.isArray(events)) throw failure('SESSION_QUERY_CORRUPT_SESSION', 'Session observation has no event array')
        let messages = derived.get(events)
        if (!messages) {
          const surface = native.foldSurface(events, native.projections)
          messages = Object.freeze(surface.nodes.map(seq => native.deriveEventMessage(events[seq], surface.projectedMessages)).filter(Boolean))
          // Prepared observations share immutable arrays. Live mutable arrays must
          // be folded again, rather than confusing tail growth with a cache hit.
          if (Object.isFrozen(events)) derived.set(events, messages)
        }
        signal?.throwIfAborted()
        return { meta: header, messages, events, cursor: source.cursor, source: source.source, revision: source.revision, inheritedEventCount: source.inheritedEventCount }
      } finally { source?.[Symbol.dispose]?.() }
    },
  })
}
