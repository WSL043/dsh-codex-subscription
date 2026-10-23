import assert from 'node:assert/strict'
import test from 'node:test'
import { projectTurns, finishTool } from '../src/remote-control-dsh.js'
import { withRemoteImageOutput } from '../src/remote-control-image-output.js'
const asset = { fileId: 'file-one', downloadUrl: 'https://test.blob.core.windows.net/image.png?sig=first' }
const ref = { attachmentId: 'image' }
const image = { type: 'image', attachment: ref }
const urls = new Map([['image', 'data:image/png;base64,cG5n']])
const assets = new Map([['image', asset]])
const user = { role: 'user', id: 'user', content: [{ type: 'text', text: 'draw' }] }
const call = (id, name, args) => ({ role: 'assistant', id: 'assistant-'+id, content: [{ type: 'tool-call', id, name, arguments: JSON.stringify(args) }] })
const result = (id, state, pictures = []) => ({ role: 'tool', toolCallId: id, content: [{ type: 'text', text: JSON.stringify(state) }, ...pictures] })
const answer = text => ({ role: 'assistant', id: 'answer', content: [{ type: 'text', text }] })

test('native result and identities remain, while a final answer receives one HTTPS image', () => {
  const messages = [user, call('gen', 'codex_image_generate', {}), result('gen', {}, [image]), answer('done')]
  const original = JSON.stringify(messages)
  const [turn] = projectTurns(messages, 0, urls, undefined, assets)
  const native = turn.items.find(item => item.id === 'gen')
  assert.equal(native.result, 'cG5n'); assert.equal(native.fileId, asset.fileId)
  assert.equal(turn.items.at(-1).id, 'answer:0')
  assert.equal(turn.items.at(-1).phase, null)
  assert.equal(turn.items.at(-1).text, `done\n\n![Image](${asset.downloadUrl})`)
  assert.equal(JSON.stringify(messages), original, 'no signed URL enters stored messages')
  assert.deepEqual(withRemoteImageOutput(turn), turn, 'reprojection is idempotent')
})

test('refresh replaces only the previous signed URL for the same file identity', () => {
  const messages = [user, call('gen', 'codex_image_generate', {}), result('gen', {}, [image]), answer('done')]
  const [turn] = projectTurns(messages, 0, urls, undefined, assets)
  const renewed = { ...asset, downloadUrl: asset.downloadUrl.replace('first', 'renewed') }
  finishTool(turn.items.find(item => item.id === 'gen'), messages[2], urls, new Map([['image', renewed]]))
  const next = withRemoteImageOutput(turn)
  assert.equal(next.items.at(-1).text.match(/!\[Image\]/gu).length, 1)
  assert.ok(next.items.at(-1).text.includes(renewed.downloadUrl))
  assert.ok(!next.items.at(-1).text.includes(asset.downloadUrl))
})

test('old sketch uses the exact full preview revision and replaces its explicitly presented file', () => {
  const state = { documentId: 'document', revision: 27 }
  const messages = [user, call('preview', 'codex_sketch', { action: 'preview' }), result('preview', state, [image]), call('finish', 'codex_sketch', { action: 'finish' }), result('finish', state), call('present', 'present', { files: [{ path: 'C:\\work\\whale.png' }] }), answer('![preview](whale.png)')]
  const [turn] = projectTurns(messages, 0, urls, undefined, assets)
  assert.equal(turn.items.at(-1).text, `![preview](${asset.downloadUrl})`)
  assert.equal(turn.items.find(item => item.id === 'preview').contentItems[1].imageUrl, asset.downloadUrl)
  for (const wrong of [{ documentId: 'other', revision: 27 }, { documentId: 'document', revision: 28 }]) {
    const changed = structuredClone(messages); changed[4] = result('finish', wrong)
    assert.equal(projectTurns(changed, 0, urls, undefined, assets)[0].items.at(-1).text, '![preview](whale.png)')
  }
  const crop = structuredClone(messages); crop[1] = call('preview', 'codex_sketch', { action: 'preview', box: [0, 0, 64, 64] })
  assert.equal(projectTurns(crop, 0, urls, undefined, assets)[0].items.at(-1).text, '![preview](whale.png)')
})

test('failed publication or failed tool never replaces the native result or unrelated Markdown paths', () => {
  const messages = [user, call('gen', 'codex_image_generate', {}), result('gen', {}, [image]), answer('![reference](other.png)')]
  const [fallback] = projectTurns(messages, 0, urls)
  assert.equal(fallback.items[1].result, 'cG5n'); assert.equal(fallback.items[1].fileId, undefined)
  assert.equal(fallback.items.at(-1).text, '![reference](other.png)')
  const [published] = projectTurns(messages, 0, urls, undefined, assets)
  assert.ok(published.items.at(-1).text.startsWith('![reference](other.png)'))
  const presented = [...messages.slice(0, -1), call('present', 'present', { files: [{ path: 'other.png' }] }), messages.at(-1)]
  assert.ok(projectTurns(presented, 0, urls, undefined, assets)[0].items.at(-1).text.startsWith('![reference](other.png)'), 'native generation never claims an unrelated presented file')
  const failed = structuredClone(messages); failed[2].isError = true
  assert.equal(projectTurns(failed, 0, urls, undefined, assets)[0].items.at(-1).text, '![reference](other.png)')
})
