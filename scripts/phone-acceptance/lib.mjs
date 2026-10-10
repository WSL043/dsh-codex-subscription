// Stand-in for the OpenAI relay plus a scripted "phone" that speaks the Codex app-server protocol.
// Every message the phone receives is checked against the official Codex JSON schemas.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

// ws and ajv come from the repository's own dependencies.
const require = createRequire(new URL('../../package.json', import.meta.url))
const { WebSocketServer, WebSocket } = require('ws')
const Ajv = require('ajv')

const SCHEMAS = new URL('../../tests/fixtures/codex-app-server-schema/', import.meta.url)
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false })
const cache = new Map()
export function schema(name) {
  if (cache.has(name)) return cache.get(name)
  let text
  try { text = readFileSync(new URL(`${name}.json`, SCHEMAS), 'utf8') } catch { cache.set(name, undefined); return undefined }
  const validate = ajv.compile(JSON.parse(text))
  cache.set(name, validate)
  return validate
}

const RESPONSE_NAMES = {
  initialize: 'InitializeResponse', 'account/read': 'GetAccountResponse', 'account/rateLimits/read': 'GetAccountRateLimitsResponse',
  fuzzyFileSearch: 'FuzzyFileSearchResponse', 'thread/name/set': 'ThreadSetNameResponse', 'thread/turns/list': 'ThreadTurnsListResponse',
  'thread/settings/update': 'ThreadSettingsUpdateResponse', 'project/list': 'ProjectListResponse', 'project/read': 'ProjectReadResponse',
}
const camel = method => method.split('/').map(part => part[0].toUpperCase() + part.slice(1)).join('')
export const responseSchemaName = method => RESPONSE_NAMES[method] ?? `${camel(method)}Response`

export function check(label, validate, value, results) {
  if (!validate) { results.push({ label, status: 'no-schema' }); return true }
  const ok = validate(value)
  results.push(ok ? { label, status: 'ok' } : { label, status: 'INVALID', errors: validate.errors.slice(0, 14).map(error => `${error.instancePath || '/'} ${error.message} ${JSON.stringify(error.params).slice(0, 120)}`), sample: JSON.stringify(value).slice(0, 300) })
  return ok
}

/** Local stand-in relay: REST enrolment for the host, a host socket and a phone socket joined together. */
export async function startRelay(port) {
  const http = createServer((request, response) => {
    const path = request.url.split('?')[0]
    const json = value => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)) }
    const expires = new Date(Date.now() + 3_600_000).toISOString()
    if (request.method === 'POST' && /server\/(enroll|refresh)$/u.test(path)) return json({ environment_id: 'env-fake', server_id: 'srv-fake', remote_control_token: 'tok-fake', expires_at: expires })
    if (request.method === 'POST' && /server\/pair$/u.test(path)) return json({ pairing_code: '123456', manual_pairing_code: 'ABCD-EFGH', server_id: 'srv-fake', expires_at: expires })
    if (/\/clients/u.test(path)) return json({ items: [] })
    response.writeHead(404); response.end()
  })
  const hostSockets = new WebSocketServer({ noServer: true })
  const phoneSockets = new WebSocketServer({ noServer: true })
  const state = { host: undefined, phone: undefined, hostConnections: 0, hostHeaders: undefined, dropHostAfter: undefined, toHostSeq: 0, log: [] }
  http.on('upgrade', (request, socket, head) => {
    const path = request.url.split('?')[0]
    if (path.endsWith('/wham/remote/control/server')) {
      hostSockets.handleUpgrade(request, socket, head, ws => {
        state.hostHeaders = request.headers
        state.host = ws
        state.hostConnections += 1
        ws.on('message', data => { try { state.phone?.send(String(data)) } catch { /* phone gone */ } })
        ws.on('close', () => { if (state.host === ws) state.host = undefined })
        state.onHostConnected?.(ws)
      })
    } else if (path === '/phone') {
      phoneSockets.handleUpgrade(request, socket, head, ws => {
        state.phone = ws
        ws.on('message', data => { try { state.host?.send(String(data)) } catch { /* host gone */ } })
        state.onPhoneConnected?.(ws)
      })
    } else socket.destroy()
  })
  await new Promise(resolve => http.listen(port, '127.0.0.1', resolve))
  return { state, close: () => new Promise(resolve => { try { state.host?.terminate(); state.phone?.terminate() } catch { /* done */ } http.close(() => resolve()) }) }
}

