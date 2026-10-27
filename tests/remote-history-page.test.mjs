import assert from 'node:assert/strict'
import test from 'node:test'
import { createDshRemoteControl } from '../src/remote-control-dsh.js'
import { historyPage } from '../src/remote-history-page.js'

const user = n => ({ role: 'user', id: `u${n}`, content: [{ type: 'text', text: `message ${n}` }, { type: 'image', attachment: { attachmentId: `image-${n}`, mediaType: 'image/png' } }] })
const assistant = n => ({ role: 'assistant', id: `a${n}`, content: [{ type: 'text', text: `answer ${n}` }] })
function fixture(count = 60) {
  const messages = Array.from({ length: count }, (_, n) => [user(n), assistant(n)]).flat()
  let reads = 0, activations = 0
  const files = [], meta = { id: 's', cwd: 'C:/test', createdAt: 1700000000000 }
  const bridge = createDshRemoteControl({
    userAgent: 'test/1',
    controller: () => ({
      list: async () => ({ items: [{ sessionId: 's', cwd: meta.cwd, updatedAt: meta.createdAt }] }),
      resolveAgent: async () => { activations++; throw Error('A history page must not activate an agent') },
    }),
    historySource: { read: async (id, { signal }) => {
      signal?.throwIfAborted(); if (id !== 's') throw Object.assign(Error('missing'), { code: 'SESSION_QUERY_SESSION_NOT_FOUND' })
      reads++; return { messages, meta, events: Object.freeze([]), cursor: messages.length }
    } },
    attachments: () => ({ readImage: async ref => { files.push(ref.attachmentId); return { data: new Uint8Array([1]), ref } } }),
  })
  return { bridge, messages, files, reads: () => reads, activations: () => activations }
}

test('turn pages read only selected-turn images and remain stable when a new turn arrives', async () => {
  const f = fixture(), method = f.bridge.methods['thread/turns/list']
  const first = await method({ threadId: 's', limit: 2 }, {})
  assert.deepEqual(first.data.map(t => t.id), ['u59', 'u58'])
  assert.deepEqual(f.files.toSorted(), ['image-58', 'image-59'])
  f.messages.push(user(60), assistant(60))
  const next = await method({ threadId: 's', limit: 2, cursor: first.nextCursor }, {})
  assert.deepEqual(next.data.map(t => t.id), ['u57', 'u56'])
  assert.equal(f.activations(), 0)
  assert.equal(f.files.length, 4, 'do not reread the newest twelve history images for every page')
})

test('lightweight turns and metadata have no attachment I/O or agent activation', async () => {
  const f = fixture()
  const meta = await f.bridge.methods['thread/read']({ threadId: 's', includeTurns: false }, {})
  assert.deepEqual(meta.thread.turns, [])
  assert.equal(meta.thread.historyMode, 'paginated')
  assert.equal(f.reads(), 0)
  const page = await f.bridge.methods['thread/turns/list']({ threadId: 's', limit: 3, itemsView: 'summary' }, {})
  assert.equal(page.data.length, 3)
  assert.ok(page.data.every(t => t.itemsView === 'notLoaded' && t.items.length === 0))
  assert.equal(f.files.length, 0)
  assert.equal(f.activations(), 0)
})

test('item pages and exclusive item anchors are scoped to the requested turn', async () => {
  const f = fixture(), method = f.bridge.methods['thread/items/list']
  const first = await method({ threadId: 's', turnId: 'u4', limit: 1 }, {})
  assert.deepEqual(first.data.map(x => [x.turnId, x.item.id]), [['u4', 'u4']])
  const next = await method({ threadId: 's', turnId: 'u4', limit: 1, cursor: first.nextCursor }, {})
  assert.equal(next.data[0].item.id, 'a4:0')
  const after = await method({ threadId: 's', turnId: 'u4', cursor: { type: 'item', itemId: 'u4' } }, {})
  assert.deepEqual(after.data.map(x => x.item.id), ['a4:0'])
  await assert.rejects(method({ threadId: 's', turnId: 'u5', cursor: first.nextCursor }, {}), /another view/)
  await assert.rejects(method({ threadId: 's', turnId: 'u4', cursor: { type: 'item', itemId: 'u5' } }, {}), /anchor/)
  assert.ok(f.files.every(id => id === 'image-4'))
})

test('history validation and cancellation never publish a partial image response', async () => {
  const f = fixture(), method = f.bridge.methods['thread/turns/list']
  await assert.rejects(method({ threadId: 'missing' }, {}), /Thread not found/)
  for (const limit of [0, -1, 101, 1.2]) await assert.rejects(method({ threadId: 's', limit }, {}), /limit/)
  await assert.rejects(method({ threadId: 's', cursor: 'garbage' }, {}), /cursor/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(method({ threadId: 's' }, { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(f.files.length, 0)
})

test('stable paging handles both directions, scope mismatch and history replacement', () => {
  const items = Array.from({ length: 5 }, (_, n) => ({ id: `i${n}` }))
  const first = historyPage(items, { limit: 2, sortDirection: 'asc' }, 's')
  assert.deepEqual(first.data.map(i => i.id), ['i0', 'i1'])
  assert.deepEqual(historyPage([...items, { id: 'i5' }], { limit: 3, cursor: first.nextCursor }, 's').data.map(i => i.id), ['i2', 'i3', 'i4'])
  assert.throws(() => historyPage(items, { cursor: first.nextCursor }, 'other'), /another view/)
  assert.throws(() => historyPage(items.slice(0, 2), { cursor: first.nextCursor }, 's'), /History changed/)
  assert.deepEqual(historyPage(items, { cursor: '1', limit: 1 }, 's').data.map(i => i.id), ['i3'])
})
