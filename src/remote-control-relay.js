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
const MAX_RECONNECT_MS = 30_000
const REQUEST_TIMEOUT_MS = 30_000
const REFRESH_MARGIN_MS = 5 * 60_000

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
  const state = { status: 'stopped', connectedAt: undefined, lastError: undefined, reconnects: 0 }

  const request = async (url, init, signal) => {
    const response = await doFetch(url, {
      ...init,
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new RemoteControlError(response.status === 401 || response.status === 403 ? 'unauthorized' : 'http-error',
        `Remote Control request failed (HTTP ${response.status})`)
    }
    return response.json()
  }

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

  const sendEnvelope = async envelope => {
    if (socket?.readyState !== 1) throw new RemoteControlError('not-connected', 'Remote Control is not connected')
    await new Promise((resolve, reject) => socket.send(JSON.stringify(envelope), error => error ? reject(error) : resolve()))
  }

  const sendServerMessage = async (clientId, streamId, message) => {
    const key = `${clientId}\u0000${streamId}`
    const sequence = sequences.get(key) ?? 1
    sequences.set(key, sequence + 1)
    const envelope = { client_id: clientId, message, seq_id: sequence, stream_id: streamId, type: 'server_message' }
    const encoded = JSON.stringify(envelope)
    if (Buffer.byteLength(encoded) <= MAX_SEGMENT_BYTES) return sendEnvelope(envelope)
    const bytes = Buffer.from(JSON.stringify(message))
    if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new RemoteControlError('too-large', 'Remote Control message is too large')
    const chunks = []
    for (let offset = 0; offset < bytes.byteLength; offset += TARGET_SEGMENT_BYTES) chunks.push(bytes.subarray(offset, offset + TARGET_SEGMENT_BYTES).toString('base64'))
    await Promise.all(chunks.map((chunk, segmentId) => sendEnvelope({
      client_id: clientId,
      message_chunk_base64: chunk,
      message_size_bytes: bytes.byteLength,
      segment_count: chunks.length,
      segment_id: segmentId,
      seq_id: sequence,
      stream_id: streamId,
      type: 'server_message_chunk',
    })))
  }

  const closeClient = (clientId, streamId) => {
    for (const [key, client] of clients) {
      if (key.startsWith(`${clientId}\u0000`) && (streamId === undefined || key === `${clientId}\u0000${streamId}`)) {
        clients.delete(key)
        sequences.delete(key)
        client.close()
      }
    }
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
    client.receive(envelope.message)
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
      ws.on('open', () => { state.status = 'connected'; state.connectedAt = now(); state.lastError = undefined })
      ws.on('message', data => {
        queue = queue.then(() => receive(String(data))).catch(error => { state.lastError = error?.code ?? 'protocol' })
      })
      ws.on('error', error => reject(new RemoteControlError('socket', error?.message ?? 'socket error')))
      ws.on('close', () => { signal.removeEventListener('abort', onAbort); resolve() })
    })
    for (const [, client] of clients) client.close()
    clients.clear()
    sequences.clear()
    assemblies.clear()
    socket = undefined
  }

  const loop = async signal => {
    let delay = INITIAL_RECONNECT_MS
    let conflicts = 0
    while (!signal.aborted) {
      state.status = 'connecting'
      try {
        await connectOnce(signal)
        delay = INITIAL_RECONNECT_MS
      } catch (error) {
        state.lastError = error?.code ?? 'network'
        if (options.debug) state.detail = String(error?.message ?? error).slice(0, 160)
        state.status = 'error'
        // 409: the relay still holds a stale connection for this host; enroll again after a few tries.
        conflicts = /409/u.test(String(error?.message)) ? conflicts + 1 : 0
        if (error?.code === 'unauthorized' || conflicts >= 3) enrolled = undefined
        // Still refused after fresh enrollments: this host id is stuck on the relay, so take a new one.
        if (conflicts >= 6 && options.renewInstallation) { installation = await options.renewInstallation(); enrolled = undefined; conflicts = 0 }
        if (error?.code === 'not-signed-in') { state.status = 'stopped'; return }
      }
      if (signal.aborted) break
      state.reconnects += 1
      await wait(delay, signal)
      delay = Math.min(delay * 2, MAX_RECONNECT_MS)
    }
  }

  return Object.freeze({
    pair,
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
      state.status = 'stopped'
    },
  })
}
