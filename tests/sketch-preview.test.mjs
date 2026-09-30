import assert from 'node:assert/strict'
import test from 'node:test'

import { composeSketchPreview } from '../src/sketch-preview.js'
import { createSketchCommandSession } from '../src/sketch-commands.js'

const recorder = () => {
  const calls = []
  const make = name => ({ name, toDataURL: type => `data:${type};${name}`, getContext: () => new Proxy({ calls, name }, {
    get: (target, key) => key in target ? target[key] : (...args) => { calls.push([name, String(key), ...args.map(a => a?.name ?? a)]) },
    set: (target, key, value) => { calls.push([name, `set ${String(key)}`, value]); return true },
  }) })
  return { calls, make }
}
const layers = [{ id: 1, name: 'ref', visible: false, strokes: [{ id: 's' }], image: { src: 'r' } }, { id: 2, name: 'art', visible: true, strokes: [{ id: 't' }] }]
const run = (options, doc = { layers }) => {
  const { calls, make } = recorder(), painted = []
  const url = composeSketchPreview({ doc, images: new Map(), width: 1024, height: 768, options, makeSurface: (w, h) => make(`s${make.count = (make.count ?? 0) + 1}`),
    paintLayers: (ctx, d) => painted.push(d.layers.map(l => `${l.id}:${l.visible}:${l.strokes.length}:${Boolean(l.image)}`)) })
  return { url, calls, painted }
}

test('a plain preview paints the document once', () => {
  const { painted, url } = run({})
  assert.equal(painted.length, 1)
  assert.match(url, /^data:image\/png/)
})

test('compare forces the reference visible without strokes, and draws without the picture, blended at half alpha', () => {
  const { painted, calls } = run({ compare: true })
  assert.deepEqual(painted, [['1:true:0:true', '2:false:0:false'], ['1:false:1:false', '2:true:1:false']])
  assert.ok(calls.some(call => call[1] === 'set globalAlpha' && call[2] === 0.5))
  assert.equal(calls.filter(call => call[1] === 'drawImage').length, 2)
})

test('compare without a reference picture says what to do', () => {
  assert.throws(() => run({ compare: true }, { layers: [layers[1]] }), /pictures button/)
})

test('grid draws a labelled line every 100 pixels', () => {
  const { calls } = run({ grid: true })
  const labels = calls.filter(call => call[1] === 'fillText').map(call => call[2])
  assert.deepEqual(labels, ['100', '200', '300', '400', '500', '600', '700', '800', '900', '1000', '100', '200', '300', '400', '500', '600', '700'])
})

test('the command session validates and forwards the preview options', async () => {
  const seen = []
  const adapter = { available: () => true, busy: () => false, snapshot: () => ({ documentId: 'd', revision: 1 }), preview: async options => { seen.push(options); return 'data:image/png;x' } }
  const session = createSketchCommandSession(adapter)
  const result = await session({ action: 'preview', documentId: 'd', compare: true, grid: true })
  assert.deepEqual(seen, [{ compare: true, grid: true }])
  assert.equal(result.gridStep, 100)
  await assert.rejects(session({ action: 'preview', documentId: 'd', grid: 'yes' }), /grid must be true or false/)
})
