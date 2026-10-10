// Host side of ChatGPT's Remote Control: enroll this machine, hand out a pairing
// code, then relay Codex app-server JSON-RPC between the ChatGPT mobile app and a
// host handler. The wire format follows openai/codex (Apache-2.0) and is the same
// one the ChatGPT desktop app speaks; OpenAI does not document third-party hosts.

import { randomUUID } from 'node:crypto'

export const REMOTE_CONTROL_BASE_URL = 'https://chatgpt.com/backend-api/'
const PROTOCOL_VERSION = '3'
const MAX_SEGMENT_BYTES = 150 * 1024
const TARGET_SEGMENT_BYTES = 100 * 1024
const MAX_MESSAGE_BYTES = 100 * 1024 * 1024
const MAX_CHUNKS = 1024
const INITIAL_RECONNECT_MS = 1_000
const CONFLICT_RENEW_MS = 15 * 60_000
const MAX_RECONNECT_MS = 30_000
const REQUEST_TIMEOUT_MS = 30_000
const REFRESH_MARGIN_MS = 5 * 60_000
// Same liveness rules as the Codex app server: ping every 10 s, drop a socket silent for 60 s,
// and only treat a connection as healthy (reset the backoff) once it has lasted a minute.
const PING_MS = 10_000
const PONG_TIMEOUT_MS = 60_000
const STABLE_MS = 60_000
const MAX_BUFFERED_ITEMS = 2_000
const MAX_BUFFERED_BYTES = 32 * 1024 * 1024
const BUFFER_IDLE_MS = 30 * 60_000
const RETRY_AFTER_JITTER_MS = 30_000

/** Milliseconds a server asked us to wait (Retry-After as seconds or a date), when it did. */
export function retryAfterMs(value, at = Date.now()) {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000))
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - at)
}

export class RemoteControlError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RemoteControlError'
    this.code = code
  }
}

export function remoteControlEndpoints(base = REMOTE_CONTROL_BASE_URL) {
  const root = new URL(base)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(root.hostname)
  if (!(root.protocol === 'https:' && (root.hostname === 'chatgpt.com' || root.hostname.endsWith('.chatgpt.com')))
    && !(local && root.protocol === 'http:')) {
    throw new RemoteControlError('unsupported-host', 'Remote Control only talks to chatgpt.com')
  }
  if (!root.pathname.endsWith('/')) root.pathname += '/'
  const at = suffix => new URL(suffix, root)
  const websocket = at('wham/remote/control/server')
  websocket.protocol = root.protocol === 'https:' ? 'wss:' : 'ws:'
  return Object.freeze({
    enroll: at('wham/remote/control/server/enroll'),
    refresh: at('wham/remote/control/server/refresh'),
    pair: at('wham/remote/control/server/pair'),
    clients: environment => at(`wham/remote/control/environments/${encodeURIComponent(environment)}/clients`),
    websocket,
  })
}

const text = value => typeof value === 'string' && value.length > 0 ? value : undefined

function enrollment(value) {
  const environmentId = text(value?.environment_id)
  const serverId = text(value?.server_id)
  const token = text(value?.remote_control_token)
  const expiresAt = Date.parse(value?.expires_at)
  if (!environmentId || !serverId || !token || !Number.isFinite(expiresAt)) {
    throw new RemoteControlError('bad-response', 'Remote Control returned an unexpected enrollment')
  }
  return { environmentId, serverId, token, expiresAt }
}

/**
 * @param {{
 *   credentials: (signal?: AbortSignal) => Promise<{ access?: string, accountId?: string }>,
 *   fetch?: typeof fetch,
 *   WebSocket: new (url: string, options: object) => any,
 *   installationId: string,
 *   hostName: string,
 *   userAgent: string,
 *   serve: (client: { send: (message: object) => Promise<void>, close: () => void, id: string }) => { receive: (message: object) => void, close: () => void },
 *   base?: string,
 *   now?: () => number,
 *   wait?: (ms: number, signal: AbortSignal) => Promise<void>,
 * }} options
 */
