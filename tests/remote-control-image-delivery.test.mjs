import assert from 'node:assert/strict'
import test from 'node:test'
import { createDshRemoteControl } from '../src/remote-control-dsh.js'
import { createRemoteControlHost } from '../src/remote-control-host.js'
import { diagnosticLog } from '../src/diagnostic-log.js'
const tick = () => new Promise(resolve => setImmediate(resolve))
const ref = { attachmentId: 'image' }
const picture = { role: 'tool', toolCallId: 'gen', content: [{ type: 'image', attachment: ref }] }
const asset = { fileId: 'file-live', downloadUrl: 'https://test.blob.core.windows.net/live.png?sig=private' }

function fixture(remoteImages, imagePublishMs = 20000, readImage = async () => ({ ref: { ...ref, mediaType: 'image/png' }, data: Buffer.from('png') })) {
  let idle
  const messages = [], notes = [], session = { id: 'session', meta: {}, deriveMessages: () => messages }
  const bridge = createDshRemoteControl({
    controller: () => ({ resolveAgent: async () => ({ agent: { session, whenIdle: () => new Promise(resolve => { idle = resolve }) } }), prompt: async () => ({ accepted: true }), modelCatalog: async () => ({ groups: [] }), cancel: () => {} }),
    agents: () => ({}), attachments: () => ({ readImage }),
    remoteImages, imagePublishMs, userAgent: 'test/1',
  })
  const notify = async (method, params) => notes.push({ method, params: structuredClone(params) })
  const event = message => { messages.push(message); bridge.onSessionEvent(session, { type: message.role === 'tool' ? 'tool/result' : message.role === 'user' ? 'user/message' : 'assistant/message', data: message.role === 'user' ? message : { message } }) }
  const start = async (sequence = [
    { role: 'assistant', id: 'call', content: [{ type: 'tool-call', id: 'gen', name: 'codex_image_generate', arguments: '{}' }] },
    picture,
    { role: 'assistant', id: 'answer', content: [{ type: 'text', text: 'done' }] },
  ]) => {
    const accepted = await bridge.methods['turn/start']({ threadId: 'session', clientUserMessageId: 'client', input: [{ type: 'text', text: 'draw' }] }, { notify })
    event({ role: 'user', id: 'stored-user', content: [{ type: 'text', text: 'draw' }] })
    for (const message of sequence) event(message)
    idle()
    return accepted.turn.id
  }
  const completed = async () => {
    const deadline = Date.now() + 2000
    while (!notes.some(note => note.method === 'turn/completed')) { if (Date.now() > deadline) throw Error('Turn did not finish'); await tick() }
    return notes.find(note => note.method === 'turn/completed').params.turn
  }
  return { bridge, messages, notes, start, completed }
}

test('turn and item pages retain the completed tool picture in the final answer with the same ids', async () => {
  const f = fixture({ publish: async () => asset })
  const turnId = await f.start()
  const completed = await f.completed()
  const page = await f.bridge.methods['thread/turns/list']({ threadId: 'session', limit: 1 }, {})
  assert.equal(page.data[0].id, turnId)
  assert.equal(page.data[0].items.find(item => item.type === 'imageGeneration').fileId, asset.fileId)
  assert.equal(page.data[0].items.at(-1).id, completed.items.at(-1).id)
  assert.equal(page.data[0].items.at(-1).text, `done\n\n![Image](${asset.downloadUrl})`)
  const items = await f.bridge.methods['thread/items/list']({ threadId: 'session', turnId, limit: 1, sortDirection: 'desc' }, {})
  assert.equal(items.data[0].item.id, completed.items.at(-1).id)
  assert.equal(items.data[0].item.text, page.data[0].items.at(-1).text)
  assert.equal(items.data[0].item.text.match(/!\[Image\]/gu).length, 1)
})

