import { invalidParams } from './remote-control-host.js'
import { phoneLog } from './remote-control-log.js'

const PREFIX = 'history1:'
const encode = value => PREFIX + Buffer.from(JSON.stringify(value)).toString('base64url')
const decode = cursor => {
  if (typeof cursor !== 'string' || cursor.length > 4096 || !cursor.startsWith(PREFIX)) throw invalidParams('Invalid history cursor')
  try {
    const value = JSON.parse(Buffer.from(cursor.slice(PREFIX.length), 'base64url').toString())
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidParams('Invalid history cursor')
    return value
  } catch { throw invalidParams('Invalid history cursor') }
}
const scopeParts = scope => { try { const value = JSON.parse(scope); return Array.isArray(value) ? value : [] } catch { return [] } }
const scopeKey = scope => {
  const parts = scopeParts(scope)
  // Native opaque item cursors identify a position in the whole thread.
  // turnId is a query filter, including for cursors issued before this fix.
  return parts[1] === 'items' ? JSON.stringify(parts.slice(0, 2)) : scope
}
const anchorCursor = (id, scope, direction, inclusive) => encode({ v: 2, s: scopeKey(scope), d: direction, a: id, i: inclusive })

export function initialHistoryCursor(list, scope) {
  const anchor = list.at(-1)?.id
  return anchor === undefined ? null : anchorCursor(anchor, scope, 'desc', true)
}

// Match native history: next excludes the last item, backwards includes the
// first item and supports opposite sorting. New items remain discoverable.
export function historyPage(list, params, scope, defaultDirection = 'desc', accept = () => true) {
  const cursor = params?.cursor
  const legacyOffset = typeof cursor === 'string' && /^\d+$/u.test(cursor)
  const saved = cursor == null || legacyOffset ? undefined : decode(cursor)
  const direction = params?.sortDirection ?? saved?.d ?? defaultDirection
  if (!['asc', 'desc'].includes(direction)) throw invalidParams('Invalid history sort direction')
  const limit = params?.limit ?? 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalidParams('History page limit must be between 1 and 100')
  if (saved && (![1, 2].includes(saved.v) || scopeKey(saved.s) !== scopeKey(scope) || typeof saved.a !== 'string'
    || saved.v === 2 && typeof saved.i !== 'boolean')) {
    const currentScope = scopeParts(scope), cursorScope = scopeParts(saved.s)
    const view = value => ['turns', 'items'].includes(value) ? value : 'unknown'
    phoneLog('history cursor rejected', { direction, cursorDirection: ['asc', 'desc'].includes(saved.d) ? saved.d : 'unknown',
      requestedView: view(currentScope[1]), cursorView: view(cursorScope[1]),
      cursorThreadMatches: currentScope[0] === cursorScope[0], cursorTurnScoped: !!cursorScope[2],
      requestedTurnScoped: !!currentScope[2], cursorTurnMatches: currentScope[2] === cursorScope[2] }, 'warn')
    throw invalidParams('History cursor belongs to another view')
  }
  const ordered = direction === 'asc' ? list : list.toReversed()
  const start = legacyOffset ? Number(cursor) : saved ? ordered.findIndex(item => item.id === saved.a) : 0
  if (!Number.isSafeInteger(start) || start < 0) throw invalidParams('History cursor is no longer available')
  // Resolve the opaque position before applying turn filters. An anchor from
  // another turn is valid; object item anchors are checked by the caller.
  const candidates = legacyOffset ? ordered.filter(accept).slice(start)
    : ordered.slice(start + (saved?.v === 2 && !saved.i ? 1 : 0)).filter(accept)
  const data = candidates.slice(0, limit)
  return { data,
    nextCursor: candidates.length > data.length ? anchorCursor(data.at(-1).id, scope, direction, false) : null,
    backwardsCursor: data.length ? anchorCursor(data[0].id, scope, direction === 'asc' ? 'desc' : 'asc', true) : null,
  }
}

// Build the small reusable page index before reading attachments or publishing
// image assets. Heavy item contents are generated only for the selected turns.
export function historyIndex(messages, turns) {
  const positions = new Map(messages.map((message, index) => [message.id, index]))
  const ranges = turns.map(turn => ({
    ...turn,
    items: turn.items.map(item => item.type === 'userMessage' ? item : { id: item.id, type: item.type }),
    from: positions.get(turn.id) ?? 0,
  }))
  for (let i = 0; i < ranges.length; i++) ranges[i].to = ranges[i + 1]?.from ?? messages.length
  return ranges
}
