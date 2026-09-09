import { decodeOriginalImageRef, originalImageRefsEqual, ORIGINAL_IMAGE_CHUNK_BYTES } from './image-original-contract.js'
import { CHANNEL } from './rpc-contract.js'

function decodeBase64Chunk(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(ORIGINAL_IMAGE_CHUNK_BYTES / 3) * 4 + 8) throw new Error('Invalid original image chunk')
  let decoded
  try { decoded = atob(value) } catch { throw new Error('Invalid original image chunk') }
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index)
  return bytes
}

/** Keep only the destination and current chunk, while verifying every reply. */
export async function readOriginalImage(rpc, sessionId, original, { signal, onProgress } = {}) {
  signal?.throwIfAborted()
  original = decodeOriginalImageRef(original)
  if (original === undefined) throw new Error('Invalid original image reference')
  const data = new Uint8Array(original.bytes)
  let total = 0
  let done = false
  while (!done) {
    signal?.throwIfAborted()
    const response = await rpc.call(CHANNEL, 'image/original/chunk', { sessionId, assetId: original.assetId, offset: total }, signal)
    signal?.throwIfAborted()
    if (!response?.ok) throw new Error(response?.error?.message ?? 'Codex RPC failed')
    const chunk = response.value
    if (!originalImageRefsEqual(chunk?.ref, original) || chunk.offset !== total || typeof chunk.done !== 'boolean') throw new Error('Original image metadata changed')
    const bytes = decodeBase64Chunk(chunk.encoded)
    if (bytes.byteLength === 0 || total + bytes.byteLength > original.bytes) throw new Error('Original image download is incomplete')
    data.set(bytes, total)
    total += bytes.byteLength
    done = chunk.done
    onProgress?.({ loaded: total, total: original.bytes })
  }
  if (total !== original.bytes) throw new Error('Original image download is incomplete')
  const digest = await crypto.subtle.digest('SHA-256', data)
  signal?.throwIfAborted()
  const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  if (sha256 !== original.sha256) throw new Error('Original image integrity check failed')
  return data
}
