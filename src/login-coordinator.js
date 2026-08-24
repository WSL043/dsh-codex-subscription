import { assertCodexAuthUrl } from './external-url.js'

const LOGIN_METHODS = new Set(['browser', 'device_code'])
const TERMINAL_PHASES = new Set(['authenticated', 'failed', 'cancelled'])

const publicClone = value => structuredClone(value)
const asObject = value => value !== null && typeof value === 'object' ? value : {}
const ok = value => ({ ok: true, value })
const badRequest = message => ({
  ok: false,
  error: { code: 'bad-request', message, details: { issues: [] } },
})

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

const publicPrompt = prompt => ({
  type: prompt.type,
  message: String(prompt.message ?? ''),
  ...(typeof prompt.placeholder === 'string' ? { placeholder: prompt.placeholder } : {}),
})

function classifyLoginFailure(error) {
  const message = error instanceof Error ? error.message : ''
  if (/token exchange failed/iu.test(message)) return 'token-exchange'
  if (/extract accountId|account[_ -]?id/iu.test(message)) return 'account-claim'
  if (/credential|credentials-local|OAuth JSON/iu.test(message)) return 'credential-store'
  if (/Missing authorization code|State mismatch|callback/iu.test(message)) return 'callback'
  return 'provider'
}

/** Own one host-side login without exposing tokens to the browser client. */
export class CodexLoginCoordinator {
  #sessions = new Map()
  #activeId

  constructor(auth, options = {}) {
    this.auth = auth
    this.createId = options.createId ?? (() => crypto.randomUUID())
  }

  async accountStatus(options) {
    return publicClone(await this.auth.status(options))
  }

  supportState() {
    const active = this.#activeId === undefined ? undefined : this.#sessions.get(this.#activeId)
    if (active === undefined) return { phase: 'idle' }
    return {
      method: active.view.method,
      phase: active.view.phase,
      ...(active.view.phase === 'failed' ? { failure: classifyLoginFailure(active.hostError) } : {}),
    }
  }

  async start({ method }) {
    if (!LOGIN_METHODS.has(method)) throw new Error(`unsupported Codex login method: ${String(method)}`)
    const active = this.#activeId === undefined ? undefined : this.#sessions.get(this.#activeId)
    if (active !== undefined && !TERMINAL_PHASES.has(active.view.phase)) {
      active.view = {
        id: active.view.id,
        provider: 'openai-codex',
        method: active.view.method,
        phase: 'cancelled',
        authenticated: false,
      }
      active.controller.abort(new Error('Codex login replaced by a new attempt'))
    }
    if (active !== undefined) this.#sessions.delete(active.view.id)

    const id = this.createId()
    const ready = deferred()
    const controller = new AbortController()
    const session = {
      controller,
      prompt: undefined,
      ready,
      view: {
        id,
        provider: 'openai-codex',
        method,
        phase: 'starting',
        authenticated: false,
      },
    }
    this.#sessions.set(id, session)
    this.#activeId = id

    const publishReady = () => ready.resolve(publicClone(session.view))
    const interaction = {
      signal: controller.signal,
      prompt: async prompt => {
        controller.signal.throwIfAborted()
        if (prompt.type === 'select') return method
        if (!['manual_code', 'text', 'secret'].includes(prompt.type)) {
          throw new Error(`unsupported Codex auth prompt: ${String(prompt.type)}`)
        }
        const answer = deferred()
        session.prompt = answer
        session.view = {
          ...session.view,
          phase: 'waiting_input',
          prompt: publicPrompt(prompt),
        }
        const abortPrompt = () => answer.reject(controller.signal.reason ?? new Error('login cancelled'))
        controller.signal.addEventListener('abort', abortPrompt, { once: true })
        prompt.signal?.addEventListener('abort', abortPrompt, { once: true })
        publishReady()
        try {
          return await answer.promise
        } finally {
          controller.signal.removeEventListener('abort', abortPrompt)
          prompt.signal?.removeEventListener('abort', abortPrompt)
          if (session.prompt === answer) session.prompt = undefined
        }
      },
      notify: event => {
        if (controller.signal.aborted) return
        if (event.type === 'auth_url') {
          session.view = {
            ...session.view,
            phase: 'waiting_browser',
            authUrl: assertCodexAuthUrl(event.url),
            ...(typeof event.instructions === 'string' ? { instructions: event.instructions } : {}),
          }
        } else if (event.type === 'device_code') {
          session.view = {
            ...session.view,
            phase: 'waiting_device',
            deviceCode: {
              userCode: event.userCode,
              verificationUri: assertCodexAuthUrl(event.verificationUri),
              ...(typeof event.intervalSeconds === 'number' ? { intervalSeconds: event.intervalSeconds } : {}),
              ...(typeof event.expiresInSeconds === 'number' ? { expiresInSeconds: event.expiresInSeconds } : {}),
            },
          }
        } else {
          session.view = { ...session.view, message: String(event.message ?? '') }
        }
        publishReady()
      },
    }

    session.run = Promise.resolve()
      .then(() => this.auth.login(interaction))
      .then(async () => {
        if (controller.signal.aborted) return
        const status = await this.auth.status()
        session.view = {
          id,
          provider: 'openai-codex',
          method,
          phase: 'authenticated',
          authenticated: status.authenticated === true,
          ...(typeof status.expiresAt === 'number' ? { expiresAt: status.expiresAt } : {}),
        }
      })
      .catch(async error => {
        if (controller.signal.aborted) {
          session.view = {
            id,
            provider: 'openai-codex',
            method,
            phase: 'cancelled',
            authenticated: false,
          }
          return
        }
        try {
          const status = await this.auth.status()
          if (status.authenticated === true) {
            session.view = {
              id,
              provider: 'openai-codex',
              method,
              phase: 'authenticated',
              authenticated: true,
              ...(typeof status.expiresAt === 'number' ? { expiresAt: status.expiresAt } : {}),
            }
            return
          }
        } catch {
          // Preserve the provider failure when credential state cannot be read.
        }
        session.view = {
          id,
          provider: 'openai-codex',
          method,
          phase: 'failed',
          authenticated: false,
          error: 'Codex login failed',
        }
        // Provider errors may contain credentials. Keep the diagnostic host-only.
        session.hostError = error
      })
      .finally(publishReady)

    return ready.promise
  }

