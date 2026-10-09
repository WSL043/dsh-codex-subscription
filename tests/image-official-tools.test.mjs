import assert from 'node:assert/strict'
import test from 'node:test'

import { IMAGE_ASPECT_RATIOS, officialImageTools, paintEraseMask } from '../src/image-official-tools.js'
import { zh } from '../src/client-locales.js'

const t = key => zh[key] ?? key

test('official image tools send the Codex instructions with the right files', async () => {
  const calls = []
  const attachForEdit = async (...args) => { calls.push(args) }
  const tools = officialImageTools({ src: 'blob:x', name: 'whale.png', t, attachForEdit, sourceInDraft: true })
  assert.deepEqual(tools.map(tool => [tool.id, tool.kind]), [['remove-background', 'tool'], ['erase', 'mask'], ['resize', 'choice']])

  await tools[0].onInvoke({})
  assert.deepEqual(calls[0], ['blob:x', 'whale.png', '移除此图像的背景。保持所有前景主体不变且完整，边缘干净平滑。将背景设为透明。', [], undefined, true, []])

  await assert.rejects(tools[1].onInvoke({}), /Mark the area/u)
  await tools[1].onInvoke({ mask: new Blob(['m'], { type: 'image/png' }) })
  assert.equal(calls[1][2], '从第一张图像中移除第二张图像中标记的区域')
  assert.equal(calls[1][6].length, 1)
  assert.equal(calls[1][6][0].name, 'whale-erase-mask.png')
  assert.equal(calls[1][6][0].type, 'image/png')

  assert.deepEqual(tools[2].options.map(option => option.value), IMAGE_ASPECT_RATIOS.map(([, ratio]) => ratio))
  assert.deepEqual(IMAGE_ASPECT_RATIOS.map(([, ratio]) => ratio), ['1:1', '3:4', '9:16', '4:3', '16:9'])
  await tools[2].onInvoke({ option: '16:9' })
  assert.equal(calls[2][2], '将宽高比设为 16:9')
  assert.deepEqual(calls[2][6], [])
})

test('erase mask is white strokes on black at the image resolution', () => {
  const ops = []
  const context = new Proxy({}, {
    get: (target, key) => key in target ? target[key] : (...args) => ops.push([key, ...args]),
    set: (target, key, value) => { target[key] = value; ops.push(['set', key, value]); return true },
  })
  paintEraseMask(context, [{ size: 0.1, points: [{ x: 0.5, y: 0.5 }] }, { size: 0.05, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }], 200, 100)
  assert.deepEqual(ops.slice(0, 2), [['set', 'fillStyle', '#000'], ['fillRect', 0, 0, 200, 100]])
  assert.ok(ops.some(op => op[0] === 'arc' && op[1] === 100 && op[2] === 50 && op[3] === 5))
  assert.ok(ops.some(op => op[0] === 'set' && op[1] === 'lineWidth' && op[2] === 5))
  assert.ok(ops.some(op => op[0] === 'lineTo' && op[1] === 200 && op[2] === 100))
  assert.ok(ops.some(op => op[0] === 'set' && op[1] === 'strokeStyle' && op[2] === '#fff'))
})