/** A scripted phone. */
export function createPhone(port, results) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/phone`)
  const clientId = 'phone-1'
  const streamId = `stream-${randomUUID()}`
  let seq = 0
  let nextId = 1
  const waiting = new Map()
  const notifications = []
  const serverRequests = []
  const assemblies = new Map()
  const handlers = new Map() // server request method -> async (params) => result
  const listeners = new Set()
  const validators = { notification: schema('ServerNotification'), request: schema('ServerRequest') }
  const send = message => ws.send(JSON.stringify({ type: 'client_message', client_id: clientId, stream_id: streamId, seq_id: ++seq, message }))
  const handle = async message => {
    if (message.id !== undefined && message.method === undefined) {
      const entry = waiting.get(message.id)
      if (entry) { waiting.delete(message.id); entry.resolve(message) }
      return
    }
    if (message.method !== undefined && message.id !== undefined) {
      check(`server request ${message.method}`, validators.request, message, results)
      serverRequests.push(message)
      const handler = handlers.get(message.method)
      let result
      try { result = handler ? await handler(message.params) : undefined } catch (error) { send({ id: message.id, error: { code: -32000, message: String(error?.message) } }); return }
      if (result === undefined) send({ id: message.id, error: { code: -32601, message: 'no handler' } })
      else send({ id: message.id, result })
      return
    }
    if (message.method !== undefined) {
      notifications.push(message)
      check(`notification ${message.method}`, validators.notification, message, results)
      for (const listener of [...listeners]) listener(message)
    }
  }
  ws.on('message', data => {
    const envelope = JSON.parse(String(data))
    if (envelope.type === 'server_message') {
      ws.send(JSON.stringify({ type: 'ack', client_id: clientId, stream_id: envelope.stream_id, seq_id: envelope.seq_id }))
      void handle(envelope.message)
    } else if (envelope.type === 'server_message_chunk') {
      const key = `${envelope.stream_id}:${envelope.seq_id}`
      const entry = assemblies.get(key) ?? { parts: [] }
      assemblies.set(key, entry)
      entry.parts[envelope.segment_id] = envelope.message_chunk_base64
      if (entry.parts.length === envelope.segment_count && entry.parts.every(Boolean)) {
        assemblies.delete(key)
        ws.send(JSON.stringify({ type: 'ack', client_id: clientId, stream_id: envelope.stream_id, seq_id: envelope.seq_id, segment_id: envelope.segment_count - 1 }))
        void handle(JSON.parse(Buffer.concat(entry.parts.map(part => Buffer.from(part, 'base64'))).toString('utf8')))
      }
    }
  })
  const call = (method, params = {}, { timeoutMs = 60_000, validate = true } = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`timeout waiting for ${method}`)) }, timeoutMs)
    waiting.set(id, { resolve: message => {
      clearTimeout(timer)
      if (message.error) { results.push({ label: `response ${method}`, status: 'ERROR', errors: [`${message.error.code} ${message.error.message}`] }); return resolve({ error: message.error }) }
      if (validate) check(`response ${method}`, schema(responseSchemaName(method)), message.result, results)
      resolve(message.result)
    } })
    send({ id, method, params })
  })
  const waitFor = (predicate, timeoutMs = 120_000) => new Promise((resolve, reject) => {
    const found = notifications.find(predicate)
    if (found) return resolve(found)
    const timer = setTimeout(() => { listeners.delete(listener); reject(new Error('timeout waiting for notification')) }, timeoutMs)
    const listener = message => { if (predicate(message)) { clearTimeout(timer); listeners.delete(listener); resolve(message) } }
    listeners.add(listener)
  })
  return {
    ready: new Promise(resolve => ws.on('open', resolve)),
    call, waitFor, notifications, serverRequests, handlers, send,
    notify: (method, params) => send(params === undefined ? { method } : { method, params }),
    since: () => notifications.length,
    close: () => ws.close(),
  }
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
