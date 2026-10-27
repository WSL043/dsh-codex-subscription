import { invalidParams } from './remote-control-host.js'

const PREFIX = 'history1:'
const encode = value => PREFIX + Buffer.from(JSON.stringify(value)).toString('base64url')
const decode = cursor => {
  if (typeof cursor !== 'string' || cursor.length > 4096 || !cursor.startsWith(PREFIX)) throw invalidParams('Invalid history cursor')
  try { return JSON.parse(Buffer.from(cursor.slice(PREFIX.length), 'base64url').toString()) } catch { throw invalidParams('Invalid history cursor') }
}

export function initialHistoryCursor(list, scope) {
  const anchor = list.at(-1)?.id
  return anchor === undefined ? null : encode({ v: 1, s: scope, d: 'desc', c: anchor, a: anchor })
}

// Item identities, rather than offsets, survive new turns arriving while the
// phone is paging backwards. Cursors are scoped to one thread, view and turn.
export function historyPage(list, params, scope, defaultDirection = 'desc') {
  const cursor = params?.cursor
  const legacyOffset = typeof cursor === 'string' && /^\d+$/u.test(cursor)
  const saved = cursor == null || legacyOffset ? undefined : decode(cursor)
  const direction = params?.sortDirection ?? saved?.d ?? defaultDirection
  if (!['asc', 'desc'].includes(direction)) throw invalidParams('Invalid history sort direction')
  const limit = params?.limit ?? 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalidParams('History page limit must be between 1 and 100')
  if (saved && (saved.v !== 1 || saved.s !== scope || saved.d !== direction || typeof saved.a !== 'string' || typeof saved.c !== 'string')) throw invalidParams('History cursor belongs to another view')
  let ordered = direction === 'asc' ? list : list.toReversed()
  if (saved) {
    const cut = ordered.findIndex(item => item.id === saved.c)
    if (cut < 0) throw invalidParams('History changed; load the first page again')
    ordered = direction === 'asc' ? ordered.slice(0, cut + 1) : ordered.slice(cut)
  }
  const start = legacyOffset ? Number(cursor) : saved ? ordered.findIndex(item => item.id === saved.a) : 0
  if (!Number.isSafeInteger(start) || start < 0) throw invalidParams('History cursor is no longer available')
  const data = ordered.slice(start, start + limit)
  const ceiling = saved?.c ?? (direction === 'asc' ? ordered.at(-1)?.id : ordered[0]?.id)
  const at = index => index >= 0 && index < ordered.length ? encode({ v: 1, s: scope, d: direction, c: ceiling, a: ordered[index].id }) : null
  return { data, nextCursor: at(start + data.length), backwardsCursor: start > 0 ? at(Math.max(0, start - limit)) : null }
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
