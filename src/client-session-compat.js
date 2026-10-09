// Keep session navigation and lifetime ownership at one boundary.
export async function withComposerSession(sessions, id, operation) {
  if (typeof sessions?.retain !== 'function') throw new Error('Image composer is unavailable')
  const reference = sessions.retain(id, { source: 'controllerOperation' })
  try {
    await reference.ready
    const context = reference.binding.ctx
    if (!context) throw new Error('Image composer is unavailable')
    return await operation(context)
  } finally { reference.release() }
}

export function openComposerSession(_sessions, workspace, id) {
  if (typeof workspace?.openSession !== 'function') throw new Error('Session navigation is unavailable')
  workspace.openSession(id)
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
