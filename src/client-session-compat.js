// Keep version-dependent navigation and lifetime ownership at one boundary.
export async function withComposerSession(sessions, id, operation) {
  const reference = typeof sessions.retain === 'function'
    ? sessions.retain(id, { source: 'controllerOperation' }) : undefined
  try {
    if (reference) await reference.ready
    const context = reference ? reference.binding.ctx : sessions.scope(id)
    if (!context) throw new Error('Image composer is unavailable')
    return await operation(context)
  } finally { reference?.release() }
}

export function openComposerSession(sessions, workspace, id) {
  if (typeof workspace?.openSession === 'function') workspace.openSession(id)
  else if (typeof sessions.open === 'function') sessions.open(id)
  else throw new Error('Session navigation is unavailable')
}

export function createSessionOpeners() {
  const entries = new Map()
  return {
    register(id, callback) {
      const callbacks = entries.get(id) ?? new Set()
      entries.set(id, callbacks)
      callbacks.add(callback)
      return () => {
        callbacks.delete(callback)
        if (!callbacks.size) entries.delete(id)
      }
    },
    has: id => entries.has(id),
    get: id => [...(entries.get(id) ?? [])].at(-1),
    clear: () => entries.clear(),
  }
}
