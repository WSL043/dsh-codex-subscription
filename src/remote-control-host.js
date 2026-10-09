// Codex app-server JSON-RPC host for ChatGPT Remote Control clients.
// Messages carry no "jsonrpc" field: {id,method,params}, {method,params}, {id,result}, {id,error}.

import { randomUUID } from 'node:crypto'

const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603
const MAX_SEEN = 128
// Called constantly by the phone and never interesting when debugging.
const QUIET = new Set(['command/exec', 'thread/attachment/list', 'thread/list', 'thread/queue/list', 'threadSection/list', 'config/read', 'configRequirements/read'])

export class RpcError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
export const invalidParams = message => new RpcError(INVALID_PARAMS, message)

/**
 * One host per relay; each remote client gets its own connection.
 * @param {{ methods: Record<string, (params: any, context: { client: object, signal: AbortSignal, notify: (method: string, params?: object) => Promise<void> }) => any>, notifications?: Record<string, Function>, onConnection?: (client: object) => void, onClose?: (client: object) => void }} options
 */
export function createRemoteControlHost({ methods, notifications = {}, onConnection, onActive, onClose, debug = false }) {
  const seen = new Map()
  const trace = []
  const record = entry => { if (!debug) return; trace.push({ at: Date.now(), ...entry }); if (trace.length > 60) trace.shift() }
  const note = (kind, method) => {
    const key = `${kind}:${method}`
    if (!seen.has(key) && seen.size >= MAX_SEEN) return
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return Object.freeze({
    /** Methods remote clients called, for diagnostics; never params or content. */
    seen: () => Object.fromEntries(seen),
    /** Development trace of recent calls; only filled when debug is on. */
    trace: () => [...trace],
    serve(client) {
      const aborts = new Set()
      const pending = new Map() // server -> client requests awaiting an answer
      let initialized = false
      let active = false
      const notify = async (method, params) => { await client.send(params === undefined ? { method } : { method, params }) }
      /** Ask the phone something (approvals); settles with its result or rejects. */
      const ask = (method, params, signal) => new Promise((resolve, reject) => {
        const id = `s${randomUUID()}`
        const done = () => { pending.delete(id); signal?.removeEventListener('abort', onAbort) }
        const onAbort = () => { done(); reject(new RpcError(-32800, 'Request cancelled')) }
        if (signal?.aborted) return onAbort()
        signal?.addEventListener('abort', onAbort, { once: true })
        record({ method: `ask:${method}`, params: JSON.stringify(params ?? null).slice(0, 400) })
        pending.set(id, { resolve: value => { record({ method: `answer:${method}`, params: JSON.stringify(value ?? null).slice(0, 400) }); done(); resolve(value) }, reject: error => { record({ method: `answer:${method}`, error: String(error?.message ?? error).slice(0, 200) }); done(); reject(error) } })
        client.send({ id, method, params }).catch(error => { done(); reject(error) })
      })
      // Bridges keep only the notify function per connection, so it also carries the ask.
      notify.ask = ask
      const context = { client, notify, ask }
      onConnection?.(client)
      const reply = async (id, result) => { await client.send({ id, result }) }
      const fail = async (id, error) => {
        const known = error instanceof RpcError
        await client.send({ id, error: { code: known ? error.code : INTERNAL_ERROR, message: known ? error.message : 'Request failed' } })
      }
      return {
        receive(message) {
          if (message !== null && typeof message === 'object' && typeof message.method !== 'string' && message.id !== undefined) {
            const waiting = pending.get(message.id)
            if (waiting) {
              if (message.error) waiting.reject(new RpcError(message.error.code ?? INTERNAL_ERROR, String(message.error.message ?? 'Request failed')))
              else waiting.resolve(message.result)
            }
            return
          }
          if (message === null || typeof message !== 'object' || typeof message.method !== 'string') return
          const { id, method, params } = message
          if (id === undefined) {
            note('notify', method)
            if (method === 'initialized') initialized = true
            void notifications[method]?.(params, { ...context, signal: new AbortController().signal })
            return
          }
          note('request', method)
          // The relay probes every host with `initialize`; a real client asks for more.
          if (!active && method !== 'initialize') { active = true; onActive?.(client) }
          if (debug && !QUIET.has(method)) record({ method: `request:${method}`, params: JSON.stringify(params ?? null).slice(0, 700) })
          const handler = methods[method]
          if (!handler) {
            record({ method, missing: true, params: JSON.stringify(params ?? null).slice(0, 600) })
            void fail(id, new RpcError(METHOD_NOT_FOUND, `Method not found: ${method}`)).catch(() => {})
            return
          }
          if (method !== 'initialize' && !initialized && method !== 'ping') {
            // Clients send `initialized` right after `initialize`; accept early requests anyway.
            initialized = true
          }
          const controller = new AbortController()
          aborts.add(controller)
          void Promise.resolve()
            .then(() => handler(params, { ...context, signal: controller.signal }))
            .then(result => reply(id, result ?? {}), error => { if (!QUIET.has(method)) record({ method, error: String(error?.message ?? error).slice(0, 300), params: JSON.stringify(params ?? null).slice(0, 600) }); return fail(id, error) })
            .catch(() => {})
            .finally(() => aborts.delete(controller))
        },
        close() {
          for (const waiting of [...pending.values()]) waiting.reject(new RpcError(-32800, 'Client disconnected'))
          for (const controller of aborts) controller.abort()
          aborts.clear()
          onClose?.(client, notify)
        },
      }
    },
  })
}
