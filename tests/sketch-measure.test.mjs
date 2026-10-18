import assert from 'node:assert/strict'
import test from 'node:test'
import { createSketchCommandSession } from '../src/sketch-commands.js'
import { dominantColors, measureDifference, sampleColors } from '../src/sketch-measure.js'

const flat = (width, height, color) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([...color, 255], i * 4)
  return { data, width, height }
}
const paintBlock = (picture, x0, y0, x1, y1, color) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) picture.data.set([...color, 255], (y * picture.width + x) * 4)
}

test('measure finds the cell that differs most and reports colours', () => {
  const reference = flat(60, 80, [255, 255, 255]), drawing = flat(60, 80, [255, 255, 255])
  paintBlock(reference, 40, 60, 60, 80, [0, 0, 0])
  const result = measureDifference(reference, drawing, { columns: 3, rows: 4 })
  assert.equal(result.worst[0].column, 2)
  assert.equal(result.worst[0].row, 3)
  assert.equal(result.worst[0].reference, '#000000')
  assert.equal(result.worst[0].drawing, '#ffffff')
  assert.equal(result.worst[0].error, 100)
  assert.ok(result.error > 0 && result.error < 15)
  assert.equal(measureDifference(reference, reference).error, 0)
  const spots = sampleColors(reference, drawing, [{ x: .9, y: .9 }, { x: .1, y: .1 }])
  assert.deepEqual(spots.map(spot => spot.reference), ['#000000', '#ffffff'])
})

test('the measure action goes through the board and validates its arguments', async () => {
  let asked
  const adapter = {
    available: () => true, busy: () => false,
    snapshot: () => ({ documentId: 'd', revision: 1 }),
    measure: async options => { asked = options; return { error: 1.5, worst: [] } },
  }
  const run = createSketchCommandSession(adapter)
  const result = await run({ action: 'measure', documentId: 'd', rows: 4, points: [{ x: .5, y: .5 }] })
  assert.equal(result.measure.error, 1.5)
  assert.deepEqual(asked, { columns: 6, rows: 4, points: [{ x: .5, y: .5 }], palette: 0, regions: 0, box: undefined })
  await assert.rejects(run({ action: 'measure', documentId: 'd', rows: 99 }), /rows must be/)
  await assert.rejects(run({ action: 'measure', documentId: 'd', points: [{ x: 2, y: 0 }] }), /points must be/)
})

test('the palette lists the main colours of a picture with their share', () => {
  const picture = flat(40, 40, [250, 250, 250])
  paintBlock(picture, 0, 0, 40, 10, [20, 160, 170])
  const colors = dominantColors(picture, 3)
  assert.equal(colors[0].color, '#fafafa')
  assert.equal(colors[0].share, 75)
  assert.equal(colors[1].color, '#14a0aa')
  assert.equal(colors[1].share, 25)
})

test('apply reports progress against the reference and look returns the side-by-side picture', async () => {
  let current = { width: 100, height: 100, active: 2, layers: [{ id: 1, visible: false, image: { src: 'r' }, strokes: [] }, { id: 2, visible: true, strokes: [] }] }
  let revision = 1, errors = [20, 12]
  const adapter = {
    available: () => true, busy: () => false,
    snapshot: () => ({ documentId: 'd', revision }),
    document: () => current,
    commit: next => { current = next; revision++ },
    measure: async () => ({ error: errors.shift(), worst: [{ column: 1, row: 2, error: 30 }, { column: 0, row: 0, error: 20 }, { column: 2, row: 2, error: 10 }, { column: 3, row: 3, error: 5 }] }),
    preview: async options => 'data:image/png;' + (options.mode ?? 'plain'),
  }
  const run = createSketchCommandSession(adapter)
  const result = await run({ action: 'apply', documentId: 'd', revision: 1, requestId: 'a', look: true, commands: [{ op: 'stroke', shape: 'line', color: '#000000', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] })
  assert.deepEqual(result.progress, { error: 12, previous: 20, worst: [{ column: 1, row: 2, error: 30 }, { column: 0, row: 0, error: 20 }, { column: 2, row: 2, error: 10 }] })
  assert.equal(result.png, 'data:image/png;side')
})

test('preview validates mode and box', async () => {
  const seen = []
  const adapter = { available: () => true, busy: () => false, snapshot: () => ({ documentId: 'd', revision: 1 }), preview: async options => { seen.push(options); return 'data:image/png;x' } }
  const run = createSketchCommandSession(adapter)
  await run({ action: 'preview', documentId: 'd', mode: 'diff', box: { x: .1, y: .1, width: .3, height: .3 } })
  assert.deepEqual(seen[0], { compare: false, grid: false, mode: 'diff', box: { x: .1, y: .1, width: .3, height: .3 } })
  await assert.rejects(run({ action: 'preview', documentId: 'd', mode: 'weird' }), /mode must be/)
  await assert.rejects(run({ action: 'preview', documentId: 'd', box: { x: .9, y: 0, width: .5, height: .5 } }), /box must be/)
})
