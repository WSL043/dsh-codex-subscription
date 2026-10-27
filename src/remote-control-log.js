import { createHash } from 'node:crypto'
import { diagnosticLog } from './diagnostic-log.js'

// Protocol metadata only. Never serialize request bodies, results, URLs or image data.
const IDS = new Set(['requestId', 'clientId', 'threadId', 'turnId', 'itemId', 'attachmentId'])
const FIELDS = new Set(['method', 'status', 'type', 'code', 'ms', 'bytes', 'items', 'turns', 'images', 'segments', 'sequence', 'chunks', 'hasClientId', 'matched', 'pending', 'event', 'error'])
for (const name of ['direction', 'cursorDirection', 'requestedView', 'cursorView', 'cursorThreadMatches', 'cursorTurnScoped', 'requestedTurnScoped', 'cursorTurnMatches']) FIELDS.add(name)
export function phoneLog(event, details = {}, level = 'info') {
  const fields = {}
  for (const [name, value] of Object.entries(details)) {
    if (value === undefined || value === null) continue
    if (IDS.has(name)) fields[name] = createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
    else if (FIELDS.has(name) && ['string', 'number', 'boolean'].includes(typeof value)) fields[name] = value
  }
  diagnosticLog.log(level, 'phone', event, JSON.stringify(fields))
}
