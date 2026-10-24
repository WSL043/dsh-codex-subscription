const PARAM = 'codexVoiceSession'
const validSession = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u.test(value)

/** A permalink, never an authentication URL or a native-shell URL. */
export function voiceBrowserUrl(href, sessionId) {
  if (!validSession(sessionId)) return undefined
  try {
    const url = new URL(href)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined
    url.search = ''; url.hash = ''
    url.searchParams.set(PARAM, sessionId)
    return url.href
  } catch { return undefined }
}

/** Let the host open its own session; consume only after that operation succeeds. */
export async function restoreVoiceConversation({ href, workspace, history, sessions, signal }) {
  const url = new URL(href)
  const sessionId = url.searchParams.get(PARAM)
  if (!validSession(sessionId) || typeof workspace?.openSession !== 'function') return false
  const reference = sessions?.retain(sessionId, { source: 'controllerOperation' })
  try {
    if (reference) await reference.ready
    signal?.throwIfAborted()
    await workspace.openSession(sessionId)
    url.searchParams.delete(PARAM)
    history.replaceState(history.state, '', url.href)
    return true
  } finally { reference?.release() }
}