test('live image publishes before completion and history restores the same IDs with a fresh single image', async () => {
  let release, requests = 0
  const f = fixture({ publish: async () => { requests++; if (requests === 1) await new Promise(resolve => { release = resolve }); return { ...asset, downloadUrl: asset.downloadUrl + requests } } })
  const id = await f.start()
  await tick()
  assert.equal(f.notes.some(note => note.method === 'turn/completed'), false)
  assert.equal(f.notes.some(note => note.method === 'item/completed' && note.params.item.type === 'imageGeneration'), false)
  release()
  const turn = await f.completed()
  assert.equal(turn.id, id)
  assert.equal(turn.items.find(item => item.id === 'gen').fileId, asset.fileId)
  assert.equal(turn.items.find(item => item.id === 'gen').result, 'cG5n')
  const final = turn.items.at(-1)
  assert.equal(final.id, 'answer:0'); assert.ok(final.text.includes(asset.downloadUrl + '1'))
  const before = f.notes.findIndex(note => note.method === 'item/completed' && note.params.item.type === 'imageGeneration')
  const after = f.notes.findIndex(note => note.method === 'item/completed' && note.params.item.type === 'agentMessage')
  assert.ok(before < after)
  for (const number of [2, 3]) {
    const { thread } = await f.bridge.methods['thread/read']({ threadId: 'session' })
    assert.equal(thread.turns[0].id, id)
    assert.equal(thread.turns[0].items.find(item => item.id === 'gen').fileId, asset.fileId)
    assert.equal(thread.turns[0].items.at(-1).id, final.id)
    assert.ok(thread.turns[0].items.at(-1).text.includes(asset.downloadUrl + number))
    assert.equal(thread.turns[0].items.at(-1).text.match(/!\[Image\]/gu).length, 1)
  }
  assert.doesNotMatch(JSON.stringify(f.messages), /sig=|file-live|blob.core/)
})

test('live old sketch finish waits for its full preview and history resolves the same presented image', async () => {
  let release
  const f = fixture({ publish: async () => { await new Promise(resolve => { release = resolve }); return asset } })
  const state = { documentId: 'document', revision: 27 }
  const call = (id, tool, args) => ({ role: 'assistant', id: 'call-'+id, content: [{ type: 'tool-call', id, name: tool, arguments: JSON.stringify(args) }] })
  const result = (id, images = []) => ({ role: 'tool', toolCallId: id, content: [{ type: 'text', text: JSON.stringify(state) }, ...images] })
  await f.start([
    call('preview', 'codex_sketch', { action: 'preview' }), result('preview', [{ type: 'image', attachment: ref }]),
    call('finish', 'codex_sketch', { action: 'finish' }), result('finish'),
    call('present', 'present', { files: [{ path: 'C:\\work\\whale.png' }] }),
    { role: 'assistant', id: 'answer', content: [{ type: 'text', text: '![preview](whale.png)' }] },
  ])
  await tick(); release()
  const turn = await f.completed()
  assert.equal(turn.items.at(-1).text, `![preview](${asset.downloadUrl})`)
  assert.equal(turn.items.at(-1).id, 'answer:0')
  // Replace the delayed fake publisher before restoring history.
  const f2 = fixture({ publish: async () => asset })
  f2.messages.push(...f.messages)
  const { thread } = await f2.bridge.methods['thread/read']({ threadId: 'session' })
  assert.equal(thread.turns[0].items.at(-1).text, turn.items.at(-1).text)
})

for (const reason of ['failure', 'timeout', 'interrupt']) test(`publication ${reason} preserves original result and completes the turn`, async () => {
  let started = false, cancelled = false
  const f = fixture({ publish: async (_image, signal) => {
    started = true
    if (reason === 'failure') throw Error('do not log sig=private')
    return new Promise((_, reject) => { signal.addEventListener('abort', () => { cancelled = true; reject(signal.reason) }, { once: true }) })
  } }, 25)
  diagnosticLog.clear()
  await f.start(); await tick()
  if (reason === 'interrupt') f.bridge.methods['turn/interrupt']({ threadId: 'session' })
  const turn = await f.completed()
  assert.equal(started, true)
  assert.equal(cancelled, reason !== 'failure')
  assert.equal(turn.items.find(item => item.id === 'gen').result, 'cG5n')
  assert.equal(turn.items.find(item => item.id === 'gen').fileId, undefined)
  assert.equal(turn.items.at(-1).text, 'done')
  assert.doesNotMatch(JSON.stringify(diagnosticLog.snapshot()), /sig=private|blob.core|file-live/)
})

