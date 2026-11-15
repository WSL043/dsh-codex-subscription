import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const VOICE_TRANSCRIPT_LIMIT = 200
const validId = value => typeof value === 'string' && /^[a-f0-9-]{36}$/u.test(value)
const valid = value => validId(value?.id) && Array.isArray(value.entries)
  && value.entries.length <= VOICE_TRANSCRIPT_LIMIT
  && value.entries.every(entry => validId(entry?.callId) && ['user', 'assistant'].includes(entry.role)
    && typeof entry.text === 'string' && entry.text.length <= 4096)

/** Temporary recovery data, removed once the native session has durably recorded it. */
export function createVoiceTranscriptRecovery(directory) {
  const pending = new Map()
  const filename = id => join(directory, createHash('sha256').update(id).digest('hex') + '.json')
  const read = async threadId => {
    try {
      const value = JSON.parse(await readFile(filename(threadId), 'utf8'))
      return valid(value) ? value : undefined
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }
  }
  const enqueue = (threadId, operation) => {
    const next = (pending.get(threadId) ?? Promise.resolve()).catch(() => {}).then(operation)
    pending.set(threadId, next)
    const forget = () => { if (pending.get(threadId) === next) pending.delete(threadId) }
    void next.then(forget, forget)
    return next
  }
  return {
    async load(threadId) {
      await pending.get(threadId)?.catch(() => {})
      return read(threadId)
    },
    save(threadId, checkpoint) {
      return enqueue(threadId, async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 })
        const file = filename(threadId)
        const temporary = `${file}.${randomUUID()}.tmp`
        try {
          await writeFile(temporary, JSON.stringify(checkpoint), { flag: 'wx', mode: 0o600, flush: true })
          await rename(temporary, file)
          if (process.platform !== 'win32') {
            const handle = await open(directory, 'r')
            try { await handle.sync() } finally { await handle.close() }
          }
        } finally {
          await rm(temporary, { force: true })
        }
      })
    },
    remove(threadId, checkpointId) {
      return enqueue(threadId, async () => {
        if ((await read(threadId))?.id === checkpointId) await rm(filename(threadId), { force: true })
      })
    },
  }
}