  read(id) {
    const session = this.#sessions.get(id)
    if (session === undefined) throw new Error('unknown Codex login')
    return publicClone(session.view)
  }

  async submit({ id, value }) {
    const session = this.#sessions.get(id)
    if (session === undefined) throw new Error('unknown Codex login')
    if (session.prompt === undefined || session.view.phase !== 'waiting_input') {
      throw new Error('Codex login is not waiting for input')
    }
    if (typeof value !== 'string' || value.trim() === '') throw new Error('Codex login input is empty')
    const answer = session.prompt
    session.prompt = undefined
    session.view = {
      ...session.view,
      phase: session.view.authUrl === undefined ? 'starting' : 'waiting_browser',
      prompt: undefined,
    }
    answer.resolve(value)
    return this.read(id)
  }

  async cancel(id) {
    const session = this.#sessions.get(id)
    if (session === undefined) throw new Error('unknown Codex login')
    if (!TERMINAL_PHASES.has(session.view.phase)) {
      session.view = {
        id,
        provider: 'openai-codex',
        method: session.view.method,
        phase: 'cancelled',
        authenticated: false,
      }
      session.controller.abort(new Error('Codex login cancelled'))
    }
    return this.read(id)
  }

  async logout(options) {
    if (this.#activeId !== undefined) {
      const active = this.#sessions.get(this.#activeId)
      if (active !== undefined && !TERMINAL_PHASES.has(active.view.phase)) await this.cancel(active.view.id)
    }
    await this.auth.logout(options)
    return this.accountStatus(options)
  }
}

/** Map the loopback-only DSH Connection channel onto the coordinator. */
export function createCodexRpcHandler(coordinator, options = {}) {
  const openExternal = options.openExternal
  return async (endpoint, payload, signal) => {
    try {
      signal.throwIfAborted()
      const input = asObject(payload)
      if (endpoint === 'status') return ok(await coordinator.accountStatus({ signal }))
      if (endpoint === 'login/start') {
        const started = await coordinator.start({ method: input.method })
        if (input.openExternal !== true) return ok(started)
        const url = started.authUrl ?? started.deviceCode?.verificationUri
        if (typeof url !== 'string' || openExternal === undefined) {
          return ok({ ...started, externalOpened: false })
        }
        try {
          await openExternal(url)
          return ok({ ...started, externalOpened: true })
        } catch {
          return ok({ ...started, externalOpened: false })
        }
      }
      if (endpoint === 'login/status') return ok(coordinator.read(input.id))
      if (endpoint === 'login/submit') return ok(await coordinator.submit({ id: input.id, value: input.value }))
      if (endpoint === 'login/cancel') return ok(await coordinator.cancel(input.id))
      if (endpoint === 'logout') return ok(await coordinator.logout({ signal }))
      return badRequest(`unknown Codex auth endpoint: ${endpoint}`)
    } catch (error) {
      if (signal.aborted) throw error
      // Never reflect provider errors; even bad requests get a bounded message.
      const message = error instanceof Error && /^(unknown|unsupported|a Codex|Codex login)/.test(error.message)
        ? error.message
        : 'Codex request failed'
      return badRequest(message)
    }
  }
}

export const createCodexAuthRpcHandler = createCodexRpcHandler