test('debug metadata removes signed URL query strings before keeping its trace', async () => {
  const host = createRemoteControlHost({ methods: { 'turn/start': () => ({}) }, debug: true })
  const connection = host.serve({ id: 'client', send: async () => {} })
  connection.receive({ id: 1, method: 'turn/start', params: { input: [{ type: 'text', text: asset.downloadUrl }] } })
  await tick()
  assert.doesNotMatch(JSON.stringify(host.trace()), /sig=|private/)
  assert.match(JSON.stringify(host.trace()), /blob.core.windows.net/)
  connection.close()
})

test('history publishes user attachments in message order without changing text, IDs or stored messages', async () => {
  const published = []
  const f = fixture({ publish: async image => {
    const id = Buffer.from(image.data).toString()
    published.push(id)
    return { fileId: `file-${id}`, downloadUrl: `https://test.blob.core.windows.net/${id}.png?sig=private` }
  } }, 20000, async ref => ({ ref: { ...ref, mediaType: 'image/png' }, data: Buffer.from(ref.attachmentId) }))
  const original = { role: 'user', id: 'uploaded-user', content: [
    { type: 'text', text: '原文不改：compare these pictures' },
    ...['first', 'second', 'third'].map(attachmentId => ({ type: 'image', attachment: { attachmentId } })),
  ] }
  f.messages.push(original)
  const stored = structuredClone(f.messages)
  for (const method of ['thread/read', 'thread/resume']) {
    const { thread } = await f.bridge.methods[method]({ threadId: 'session' }, { notify: async () => {} })
    const shown = thread.turns[0].items[0]
    assert.equal(shown.id, original.id)
    assert.equal(thread.turns[0].id, original.id)
    assert.deepEqual(shown.content[0], { type: 'text', text: original.content[0].text, text_elements: [] })
    assert.deepEqual(shown.content.slice(1), ['first', 'second', 'third'].map(id => ({ type: 'image', url: `https://test.blob.core.windows.net/${id}.png?sig=private` })))
    assert.deepEqual(f.messages, stored)
  }
  assert.deepEqual(published.toSorted(), ['first', 'first', 'second', 'second', 'third', 'third'])
})

for (const reason of ['failure', 'timeout', 'cancel']) test(`history user image publication ${reason} keeps the existing inline image`, async () => {
  let started = false, cancelled = false
  const f = fixture({ publish: async (_image, signal) => {
    started = true
    if (reason === 'failure') throw Error('no upload')
    return new Promise((_, reject) => signal.addEventListener('abort', () => { cancelled = true; reject(signal.reason) }, { once: true }))
  } }, 25)
  f.messages.push({ role: 'user', id: 'uploaded-user', content: [
    { type: 'text', text: 'keep this' }, { type: 'image', attachment: ref },
  ] })
  const controller = new AbortController()
  const reading = f.bridge.methods['thread/read']({ threadId: 'session' }, { signal: controller.signal })
  while (!started) await tick()
  if (reason === 'cancel') controller.abort()
  const { thread } = await reading
  assert.equal(cancelled, reason !== 'failure')
  assert.deepEqual(thread.turns[0].items[0].content, [
    { type: 'text', text: 'keep this', text_elements: [] }, { type: 'image', url: 'data:image/png;base64,cG5n' },
  ])
})