export function createRemoteControlRelay(options) {
  let installation = options.installationId
  const endpoints = remoteControlEndpoints(options.base)
  const doFetch = options.fetch ?? globalThis.fetch
  const now = options.now ?? Date.now
  const wait = options.wait ?? ((ms, signal) => new Promise(resolve => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
  }))
  let enrolled
  let stop
  let running
  let socket
  const clients = new Map()
  const assemblies = new Map()
  const sequences = new Map()
  const outbound = new Map() // client+stream -> server messages the phone has not acknowledged
  const lastInbound = new Map() // client+stream -> newest client sequence delivered
  const state = { status: 'stopped', connectedAt: undefined, lastError: undefined, reconnects: 0 }

  const request = async (url, init, signal) => {
    const response = await doFetch(url, {
      ...init,
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      const error = new RemoteControlError(response.status === 401 || response.status === 403 ? 'unauthorized' : 'http-error',
        `Remote Control request failed (HTTP ${response.status})`)
      if (response.status === 429 || response.status >= 500) error.retryAfterMs = retryAfterMs(response.headers?.get?.('retry-after'), now())
      throw error
    }
    return response.json()
  }

  const accountHeaders = (access, accountId) => ({ authorization: `Bearer ${access}`, 'chatgpt-account-id': accountId, accept: 'application/json', 'user-agent': options.userAgent })

  const ensureEnrollment = async signal => {
    if (enrolled && enrolled.expiresAt > now() + REFRESH_MARGIN_MS) return enrolled
    const { access, accountId } = await options.credentials(signal)
    if (!access || !accountId) throw new RemoteControlError('not-signed-in', 'ChatGPT subscription is not signed in')
    const headers = {
      authorization: `Bearer ${access}`,
      'chatgpt-account-id': accountId,
      'content-type': 'application/json',
      'user-agent': options.userAgent,
      'x-codex-installation-id': installation,
    }
    const refresh = enrolled !== undefined
    const body = refresh
      ? { installation_id: installation, server_id: enrolled.serverId }
      : { app_server_version: options.userAgent.split('/').at(-1), arch: process.arch, installation_id: installation, name: options.hostName, os: process.platform }
    const next = enrollment(await request(refresh ? endpoints.refresh : endpoints.enroll, { method: 'POST', headers, body: JSON.stringify(body) }, signal))
    if (refresh && next.serverId !== enrolled.serverId) throw new RemoteControlError('bad-response', 'Remote Control returned a mismatched enrollment')
    enrolled = next
    return enrolled
  }

  /** Start a pairing: the code goes into a QR; the manual code can be typed in the app. */
  const pair = async signal => {
    const current = await ensureEnrollment(signal)
    const value = await request(endpoints.pair, {
      method: 'POST',
      headers: { authorization: `Bearer ${current.token}`, 'content-type': 'application/json', 'user-agent': options.userAgent },
      body: JSON.stringify({ manual_code: true }),
    }, signal)
    const pairingCode = text(value?.pairing_code)
    const expiresAt = Date.parse(value?.expires_at)
    if (!pairingCode || value?.server_id !== current.serverId || !Number.isFinite(expiresAt)) {
      throw new RemoteControlError('bad-response', 'Remote Control returned an unexpected pairing')
    }
    return { pairingCode, manualCode: text(value?.manual_pairing_code) ?? null, expiresAt }
  }

  /** The phones paired with this host, from the same account endpoint Codex uses. */
  const listClients = async signal => {
    const current = await ensureEnrollment(signal)
    const { access, accountId } = await options.credentials(signal)
    if (!access || !accountId) throw new RemoteControlError('not-signed-in', 'ChatGPT subscription is not signed in')
    const value = await request(endpoints.clients(current.environmentId), { method: 'GET', headers: accountHeaders(access, accountId) }, signal)
    return (Array.isArray(value?.items) ? value.items : []).filter(item => text(item?.client_id)).map(item => ({
      clientId: item.client_id, name: text(item.display_name) ?? text(item.device_model) ?? null, platform: text(item.platform) ?? null,
      osVersion: text(item.os_version) ?? null, appVersion: text(item.app_version) ?? null, lastSeenAt: Number.isFinite(Date.parse(item.last_seen_at)) ? Date.parse(item.last_seen_at) : null,
    }))
  }
  /** Remove one paired phone; it has to be paired again to come back. */
  const revokeClient = async (clientId, signal) => {
    if (typeof clientId !== 'string' || clientId === '' || clientId.length > 200) throw new RemoteControlError('bad-request', 'A client id is required')
    const current = await ensureEnrollment(signal)
    const { access, accountId } = await options.credentials(signal)
    if (!access || !accountId) throw new RemoteControlError('not-signed-in', 'ChatGPT subscription is not signed in')
    const target = new URL(`${endpoints.clients(current.environmentId).href}/${encodeURIComponent(clientId)}`)
    const response = await doFetch(target, { method: 'DELETE', headers: accountHeaders(access, accountId), redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!response.ok) throw new RemoteControlError(response.status === 401 || response.status === 403 ? 'unauthorized' : 'http-error', `Remote Control request failed (HTTP ${response.status})`)
    closeClient(clientId)
  }

  const sendEnvelope = async envelope => {
    if (socket?.readyState !== 1) throw new RemoteControlError('not-connected', 'Remote Control is not connected')
    await new Promise((resolve, reject) => socket.send(JSON.stringify(envelope), error => error ? reject(error) : resolve()))
  }

  // What was sent to a phone stays here until the phone acknowledges it, and is sent again after a
  // reconnect (the same rule the Codex app server follows), so a short drop loses nothing.
  const remember = (key, sequence, segment, encoded) => {
    const stream = outbound.get(key) ?? { items: [], bytes: 0, touched: now() }
    outbound.set(key, stream)
    stream.items.push({ sequence, segment, encoded })
    stream.bytes += encoded.length
    stream.touched = now()
    // Bounded: a phone that never comes back must not grow this without limit; it re-reads the thread when it returns.
    while (stream.items.length > MAX_BUFFERED_ITEMS || stream.bytes > MAX_BUFFERED_BYTES) stream.bytes -= stream.items.shift().encoded.length
  }
  const acknowledge = (key, sequence, segment) => {
    const stream = outbound.get(key)
    if (!stream) return
    stream.items = stream.items.filter(item => !(item.sequence < sequence || (item.sequence === sequence && (segment === undefined || (item.segment ?? 0) <= segment))))
    stream.bytes = stream.items.reduce((total, item) => total + item.encoded.length, 0)
    if (stream.items.length === 0) outbound.delete(key)
  }
  const replay = ws => {
    for (const [key, stream] of outbound) {
      if (now() - stream.touched > BUFFER_IDLE_MS) { outbound.delete(key); continue }
      for (const item of stream.items) ws.send(item.encoded, () => {})
    }
  }

  const sendServerMessage = async (clientId, streamId, message) => {
    const key = `${clientId}\u0000${streamId}`
    // A request to the phone (an approval, a question) is only meaningful while it is connected; its caller handles a drop.
    const isRequest = message?.method !== undefined && message?.id !== undefined
    if (isRequest && socket?.readyState !== 1) throw new RemoteControlError('not-connected', 'Remote Control is not connected')
    const sequence = sequences.get(key) ?? 1
    sequences.set(key, sequence + 1)
    const envelope = { client_id: clientId, message, seq_id: sequence, stream_id: streamId, type: 'server_message' }
    const encoded = JSON.stringify(envelope)
    const put = async text => {
      if (isRequest) return new Promise((resolve, reject) => socket.send(text, error => error ? reject(error) : resolve()))
      remember(key, sequence, undefined, text)
      if (socket?.readyState === 1) await new Promise(resolve => socket.send(text, () => resolve()))
    }
    if (Buffer.byteLength(encoded) <= MAX_SEGMENT_BYTES) return put(encoded)
    const bytes = Buffer.from(JSON.stringify(message))
    if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new RemoteControlError('too-large', 'Remote Control message is too large')
    const chunks = []
    for (let offset = 0; offset < bytes.byteLength; offset += TARGET_SEGMENT_BYTES) chunks.push(bytes.subarray(offset, offset + TARGET_SEGMENT_BYTES).toString('base64'))
    for (const [segmentId, chunk] of chunks.entries()) {
      const text = JSON.stringify({
        client_id: clientId,
        message_chunk_base64: chunk,
        message_size_bytes: bytes.byteLength,
        segment_count: chunks.length,
        segment_id: segmentId,
        seq_id: sequence,
        stream_id: streamId,
        type: 'server_message_chunk',
      })
      if (isRequest) await put(text)
      else { remember(key, sequence, segmentId, text); if (socket?.readyState === 1) await new Promise(resolve => socket.send(text, () => resolve())) }
    }
  }

  const closeClient = (clientId, streamId) => {
    for (const [key, client] of clients) {
      if (key.startsWith(`${clientId}\u0000`) && (streamId === undefined || key === `${clientId}\u0000${streamId}`)) {
        clients.delete(key)
        sequences.delete(key)
        outbound.delete(key)
        lastInbound.delete(key)
        client.close()
      }
    }
  }
  const resetStreams = () => {
    for (const [, client] of clients) client.close()
    clients.clear(); sequences.clear(); outbound.clear(); lastInbound.clear(); assemblies.clear()
  }

  const deliver = async envelope => {
    const streamId = envelope.stream_id ?? randomUUID()
    const key = `${envelope.client_id}\u0000${streamId}`
    let client = clients.get(key)
    if (!client) {
      let closed = false
      const connection = options.serve({
        id: `${envelope.client_id}/${streamId}`,
        send: async message => { if (!closed) await sendServerMessage(envelope.client_id, streamId, message) },
        close: () => { closed = true },
      })
      client = { receive: connection.receive, close: () => { closed = true; connection.close() } }
      clients.set(key, client)
    }
    // After a reconnect the relay may send what we already handled again: acknowledge it, deliver it once.
    const duplicate = Number.isInteger(envelope.seq_id) && (lastInbound.get(key) ?? -1) >= envelope.seq_id
    if (!duplicate) {
      if (Number.isInteger(envelope.seq_id)) lastInbound.set(key, envelope.seq_id)
      client.receive(envelope.message)
    }
    if (Number.isInteger(envelope.seq_id)) {
      await sendEnvelope({ client_id: envelope.client_id, seq_id: envelope.seq_id, stream_id: streamId, type: 'ack' })
    }
  }

  const receiveChunk = envelope => {
    const streamId = envelope.stream_id ?? randomUUID()
    const key = `${envelope.client_id}\u0000${streamId}\u0000${envelope.seq_id ?? 0}`
    const count = envelope.segment_count
    if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS || !Number.isInteger(envelope.segment_id)
      || envelope.segment_id < 0 || envelope.segment_id >= count
      || !Number.isInteger(envelope.message_size_bytes) || envelope.message_size_bytes < 1 || envelope.message_size_bytes > MAX_MESSAGE_BYTES) {
      assemblies.delete(key)
      return undefined
    }
    const assembly = assemblies.get(key) ?? { chunks: new Array(count), size: envelope.message_size_bytes }
    if (assembly.chunks.length !== count || assembly.size !== envelope.message_size_bytes) { assemblies.delete(key); return undefined }
    assembly.chunks[envelope.segment_id] = envelope.message_chunk_base64
    assemblies.set(key, assembly)
    if (assembly.chunks.some(chunk => typeof chunk !== 'string')) return undefined
    assemblies.delete(key)
    const bytes = Buffer.concat(assembly.chunks.map(chunk => Buffer.from(chunk, 'base64')))
    if (bytes.byteLength !== assembly.size) return undefined
    return { client_id: envelope.client_id, message: JSON.parse(bytes.toString('utf8')), seq_id: envelope.seq_id, stream_id: streamId, type: 'client_message' }
  }

  const receive = async raw => {
    const envelope = JSON.parse(raw)
    if (typeof envelope?.client_id !== 'string' || envelope.client_id.length === 0) return
    if (envelope.type === 'client_message') await deliver(envelope)
    else if (envelope.type === 'client_message_chunk') {
      const message = receiveChunk(envelope)
      if (message) await deliver(message)
    } else if (envelope.type === 'ack') {
      if (typeof envelope.stream_id === 'string' && Number.isInteger(envelope.seq_id)) acknowledge(`${envelope.client_id}\u0000${envelope.stream_id}`, envelope.seq_id, Number.isInteger(envelope.segment_id) ? envelope.segment_id : undefined)
    } else if (envelope.type === 'client_closed') closeClient(envelope.client_id, envelope.stream_id)
    else if (envelope.type === 'ping') {
      await sendEnvelope({ client_id: envelope.client_id, seq_id: envelope.seq_id ?? 0, status: 'active', stream_id: envelope.stream_id ?? randomUUID(), type: 'pong' })
    }
  }

  const connectOnce = async signal => {
    const current = await ensureEnrollment(signal)
    await new Promise((resolve, reject) => {
      const ws = new options.WebSocket(endpoints.websocket.toString(), {
        headers: {
          authorization: `Bearer ${current.token}`,
          'user-agent': options.userAgent,
          'x-codex-installation-id': installation,
          'x-codex-name': Buffer.from(options.hostName).toString('base64'),
          'x-codex-protocol-version': PROTOCOL_VERSION,
          'x-codex-server-id': current.serverId,
        },
      })
      socket = ws
      let queue = Promise.resolve()
      const onAbort = () => ws.close()
      signal.addEventListener('abort', onAbort, { once: true })
      let ping
      let silent
      const hearFrom = () => {
        clearTimeout(silent)
        silent = setTimeout(() => { state.lastError = 'timeout'; try { (ws.terminate ?? ws.close).call(ws) } catch { /* already gone */ } }, options.pongTimeoutMs ?? PONG_TIMEOUT_MS)
      }
      const stopBeat = () => { clearInterval(ping); clearTimeout(silent) }
      ws.on('open', () => {
        state.status = 'connected'; state.connectedAt = now(); state.lastError = undefined
        replay(ws)
        // A connection that goes quiet (sleep, network switch) never closes by itself; ping it and drop it when it stops answering.
        if (typeof ws.ping === 'function') {
          hearFrom()
          ping = setInterval(() => { try { ws.ping() } catch { /* the close handler follows */ } }, options.pingMs ?? PING_MS)
        }
      })
      ws.on('pong', hearFrom)
      // A refused upgrade carries the relay's Retry-After, which the next attempt honours.
      ws.on('unexpected-response', (request, response) => {
        stopBeat()
        const error = new RemoteControlError('socket', `Unexpected server response: ${response?.statusCode}`)
        if (response?.statusCode === 429 || response?.statusCode >= 500) error.retryAfterMs = retryAfterMs(String(response.headers?.['retry-after'] ?? ''), now())
        try { request?.destroy?.() } catch { /* the socket is already closing */ }
        reject(error)
      })
      ws.on('message', data => {
        queue = queue.then(() => receive(String(data))).catch(error => { state.lastError = error?.code ?? 'protocol' })
      })
      ws.on('error', error => { stopBeat(); reject(new RemoteControlError('socket', error?.message ?? 'socket error')) })
      ws.on('close', () => { stopBeat(); signal.removeEventListener('abort', onAbort); resolve() })
    })
    // The phones' streams outlive the socket: they continue on the next connection, with what they missed sent again.
    assemblies.clear()
    socket = undefined
  }

  const loop = async signal => {
    let delay = INITIAL_RECONNECT_MS
    let conflicts = 0
    let conflictSince = 0
    let asked
    while (!signal.aborted) {
      state.status = 'connecting'
      try {
        state.connectedAt = undefined
        await connectOnce(signal)
        // Only a connection that lasted counts as healthy; a flapping one keeps backing off.
        if (state.connectedAt !== undefined && now() - state.connectedAt >= STABLE_MS) delay = INITIAL_RECONNECT_MS
      } catch (error) {
        asked = error?.retryAfterMs
        state.lastError = error?.code ?? 'network'
        if (options.debug) state.detail = String(error?.message ?? error).slice(0, 160)
        state.status = 'error'
        // 409: the relay still holds a stale connection for this host; enroll again after a few tries.
        conflicts = /409/u.test(String(error?.message)) ? conflicts + 1 : 0
        if (conflicts === 1) conflictSince = now()
        if (error?.code === 'unauthorized' || conflicts >= 3) enrolled = undefined
        // Still refused after fresh enrollments: this host id is stuck on the relay, so take a new one.
        // A restarted host is refused for a few minutes until the relay drops the old connection;
        // only a host stuck far longer gets a new id (its phones then need to pair again).
        if (conflicts >= 3 && now() - conflictSince >= (options.conflictRenewMs ?? CONFLICT_RENEW_MS) && options.renewInstallation) {
          installation = await options.renewInstallation(); enrolled = undefined; conflicts = 0
          resetStreams()
        }
        if (error?.code === 'not-signed-in') { state.status = 'stopped'; return }
      }
      if (signal.aborted) break
      state.reconnects += 1
      // Jittered so many hosts do not return together; a server's Retry-After is a floor, with its own spread.
      const spread = Math.round(delay * (0.5 + (options.random ?? Math.random)() / 2))
      await wait(asked === undefined ? spread : Math.max(spread, asked + Math.round((options.random ?? Math.random)() * RETRY_AFTER_JITTER_MS)), signal)
      asked = undefined
      delay = Math.min(delay * 2, MAX_RECONNECT_MS)
    }
  }

  return Object.freeze({
    pair,
    listClients,
    revokeClient,
    status: () => ({ ...state, enrolled: enrolled !== undefined, server: enrolled?.serverId.slice(-6), clients: clients.size }),
    start() {
      if (running) return running
      stop = new AbortController()
      state.status = 'connecting'
      running = loop(stop.signal).finally(() => { running = undefined; if (state.status !== 'error') state.status = 'stopped' })
      return running
    },
    async stop() {
      stop?.abort()
      socket?.close()
      await running
      resetStreams()
      state.status = 'stopped'
    },
  })
}
