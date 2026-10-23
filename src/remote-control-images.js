import { open, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { phoneLog } from './remote-control-log.js'
import { createHash } from 'node:crypto'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const imageType = bytes => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
  : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
    : bytes.subarray(0, 6).toString() === 'GIF87a' || bytes.subarray(0, 6).toString() === 'GIF89a' ? 'image/gif'
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : undefined

/** App-server file reads, limited to images already returned by this bridge; never arbitrary disk access. */
export function createPhoneImageFiles() {
  const files = new Map()
  const root = process.platform === 'win32' ? 'C:/dsh/phone-images/' : '/dsh/phone-images/'
  const key = path => String(path ?? '').replaceAll('\\', '/')
  let size = 0
  return {
    publish(url) {
      const match = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/u.exec(url)
      if (!match) return url
      const bytes = Buffer.from(match[2], 'base64')
      if (bytes.length > MAX_IMAGE_BYTES || !imageType(bytes)) return url
      const path = `${root}${createHash('sha256').update(bytes).digest('hex')}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`
      if (!files.has(path)) { files.set(path, { dataBase64: match[2], bytes: bytes.length, at: Date.now() }); size += bytes.length }
      while (size > 32 * 1024 * 1024 || files.size > 64) { const first = files.keys().next().value; size -= files.get(first).bytes; files.delete(first) }
      return path
    },
    read(path) {
      const entry = files.get(key(path))
      if (!entry) return undefined
      phoneLog('image file served', { bytes: entry.bytes })
      return { dataBase64: entry.dataBase64 }
    },
    metadata(path) {
      const entry = files.get(key(path))
      return entry ? { isDirectory: false, isFile: true, isSymlink: false, createdAtMs: entry.at, modifiedAtMs: entry.at } : undefined
    },
  }
}

/** Only image references already present in an assistant reply, within this conversation's real folder. */
export async function phoneImageMarkdown(text, cwd, publish = url => url) {
  if (!cwd || typeof text !== 'string' || !text.includes('![')) return text
  const matches = [...text.matchAll(/!\[([^\]\r\n]*)\]\((<[^>\r\n]+>|[^)\r\n]+)\.(png|jpe?g|webp|gif)(>?)\)/giu)].slice(-8)
  if (matches.length === 0) return text
  let root
  try { root = await realpath(cwd) } catch { return text }
  for (const match of matches) {
    const target = `${match[2]}.${match[3]}${match[4]}`.replace(/^<|>$/gu, '')
    if (/^https?:|^data:/iu.test(target)) continue
    let file
    try {
      const candidate = target.startsWith('file:') ? fileURLToPath(target) : target
      file = await realpath(isAbsolute(candidate) ? candidate : resolve(root, candidate))
      const inside = relative(root, file)
      if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) continue
      const handle = await open(file, 'r')
      try {
        const stat = await handle.stat()
        if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) continue
        const bytes = await handle.readFile()
        const mediaType = imageType(bytes)
        if (!mediaType) continue
        text = text.replace(match[0], `![${match[1]}](${publish(`data:${mediaType};base64,${bytes.toString('base64')}`)})`)
        phoneLog('local image reference prepared', { bytes: bytes.length })
      } finally { await handle.close() }
    } catch (error) { phoneLog('local image reference unavailable', { error: error?.code ?? error?.name }, 'warn') }
  }
  return text
}

/** The mobile app folds tool items. Also expose successful generation output in the final answer. */
export function withGeneratedImageOutput(turn, publish = url => url) {
  const pictures = item => (item.contentItems ?? []).filter(part => part.type === 'inputImage').map(part => part.imageUrl)
  const snapshot = item => { try { return JSON.parse(item.contentItems?.find(part => part.type === 'inputText')?.text ?? '') } catch { return undefined } }
  const images = [...new Set(turn.items.flatMap((item, index) => {
    if (item.type === 'imageGeneration' && item.status === 'completed' && item.result) return [`data:image/png;base64,${item.result}`]
    if (item.type !== 'dynamicToolCall' || item.tool !== 'codex_sketch' || item.arguments?.action !== 'finish' || !item.success) return []
    const direct = pictures(item)
    if (direct.length) return direct
    // Older finish results had no attachment. Reuse only a full preview of the exact same saved revision.
    const state = snapshot(item)
    if (typeof state?.documentId !== 'string' || !Number.isInteger(state.revision)) return []
    const preview = turn.items.slice(0, index).findLast(candidate => {
      if (candidate.type !== 'dynamicToolCall' || candidate.tool !== 'codex_sketch' || candidate.arguments?.action !== 'preview' || candidate.arguments?.mode || candidate.arguments?.box || !candidate.success) return false
      const shown = snapshot(candidate)
      return shown?.documentId === state.documentId && shown?.revision === state.revision && pictures(candidate).length > 0
    })
    if (!preview) return []
    phoneLog('historical finished image recovered', { matched: true })
    return pictures(preview)
  }))].map(publish)
  if (images.length === 0) return turn
  const answer = turn.items.findLast(item => item.type === 'agentMessage')
  // A local filename invented by an older reply cannot be fetched on the phone. Its verified
  // finished output is already an attachment; use that actual image in the phone projection.
  const text = (answer?.text ?? '').replace(/!\[([^\]\r\n]*)\]\(([^)\r\n]+)\)/gu, (match, alt, target) => /^(?:<?(?:[A-Za-z]:[\\/]|file:|sandbox:)|\.\.?[\\/])/u.test(target) || !/^[A-Za-z][A-Za-z\d+.-]*:/u.test(target) ? `![${alt}](${images.at(-1)})` : match)
  const added = images.filter(url => !text.includes(url)).map(url => `![Image](${url})`).join('\n\n')
  if (!added && text === answer?.text) return turn
  const item = answer ? { ...answer, text: [text, added].filter(Boolean).join('\n\n'), phase: 'final_answer' }
    : { type: 'agentMessage', id: `${turn.id}:images`, text: added, phase: 'final_answer', memoryCitation: null, delivery: null }
  return { ...turn, items: answer ? turn.items.map(current => current === answer ? item : current) : [...turn.items, item] }
}