test('many tool previews do not evict the user reference image from the bounded history projection', async () => {
  const read = []
  const f = fixture({ publish: async image => ({ fileId: `file-${Buffer.from(image.data)}`, downloadUrl: `https://test.blob.core.windows.net/${Buffer.from(image.data)}.png` }) }, 20000, async ref => {
    read.push(ref.attachmentId)
    return { ref: { ...ref, mediaType: 'image/png' }, data: Buffer.from(ref.attachmentId) }
  })
  f.messages.push({ role: 'user', id: 'reference-user', content: [{ type: 'image', attachment: { attachmentId: 'reference' } }] })
  for (let n = 0; n < 13; n++) f.messages.push({ role: 'tool', toolCallId: `preview-${n}`, content: [{ type: 'image', attachment: { attachmentId: `preview-${n}` } }] })
  for (let n = 0; n < 20; n++) f.messages.push({ role: 'tool', toolCallId: `repeat-${n}`, content: [{ type: 'image', attachment: { attachmentId: 'preview-12' } }] })
  const { thread } = await f.bridge.methods['thread/read']({ threadId: 'session' })
  assert.deepEqual(thread.turns[0].items[0].content, [{ type: 'image', url: 'https://test.blob.core.windows.net/reference.png' }])
  assert.equal(read.length, 12)
  assert.equal(read.includes('reference'), true)
  assert.equal(read.includes('preview-0'), false)
  assert.equal(read.includes('preview-1'), false)
})

test('cloud failure keeps the original twelve-image total with six user and six tool images', async () => {
  const read = []
  const f = fixture({ publish: async () => { throw Error('offline') } }, 20000, async ref => {
    read.push(ref.attachmentId)
    return { ref: { ...ref, mediaType: 'image/png' }, data: Buffer.from(ref.attachmentId) }
  })
  f.messages.push({ role: 'user', id: 'user-many', content: [
    { type: 'text', text: 'compare all' },
    ...Array.from({ length: 12 }, (_, n) => ({ type: 'image', attachment: { attachmentId: `user-${n}` } })),
  ] })
  f.messages.push({ role: 'assistant', id: 'calls', content: Array.from({ length: 12 }, (_, n) => ({ type: 'tool-call', id: `gen-${n}`, name: 'codex_image_generate', arguments: '{}' })) })
  for (let n = 0; n < 12; n++) f.messages.push({ role: 'tool', toolCallId: `gen-${n}`, content: [{ type: 'image', attachment: { attachmentId: `tool-${n}` } }] })
  const { thread } = await f.bridge.methods['thread/read']({ threadId: 'session' })
  assert.equal(read.length, 12)
  assert.equal(read.filter(id => id.startsWith('user-')).length, 6)
  assert.equal(read.filter(id => id.startsWith('tool-')).length, 6)
  assert.deepEqual(read.filter(id => id.startsWith('user-')), ['user-11', 'user-10', 'user-9', 'user-8', 'user-7', 'user-6'])
  const user = thread.turns[0].items[0]
  assert.equal(user.id, 'user-many')
  assert.equal(user.content.filter(part => part.type === 'image').length, 6)
  assert.equal(user.content.filter(part => part.type === 'image').every(part => part.url.startsWith('data:image/png;base64,')), true)
  assert.equal(thread.turns[0].items.filter(item => item.type === 'imageGeneration' && item.result).length, 6)
})

test('shared attachment identities across roles are read once and do not waste the twelve-image budget', async () => {
  const read = []
  const f = fixture(undefined, 20000, async ref => {
    read.push(ref.attachmentId)
    return { ref: { ...ref, mediaType: 'image/png' }, data: Buffer.from(ref.attachmentId) }
  })
  f.messages.push({ role: 'user', id: 'shared', content: Array.from({ length: 12 }, (_, n) => ({ type: 'image', attachment: { attachmentId: `same-${n}` } })) })
  for (let n = 0; n < 12; n++) f.messages.push({ role: 'tool', toolCallId: `preview-${n}`, content: [{ type: 'image', attachment: { attachmentId: `same-${n}` } }] })
  await f.bridge.methods['thread/read']({ threadId: 'session' })
  assert.equal(read.length, 12)
  assert.equal(new Set(read).size, 12)
})
