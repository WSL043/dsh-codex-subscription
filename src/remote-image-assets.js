import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const BASE = 'https://chatgpt.com/backend-api/'
const FILE_ID = /^file-[A-Za-z0-9_-]{1,200}$/u
const HASH = /^[a-f0-9]{64}$/u
const hash = value => createHash('sha256').update(value).digest('hex')
function imageBytes({ data, mediaType } = {}) {
  if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > 8 * 1024 * 1024) throw new Error('Invalid remote image size')
  const bytes = Buffer.from(data)
  const png = bytes.length >= 24 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217
  if (!(mediaType === 'image/png' && png || mediaType === 'image/jpeg' && jpeg)) throw new Error('Remote image type does not match image bytes')
  return bytes
}
function signedUrl(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('Invalid signed image destination') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !/(?:\.blob\.core\.windows\.net|\.oaiusercontent\.com|\.openai\.com)$/u.test(url.hostname)) throw new Error('Untrusted signed image destination')
  return url.href
}
function cachedEntry(value) {
  return value && HASH.test(value.hash) && FILE_ID.test(value.fileId) && Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= 8 * 1024 * 1024 && ['image/png', 'image/jpeg'].includes(value.mediaType)
}

/** Private, account-scoped image upload cache. Persist only IDs and image metadata. */
export function createRemoteImageAssets({ credentials, fetch: request = globalThis.fetch, stateFile } = {}) {
  const accounts = new Map(), flights = new Map()
  let writes = Promise.resolve()
  let ready
  const load = () => ready ??= (async () => {
    if (!stateFile) return
    let state
    try { state = JSON.parse(await readFile(stateFile, 'utf8')) } catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return; throw error }
    if (state?.version !== 1 || !Array.isArray(state.accounts)) return
    for (const account of state.accounts) {
      if (!HASH.test(account?.account)) continue
      const entries = new Map()
      for (const entry of (Array.isArray(account.images) ? account.images : []).slice(-128)) if (cachedEntry(entry)) entries.set(entry.hash, { hash: entry.hash, fileId: entry.fileId, bytes: entry.bytes, mediaType: entry.mediaType })
      accounts.set(account.account, entries)
    }
  })()
  const persist = () => {
    if (!stateFile) return Promise.resolve()
    const next = writes.catch(() => {}).then(async () => {
      const temporary = `${stateFile}.${randomUUID()}.tmp`
      await mkdir(dirname(stateFile), { recursive: true, mode: 0o700 })
      try {
        await writeFile(temporary, JSON.stringify({ version: 1, accounts: [...accounts].map(([account, images]) => ({ account, images: [...images.values()] })) }), { mode: 0o600, flag: 'wx' })
        await rename(temporary, stateFile)
      } finally { await rm(temporary, { force: true }) }
    })
    writes = next
    return next
  }
  const send = async (url, init) => {
    try { return await request(url, init) } catch {
      init.signal?.throwIfAborted()
      throw new Error('Remote image request failed')
    }
  }
  async function upload(bytes, mediaType, auth, owner, key, signal) {
    const api = async (method, path, body) => {
      signal.throwIfAborted()
      const response = await send(BASE + path, { method, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]), headers: { authorization: `Bearer ${auth.access}`, 'ChatGPT-Account-ID': auth.accountId, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      if (!response.ok) { const error = new Error(`Remote image ${method} failed (HTTP ${response.status})`); error.status = response.status; throw error }
      try { return await response.json() } catch { throw new Error('Invalid remote image response') }
    }
    let entries = accounts.get(owner)
    if (!entries) { entries = new Map(); accounts.set(owner, entries) }
    const saved = entries.get(key)
    if (saved) {
      try {
        const resolved = await api('GET', `files/download/${encodeURIComponent(saved.fileId)}`)
        if (resolved.status === 'success' && typeof resolved.download_url === 'string') { signedUrl(resolved.download_url); return { fileId: saved.fileId, downloadUrl: signedUrl(resolved.download_url) } }
      } catch (error) { if (error.status !== 404 && error.status !== 410) throw error }
      entries.delete(key)
    }
    const created = await api('POST', 'files', { file_name: `dsh-image-${key.slice(0, 16)}.${mediaType === 'image/png' ? 'png' : 'jpg'}`, file_size: bytes.length, use_case: 'codex' })
    if (!FILE_ID.test(created.file_id)) throw new Error('Invalid remote image file identity')
    const destination = signedUrl(created.upload_url)
    const put = await send(destination, { method: 'PUT', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]), headers: { 'x-ms-blob-type': 'BlockBlob', 'content-length': String(bytes.length), 'content-type': mediaType }, body: bytes })
    if (!put.ok) throw new Error(`Remote image upload failed (HTTP ${put.status})`)
    for (let attempt = 0; attempt < 8; attempt++) {
      const completed = await api('POST', `files/${encodeURIComponent(created.file_id)}/uploaded`, {})
      if (completed.status === 'success') {
        signedUrl(completed.download_url)
        signal.throwIfAborted()
        entries.set(key, { hash: key, fileId: created.file_id, bytes: bytes.length, mediaType })
        while (entries.size > 128) entries.delete(entries.keys().next().value)
        try { await persist() } catch (error) { entries.delete(key); throw error }
        return { fileId: created.file_id, downloadUrl: signedUrl(completed.download_url) }
      }
      if (completed.status !== 'retry') throw new Error('Remote image finalization failed')
      if (attempt < 7) await delay(250, undefined, { signal })
    }
    throw new Error('Remote image finalization did not complete')
  }
  return Object.freeze({
    async publish(image, signal) {
      signal?.throwIfAborted()
      const bytes = imageBytes(image)
      const credential = await credentials({ signal })
      const auth = { access: credential?.access, accountId: credential?.accountId }
      signal?.throwIfAborted()
      if (!auth?.access || typeof auth.access !== 'string' || !auth.accountId || typeof auth.accountId !== 'string') throw new Error('Remote image upload requires a signed-in account')
      await load()
      signal?.throwIfAborted()
      const owner = hash(auth.accountId), key = hash(bytes), flightKey = `${owner}:${key}`
      let flight = flights.get(flightKey)
      if (!flight) {
        const controller = new AbortController()
        flight = { controller, waiters: 0, settled: false }
        flight.promise = Promise.resolve().then(() => upload(bytes, image.mediaType, auth, owner, key, controller.signal)).finally(() => { flight.settled = true; if (flights.get(flightKey) === flight) flights.delete(flightKey) })
        flights.set(flightKey, flight)
      }
      flight.waiters++
      return new Promise((resolve, reject) => {
        let done = false
        const finish = (error, value) => {
          if (done) return
          done = true; signal?.removeEventListener('abort', abort)
          if (--flight.waiters === 0 && !flight.settled) { flights.delete(flightKey); flight.controller.abort() }
          if (error) reject(error); else resolve(value)
        }
        const abort = () => finish(signal.reason ?? new Error('Remote image upload aborted'))
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) abort()
        flight.promise.then(value => finish(undefined, value), error => finish(error))
      })
    },
  })
}
