import { PassThrough } from 'node:stream'

const AUTH_ERROR = 'Codex subscription authorization failed; check the selected account'

/** Keep refresh rotation in the plugin's existing serialized credential store. */
export async function createSubagentTokens({ resolveAuth, store, refresh, signal }) {
  signal.throwIfAborted()
  await resolveAuth()
  const initial = await store.read('openai-codex', { signal })
  if (initial?.type !== 'oauth' || !initial.accountId || !initial.access) throw new Error(AUTH_ERROR)
  const accountId = initial.accountId
  let access = initial.access
  return async (previousAccountId, forceRefresh = false) => {
    signal.throwIfAborted()
    if (previousAccountId !== undefined && previousAccountId !== accountId) throw new Error(AUTH_ERROR)
    let credential
    if (previousAccountId !== undefined || forceRefresh) {
      const rejectedAccess = access
      credential = await store.modify('openai-codex', async current => {
        if (current?.accountId !== accountId) throw new Error(AUTH_ERROR)
        if (current.access !== rejectedAccess) return current
        const next = await refresh(current)
        if (next?.accountId !== accountId) throw new Error(AUTH_ERROR)
        return next
      }, { signal })
    } else credential = await store.read('openai-codex', { signal })
    signal.throwIfAborted()
    if (credential?.accountId !== accountId || !credential.access) throw new Error(AUTH_ERROR)
    access = credential.access
    return { accessToken: access, chatgptAccountId: accountId }
  }
}

/**
 * Authenticate the official DSH provider's private app-server connection.
 * DSH still owns framing, process containment, turns, tool approvals and disposal.
 * Only the documented external-auth handshake and thread policy are adapted.
 * No token is passed in argv, environment, logs or a second auth.json.
 */
export function authenticatedSubagentChild(child, { Transport, getTokens, thread, signal }) {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const host = new Transport(stdin, stdout)
  const server = new Transport(child.stdout, child.stdin)
  let initialized = false
  let authenticated
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    host.close()
    server.close()
    stdin.destroy()
    stdout.end()
  }
  const authorize = async (previousAccountId, refresh = false) => {
    try { return await getTokens(previousAccountId, refresh) } catch { throw new Error(AUTH_ERROR) }
  }
  const login = () => authenticated ??= (async () => {
    const tokens = await authorize()
    signal.throwIfAborted()
    try {
      return await server.request('account/login/start', { type: 'chatgptAuthTokens', ...tokens },
        AbortSignal.any([signal, AbortSignal.timeout(10_000)]))
    } catch { throw new Error(AUTH_ERROR) }
  })()
  host.onRequest(async (method, params) => {
    if (method === 'initialize') {
      const result = await server.request(method, {
        ...params, capabilities: { ...params.capabilities, experimentalApi: true },
      }, signal)
      initialized = true
      return result
    }
    if (method === 'thread/start') {
      if (!initialized) throw new Error('Codex initialization incomplete')
      await login()
      return server.request(method, { ...params, ...thread }, signal)
    }
    return server.request(method, params, signal)
  })
  host.onNotification((method, params) => server.notify(method, params))
  server.onRequest((method, params) => method === 'account/chatgptAuthTokens/refresh'
    ? authorize(params.previousAccountId ?? undefined, true)
    : host.request(method, params, signal))
  server.onNotification((method, params) => host.notify(method, params))
  host.start()
  server.start()
  child.done.then(close, close)
  return new Proxy(child, {
    get(target, key) {
      if (key === 'stdin') return stdin
      if (key === 'stdout') return stdout
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
