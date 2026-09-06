const CHANNEL = '/codex-subscription'
const DEFAULT_TIMEOUT_MS = 10_000

const STATUS_ERROR_CODES = new Set([
  'credential-unavailable',
  'credential-malformed',
  'transport',
  'timeout',
  'unknown',
])

const STATUS_ERROR_MESSAGES = new Map([
  ['Codex account credentials are unavailable', 'credential-unavailable'],
  ['Codex account credentials are malformed', 'credential-malformed'],
  ['Codex account status service is unavailable', 'transport'],
  ['Could not read Codex account status', 'unknown'],
])

const TIMEOUT_CODES = new Set(['TIMEOUT', 'ETIMEDOUT', 'ERR_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT'])
const TRANSPORT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'NETWORK',
  'NETWORK_ERROR',
  'TRANSPORT',
  'CONNECTION_CLOSED',
  'DISCONNECTED',
])

const asCode = value => typeof value === 'string' ? value.trim().toLowerCase() : undefined

function rpcError(response) {
  const code = asCode(response?.error?.code)
  const message = typeof response?.error?.message === 'string' ? response.error.message : ''
  const error = new Error('Codex account status request failed')
  error.code = code === 'internal' && STATUS_ERROR_MESSAGES.has(message)
    ? STATUS_ERROR_MESSAGES.get(message)
    : 'unknown'
  return error
}

function timeoutError() {
  const error = new Error('Codex account status request timed out')
  error.code = 'timeout'
  error.name = 'TimeoutError'
  return error
}

export function classifyAccountStatusError(error) {
  const code = typeof error?.code === 'string' ? error.code.trim().toUpperCase() : ''
  if (code === 'TIMEOUT' || TIMEOUT_CODES.has(code) || error?.name === 'TimeoutError') return 'timeout'
  if (STATUS_ERROR_CODES.has(asCode(error?.code))) return asCode(error.code)
  if (TRANSPORT_CODES.has(code) || error?.name === 'NetworkError') return 'transport'
  return 'unknown'
}

function publicAccountStatusError(error) {
  return Object.freeze({ code: classifyAccountStatusError(error) })
}

/** Own the account-status request lifecycle independently from account actions. */
export function createAccountStatusController(rpc, options = {}) {
  const request = options.request ?? (() => rpc.call(CHANNEL, 'status', {}))
  const scheduleTimeout = options.setTimeout ?? setTimeout
  const cancelTimeout = options.clearTimeout ?? clearTimeout
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Account status timeout must be positive')

  let snapshot = Object.freeze({ status: 'loading', account: undefined, error: undefined, retrying: false })
  let generation = 0
  let active
  let disposed = false
  const listeners = new Set()

  const publish = next => {
    snapshot = Object.freeze(next)
    for (const listener of [...listeners]) listener()
  }

  const load = () => {
    if (disposed) return Promise.resolve(undefined)
    if (active !== undefined) return active.promise

    const id = ++generation
    const retrying = snapshot.error !== undefined
    publish({
      status: retrying ? 'error' : 'loading',
      account: retrying ? snapshot.account : undefined,
      error: retrying ? snapshot.error : undefined,
      retrying: true,
    })

    const controller = new AbortController()
    let timer
    let onAbort
    const cancelled = new Promise((resolve, reject) => {
      onAbort = () => reject(controller.signal.reason)
      controller.signal.addEventListener('abort', onAbort, { once: true })
      if (controller.signal.aborted) onAbort()
    })
    const timeout = new Promise((resolve, reject) => {
      timer = scheduleTimeout(() => {
        const error = timeoutError()
        controller.abort(error)
        reject(error)
      }, timeoutMs)
    })
    const work = Promise.resolve().then(() => request(controller.signal)).then(response => {
      if (!response?.ok) throw rpcError(response)
      return response.value
    })
    const promise = Promise.race([work, timeout, cancelled])
      .then(account => {
        if (disposed || id !== generation || controller.signal.aborted) return undefined
        if (account === null || typeof account !== 'object' || Array.isArray(account)
          || typeof account.authenticated !== 'boolean') throw new Error('Invalid account status')
        publish({ status: 'ready', account, error: undefined, retrying: false })
        return account
      })
      .catch(error => {
        if (disposed || id !== generation || controller.signal.aborted && error?.code !== 'timeout') return undefined
        publish({
          status: 'error',
          account: undefined,
          error: publicAccountStatusError(error),
          retrying: false,
        })
        return undefined
      })
      .finally(() => {
        cancelTimeout(timer)
        controller.signal.removeEventListener('abort', onAbort)
        if (active?.id === id) active = undefined
      })
    active = { id, controller, promise }
    return promise
  }

  const acceptAccount = account => {
    if (disposed) return false
    generation += 1
    active?.controller.abort(new Error('Account status superseded by an account action'))
    active = undefined
    publish({ status: 'ready', account, error: undefined, retrying: false })
    return true
  }

  const reload = () => {
    if (disposed) return Promise.resolve(undefined)
    if (active !== undefined) {
      generation += 1
      active.controller.abort(new Error('Account status reload superseded the previous request'))
      active = undefined
    }
    return load()
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    generation += 1
    active?.controller.abort(new Error('Account status controller disposed'))
    active = undefined
    listeners.clear()
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    load,
    retry: load,
    reload,
    acceptAccount,
    dispose,
  })
}
