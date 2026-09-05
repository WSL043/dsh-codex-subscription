import { createHash, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

import { decodeOriginalImageRef, originalImageRefsEqual, ORIGINAL_IMAGE_CHUNK_BYTES, ORIGINAL_IMAGE_ID_PATTERN } from './image-original-contract.js'

export const ORIGINAL_IMAGE_DIRECTORY = 'dsh-codex-subscription/images/v1'
const METADATA_VERSION = 1

const digest = data => createHash('sha256').update(data).digest('hex')
const validSessionId = value => typeof value === 'string' && value.length > 0 && value.length <= 512

export function pngDimensions(data) {
  if (!(data instanceof Uint8Array) || data.byteLength < 24
    || Buffer.from(data.subarray(0, 8)).toString('hex') !== '89504e470d0a1a0a'
    || Buffer.from(data.subarray(12, 16)).toString('ascii') !== 'IHDR') throw new TypeError('invalid PNG dimensions')
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const width = view.getUint32(16, false)
  const height = view.getUint32(20, false)
  if (width === 0 || height === 0) throw new TypeError('invalid PNG dimensions')
  return { width, height }
}

async function writeExclusive(filename, data) {
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
  const handle = await open(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function assertPrivateFile(filename) {
  const stat = await lstat(filename)
  if (!stat.isFile()) throw new Error('not a regular file')
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) throw new Error('file is not owner-only')
}

function parseMetadata(text) {
  let value
  try { value = JSON.parse(text) } catch { return undefined }
  if (value?.version !== METADATA_VERSION || !validSessionId(value.sessionId)) return undefined
  const image = decodeOriginalImageRef(value.image)
  return image === undefined ? undefined : { sessionId: value.sessionId, image }
}

export class OriginalImageStore {
  constructor(dshHome) {
    this.root = resolve(join(resolveDshHome(dshHome), ORIGINAL_IMAGE_DIRECTORY))
  }

  directory(assetId) {
    if (!ORIGINAL_IMAGE_ID_PATTERN.test(assetId)) throw new TypeError('invalid original image asset id')
    return join(this.root, assetId.slice(4, 6), assetId)
  }

  originalPath(assetId) {
    return join(this.directory(assetId), 'original')
  }

  async save(sessionId, data, name = 'codex-generated-original.png') {
    if (!validSessionId(sessionId) || !(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > 48 * 1024 * 1024) {
      throw new TypeError('invalid original image input')
    }
    const { width, height } = pngDimensions(data)
    const assetId = `img_${randomBytes(16).toString('hex')}`
    const directory = this.directory(assetId)
    const ref = { assetId, mediaType: 'image/png', bytes: data.byteLength, width, height, name, sha256: digest(data) }
    try {
      await mkdir(dirname(directory), { recursive: true, mode: 0o700 })
      await mkdir(directory, { recursive: false, mode: 0o700 })
      await writeExclusive(join(directory, 'original'), data)
      const temporary = join(directory, `metadata.${randomBytes(8).toString('hex')}.tmp`)
      await writeExclusive(temporary, Buffer.from(`${JSON.stringify({ version: METADATA_VERSION, sessionId, image: ref }, null, 2)}\n`))
      await rename(temporary, join(directory, 'metadata.json'))
      return ref
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
  }

  async remove(ref) {
    if (ref !== undefined && ORIGINAL_IMAGE_ID_PATTERN.test(ref.assetId)) {
      await rm(this.directory(ref.assetId), { recursive: true, force: true }).catch(() => undefined)
    }
  }

  async read(sessionId, assetId, inherited) {
    if (!validSessionId(sessionId) || !ORIGINAL_IMAGE_ID_PATTERN.test(assetId)) return undefined
    try {
      const directory = this.directory(assetId)
      const metadataFile = join(directory, 'metadata.json')
      const originalFile = join(directory, 'original')
      await Promise.all([assertPrivateFile(metadataFile), assertPrivateFile(originalFile)])
      const metadata = parseMetadata(await readFile(metadataFile, 'utf8'))
      if (metadata === undefined || metadata.image.assetId !== assetId
        || (metadata.sessionId !== sessionId && !originalImageRefsEqual(metadata.image, inherited))) return undefined
      const data = new Uint8Array(await readFile(originalFile))
      const dimensions = pngDimensions(data)
      if (data.byteLength !== metadata.image.bytes || digest(data) !== metadata.image.sha256
        || dimensions.width !== metadata.image.width || dimensions.height !== metadata.image.height) return undefined
      return { ref: metadata.image, data }
    } catch {
      return undefined
    }
  }

  async chunk(sessionId, assetId, offset, inherited) {
    if (!Number.isSafeInteger(offset) || offset < 0) return undefined
    const stored = await this.read(sessionId, assetId, inherited)
    if (stored === undefined || offset >= stored.data.byteLength || offset % ORIGINAL_IMAGE_CHUNK_BYTES !== 0) return undefined
    const end = Math.min(stored.data.byteLength, offset + ORIGINAL_IMAGE_CHUNK_BYTES)
    return { ref: stored.ref, offset, encoded: Buffer.from(stored.data.subarray(offset, end)).toString('base64'), done: end === stored.data.byteLength }
  }
}
