import assert from 'node:assert/strict'
import test from 'node:test'
import { createDshRemoteControl } from '../src/remote-control-dsh.js'
import { createRemoteControlHost } from '../src/remote-control-host.js'
import { diagnosticLog } from '../src/diagnostic-log.js'
const tick = () => new Promise(resolve => setImmediate(resolve))
const ref = { attachmentId: 'image' }
const picture = { role: 'tool', toolCallId: 'gen', content: [{ type: 'image', attachment: ref }] }
const asset = { fileId: 'file-live', downloadUrl: 'https://test.blob.core.windows.net/live.png?sig=private' }

function fixture(remoteImages, imagePublishMs = 20000) {
  let idle
  const messages = [], notes = [], session = { id: 'session', meta: {}, deriveMessages: () => messages }
  const bridge = createDshRemoteControl({
    controller: () => ({ resolveAgent: async () => ({ agent: { session, whenIdle: () => new Promise(resolve => { idle = resolve }) } }), prompt: async () => ({ accepted: true }), modelCatalog: async () => ({ groups: [] }), cancel: () => {} }),
    agents: () => ({}), attachments: () => ({ readImage: async () => ({ ref: { ...ref, mediaType: 'image/png' }, data: Buffer.from('png') }) }),
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
