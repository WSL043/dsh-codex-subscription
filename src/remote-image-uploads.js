import { posix, win32 } from 'node:path'
import { invalidParams } from './remote-control-host.js'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_STAGED_BYTES = 80 * 1024 * 1024
const MAX_STAGED_IMAGES = 32
const UPLOAD_TTL_MS = 5 * 60_000

// A client path is an opaque key for a staged upload. No filesystem access uses it.
function uploadPath(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f]/u.test(value)) return
  const windows = /^[a-z]:[\\/]/iu.test(value)
  const parts = windows ? value.split(/[\\/]/u) : value.split('/')
  if (parts.some(part => part === '..')) return
  if (windows) return win32.normalize(value).toLowerCase()
  if (value.startsWith('/')) return posix.normalize(value)
}

function mediaTypeOf(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && bytes.toString('ascii', 12, 16) === 'IHDR') return 'image/png'
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) return 'image/jpeg'
  if (bytes.length >= 14 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif'
  if (bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
}

export function createRemoteImageUploads() {
  const uploads = new Map()
  let totalBytes = 0
  let timer
  const discard = key => {
    const entry = uploads.get(key)
    if (!entry) return
    totalBytes -= entry.data.length
    uploads.delete(key)
  }
  const prune = () => {
    for (const [key, entry] of uploads) if (entry.expiresAt <= Date.now()) discard(key)
    if (uploads.size === 0) { clearInterval(timer); timer = undefined }
  }
  const keyOf = (notify, path) => {
    const key = uploadPath(path)
    const client = notify?.clientId
    if (typeof client !== 'string' || !client || !key) return
    return JSON.stringify([client, key])
  }
  const get = (notify, path) => {
    prune()
    return uploads.get(keyOf(notify, path))
  }
  const requireImage = (notify, path) => {
    const entry = get(notify, path)
    if (!entry) throw invalidParams('The phone image upload is missing or expired. Attach it again.')
    return entry
  }
  return {
    write(notify, { path, dataBase64 } = {}) {
      const key = keyOf(notify, path)
      if (!key) throw invalidParams('An absolute image upload path is required')
      if (typeof dataBase64 !== 'string' || !dataBase64 || dataBase64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4
        || dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(dataBase64)) {
        throw invalidParams('The phone image must contain valid base64 and be at most 20 MiB')
      }
      const data = Buffer.from(dataBase64, 'base64')
      if (data.toString('base64') !== dataBase64 || data.length > MAX_IMAGE_BYTES) throw invalidParams('Invalid phone image encoding or size')
      const mediaType = mediaTypeOf(data)
      if (!mediaType) throw invalidParams('The phone image must be PNG, JPEG, GIF or WebP')
      prune()
      const previous = uploads.get(key)
      if ((!previous && uploads.size >= MAX_STAGED_IMAGES) || totalBytes - (previous?.data.length ?? 0) + data.length > MAX_STAGED_BYTES) {
        throw invalidParams('Too many images are waiting for upload. Try again after the previous uploads expire.')
      }
      discard(key)
      const createdAt = Date.now()
      uploads.set(key, { data, mediaType, createdAt, expiresAt: createdAt + UPLOAD_TTL_MS })
      totalBytes += data.length
      timer ??= setInterval(prune, 30_000).unref()
      return {}
    },
    read(notify, path) { return { dataBase64: requireImage(notify, path).data.toString('base64') } },
    image(notify, path) {
      const { data, mediaType } = requireImage(notify, path)
      return { type: 'image', url: `data:${mediaType};base64,${data.toString('base64')}` }
    },
    metadata(notify, path) {
      const entry = get(notify, path)
      return entry && { isDirectory: false, isFile: true, isSymlink: false, createdAtMs: entry.createdAt, modifiedAtMs: entry.createdAt }
    },
    clear() {
      uploads.clear()
      totalBytes = 0
      clearInterval(timer)
      timer = undefined
    },
  }
}
