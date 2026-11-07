import assert from 'node:assert/strict'
import test from 'node:test'
import { buildImageEditDraft } from '../src/image-edit.js'
import { createAnnotatedImageReference } from '../src/image-edit-reference.js'

const messages = {
  imageEditDefault: 'Edit this image.',
  imageEditReferenceGuide: 'Edit {sourceName}. Use {referenceName} to locate the edits and omit its markers.',
}
const translate = key => messages[key] ?? key

test('direct editing preserves the concise default draft', () => {
  assert.equal(buildImageEditDraft({ translate }), 'Edit this image.')
})

test('numbered region notes preserve coordinates, names, and visible pin numbers', () => {
  const draft = buildImageEditDraft({
    prompt: 'Adjust the character.',
    annotations: [
      { x: 0.25, y: 0.5, note: 'Make the eyes larger.' },
      { x: 0.75, y: 0.125, note: 'Remove the cup.' },
    ],
    sourceName: 'edit-source.png',
    referenceName: 'edit-locations.png',
    translate,
  })
  assert.equal(draft, [
    'Adjust the character.',
    '',
    'Edit edit-source.png. Use edit-locations.png to locate the edits and omit its markers.',
    '1. (x=25%, y=50%) Make the eyes larger.',
    '2. (x=75%, y=12.5%) Remove the cup.',
  ].join('\n'))
})

test('an empty note is rejected instead of being silently dropped', () => {
  assert.throws(() => buildImageEditDraft({
    annotations: [{ x: 0.5, y: 0.5, note: '  ' }],
    translate,
  }), error => error?.code === 'ANNOTATION_INVALID' && /missing a note/u.test(error.message))
})

test('a non-empty note with invalid coordinates is rejected', () => {
  assert.throws(() => buildImageEditDraft({
    annotations: [{ x: 1.01, y: 0.5, note: 'Move this.' }],
    translate,
  }), error => error?.code === 'ANNOTATION_INVALID' && /between 0 and 1/u.test(error.message))
})

test('direct editing remains unchanged when there are no annotations', () => {
  assert.equal(buildImageEditDraft({ prompt: '  Keep the lighting.  ', annotations: [], translate }), 'Keep the lighting.')
})

function fakeRenderingSurface({ encode = 'ok' } = {}) {
  const calls = []
  const context = {
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
    moveTo: (...args) => calls.push(['moveTo', ...args]),
    lineTo: (...args) => calls.push(['lineTo', ...args]),
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    beginPath: () => calls.push(['beginPath']),
    arc: (...args) => calls.push(['arc', ...args]),
    fill: () => calls.push(['fill']),
    stroke: () => calls.push(['stroke']),
    fillText: (...args) => calls.push(['fillText', ...args]),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: type => { calls.push(['getContext', type]); return context },
    toBlob: (callback, type) => {
      calls.push(['toBlob', type])
      callback(encode === 'ok' ? new Blob(['reference'], { type }) : null)
    },
  }
  return { calls, canvas }
}

test('annotated reference keeps source pixels and maps numbered pins to image pixels', async () => {
  const surface = fakeRenderingSurface()
  let closed = 0
  const source = { id: 'source' }
  const output = await createAnnotatedImageReference(source, [
    { x: 0.25, y: 0.75, note: 'ignored by renderer' },
    { x: 1, y: 0, note: 'also ignored by renderer' },
  ], {
    createImageBitmap: async value => {
      assert.equal(value, source)
      return { width: 101, height: 81, close: () => { closed += 1 } }
    },
    createCanvas: (width, height) => {
      assert.deepEqual([width, height], [101, 81])
      return surface.canvas
    },
  })
  assert.equal(output.type, 'image/png')
  assert.equal(closed, 1)
  assert.equal(surface.canvas.width, 101)
  assert.equal(surface.canvas.height, 81)
  const draw = surface.calls.find(call => call[0] === 'drawImage')
  assert.deepEqual(draw.slice(2), [0, 0, 101, 81])
})

test('annotated reference writes each valid number and clamps pins at the edges', async () => {
  const surface = fakeRenderingSurface()
  const bitmap = { width: 101, height: 81, close() {} }
  await createAnnotatedImageReference({}, [
    { x: 0.25, y: 0.75 },
    { x: 1, y: 0 },
  ], { createImageBitmap: async () => bitmap, createCanvas: () => surface.canvas })
  const labels = surface.calls.filter(call => call[0] === 'fillText').map(call => call[1])
  assert.deepEqual(labels, ['1', '2'])
  const arcs = surface.calls.filter(call => call[0] === 'arc')
  assert.equal(arcs[0][1], 25)
  assert.equal(arcs[0][2], 60)
  assert.ok(arcs[1][1] < 101)
  assert.ok(arcs[1][2] > 0)
})

test('annotated reference fails closed when PNG encoding fails and still closes the bitmap', async () => {
  const surface = fakeRenderingSurface({ encode: 'fail' })
  let closed = 0
  await assert.rejects(createAnnotatedImageReference({}, [{ x: 0.5, y: 0.5 }], {
    createImageBitmap: async () => ({ width: 64, height: 64, close: () => { closed += 1 } }),
    createCanvas: () => surface.canvas,
  }), /failed to encode/u)
  assert.equal(closed, 1)
})

test('annotated reference rejects invalid coordinates before rendering', async () => {
  let decoded = false
  await assert.rejects(createAnnotatedImageReference({}, [{ x: -0.1, y: 0.5 }], {
    createImageBitmap: async () => { decoded = true; return { width: 64, height: 64, close() {} } },
    createCanvas: () => fakeRenderingSurface().canvas,
  }), error => error?.code === 'ANNOTATION_INVALID')
  assert.equal(decoded, false)
})
