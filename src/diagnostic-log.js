import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { sanitizeLogText } from './diagnostic-log-format.js'

export { formatLogLine, sanitizeLogText } from './diagnostic-log-format.js'

// A support log: what happened, in order, with a level. Text is cleaned before it is kept:
// nothing that identifies the account or lets anyone act as it ever reaches the log.
const LEVELS = ['info', 'warn', 'error']
const MAX_ENTRIES = 400
const FILE_LIMIT = 256 * 1024

export function createDiagnosticLog({ now = Date.now, limit = MAX_ENTRIES } = {}) {
  let entries = []
  let dropped = 0
  let sequence = 0
  let file
  let lastWritten = ''
  const persist = entry => {
    if (file === undefined) return
    try {
      try { if (statSync(file).size > FILE_LIMIT) renameSync(file, `${file}.1`) } catch { /* no file yet */ }
      appendFileSync(file, `${JSON.stringify(entry)}\n`)
    } catch { /* the log must never break the plugin */ }
  }
  const log = (level, area, message, detail) => {
    try {
      if (!LEVELS.includes(level)) return
      const text = sanitizeLogText(message)
      if (text === '' && detail === undefined) return
      const entry = { sequence: ++sequence, time: now(), level, area: String(area).slice(0, 24), message: text }
      if (detail !== undefined) entry.detail = sanitizeLogText(detail)
      const signature = `${level}|${entry.area}|${text}|${entry.detail ?? ''}`
      const previous = entries.at(-1)
      // The same line repeating (a reconnect loop, a poll) is counted, not repeated.
      if (previous !== undefined && signature === lastWritten) {
        previous.count = (previous.count ?? 1) + 1
        previous.lastTime = entry.time
        return
      }
      lastWritten = signature
      entries.push(entry)
      if (entries.length > limit) { entries = entries.slice(-limit); dropped++ }
      persist(entry)
    } catch { /* the log must never break the plugin */ }
  }
  return {
    log,
    info: (area, message, detail) => log('info', area, message, detail),
    warn: (area, message, detail) => log('warn', area, message, detail),
    error: (area, message, detail) => log('error', area, message, detail),
    /** Keep a copy on disk, and start from what the last run left behind. */
    attach(path) {
      try {
        mkdirSync(dirname(path), { recursive: true })
        file = path
        const earlier = readFileSync(path, 'utf8').trim().split('\n').slice(-Math.floor(limit / 2)).flatMap(line => {
          try {
            const value = JSON.parse(line)
            return LEVELS.includes(value?.level) && Number.isSafeInteger(value?.time) && typeof value?.message === 'string'
              ? [{ ...value, sequence: ++sequence, area: String(value.area ?? '').slice(0, 24), message: sanitizeLogText(value.message), earlier: true }] : []
          } catch { return [] }
        })
        entries = [...earlier, ...entries]
      } catch { file = file ?? path }
    },
    snapshot: (max = 200) => ({ dropped, entries: entries.slice(-max).map(value => ({ ...value })) }),
    clear() { entries = []; dropped = 0; lastWritten = '' },
  }
}

/** The log every part of the plugin writes to. */
export const diagnosticLog = createDiagnosticLog()
