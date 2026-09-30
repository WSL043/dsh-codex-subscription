import assert from 'node:assert/strict'
import test from 'node:test'

import { applySketchCommands } from '../src/sketch-commands.js'
import { sketchCommandArray } from '../src/sketch-command-schema.js'
import { svgToSketchCommands } from '../src/sketch-svg.js'

const doc = { width: 1024, height: 768, ratio: '4:3', active: 1, nextId: 2, layers: [{ id: 1, name: 'Layer 1', visible: true, strokes: [] }] }
const wrap = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768">${body}</svg>`
const convert = (body, extra = {}) => svgToSketchCommands(wrap(body), { width: 1024, height: 768, ...extra })

test('the schema offers the svg command', () => {
  assert.ok(sketchCommandArray.items.properties.op.enum.includes('svg'))
  assert.equal(sketchCommandArray.items.properties.svg.type, 'string')
})

test('rect, circle and line become normalized native strokes', () => {
  const { commands } = convert('<rect x="0" y="0" width="512" height="384" fill="#ff0000"/><circle cx="512" cy="384" r="100" fill="none" stroke="#00f" stroke-width="4"/><line x1="0" y1="0" x2="1024" y2="768" stroke="#000"/>')
  const [rect, circle, line] = commands
  assert.equal(rect.shape, 'polygon')
  assert.equal(rect.fill, true)
  assert.equal(rect.color, '#ff0000')
  assert.deepEqual(rect.points[2], { x: 0.5, y: 0.5 })
  assert.equal(circle.shape, 'bezier')
  assert.equal(circle.fill, false)
  assert.equal(circle.color, '#0000ff')
  assert.equal(circle.width, 4)
  assert.equal(circle.points.length, 13)
  assert.equal(line.shape, 'line')
  assert.deepEqual(line.points, [{ x: 0, y: 0 }, { x: 1, y: 1 }])
})

test('path data covers relative commands, arcs, smooth curves and closing', () => {
  const { commands } = convert('<path d="M100 100 h200 v100 q50 50 0 100 t-100 0 a50 50 0 0 1 -50 -50 s-20 -20 -50 0 z" fill="#123456"/>')
  assert.equal(commands.length, 1)
  assert.equal(commands[0].shape, 'bezier')
  assert.equal(commands[0].fill, true)
  for (const point of commands[0].points) assert.ok(point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
  assert.equal((commands[0].points.length - 1) % 3, 0)
  assert.deepEqual(commands[0].points[0], commands[0].points.at(-1))
})

test('compact arc flags and straight paths are handled', () => {
  const arc = convert('<path d="M100 100a50 50 0 1150 50" fill="none" stroke="#000"/>')
  assert.equal(arc.commands[0].shape, 'bezier')
  const straight = convert('<path d="M10 10L100 10L100 100Z" fill="#00ff00"/>')
  assert.equal(straight.commands[0].shape, 'polygon')
  assert.equal(straight.commands[0].points.length, 3)
})

test('groups pass down style and transform, and use inlines a definition', () => {
  const { commands } = convert('<defs><rect id="tile" width="100" height="100"/></defs><g fill="#ff8800" opacity="0.5" transform="translate(200 100) scale(2)"><use href="#tile" x="10" y="0"/></g>')
  assert.equal(commands.length, 1)
  assert.equal(commands[0].color, '#ff8800')
  assert.equal(commands[0].opacity, 0.5)
  assert.deepEqual(commands[0].points[0], { x: 220 / 1024, y: 100 / 768 })
  assert.deepEqual(commands[0].points[2], { x: 420 / 1024, y: 300 / 768 })
})

test('fill and stroke on one shape become two strokes; long filled paths flatten with a warning', () => {
  const both = convert('<circle cx="500" cy="400" r="50" fill="#fff" stroke="#000" stroke-width="3"/>')
  assert.deepEqual(both.commands.map(item => item.fill), [true, false])
  let d = 'M0 0'
  for (let i = 0; i < 80; i++) d += ` C${i} 0 ${i + 1} 5 ${i + 1} 10`
  const long = convert(`<path d="${d} Z" fill="#000"/>`)
  assert.equal(long.commands[0].shape, 'polygon')
  assert.match(long.warnings[0], /flattened to a polygon/)
})

test('gradients are averaged with a warning; unsupported features are refused by name', () => {
  const gradient = convert('<defs><linearGradient id="g"><stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/>')
  assert.equal(gradient.commands[0].color, '#808080')
  assert.match(gradient.warnings[0], /average color/)
  assert.throws(() => convert('<text x="1" y="1">hi</text>'), /Unsupported SVG element <text>/)
  assert.throws(() => convert('<rect width="5" height="5" filter="url(#f)"/>'), /Unsupported SVG attribute filter/)
  assert.throws(() => convert('<style>.a{fill:red}</style>'), /<style>/)
  assert.throws(() => svgToSketchCommands('<svg viewBox="0 0 100 100"><rect width="5" height="5"/></svg>', { width: 1024, height: 768 }), /does not match the 1024x768/)
})

test('points outside the canvas are clamped and counted', () => {
  const result = convert('<rect x="-50" y="-50" width="2000" height="2000" fill="#000"/>')
  assert.ok(result.clamped > 0)
  assert.deepEqual(result.commands[0].points[0], { x: 0, y: 0 })
})

test('applySketchCommands expands svg into the document and keeps ids unique across batches', () => {
  const first = applySketchCommands(doc, [{ op: 'svg', svg: wrap('<rect width="512" height="384" fill="#112233"/>') }]).layers[0].strokes
  assert.equal(first.length, 1)
  const second = applySketchCommands({ ...doc, layers: [{ ...doc.layers[0], strokes: first }] }, [{ op: 'svg', svg: wrap('<circle cx="100" cy="100" r="20" fill="#fff"/>'), layer: 1 }])
  const ids = second.layers[0].strokes.map(stroke => stroke.id)
  assert.equal(ids.length, 2)
  assert.equal(new Set(ids).size, 2)
})

test('an svg batch reports gradient warnings back through the report object', () => {
  const report = {}
  applySketchCommands(doc, [{ op: 'svg', svg: wrap('<defs><linearGradient id="g"><stop stop-color="#f00"/><stop stop-color="#00f"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/>') }], report)
  assert.match(report.warnings[0], /average color/)
})
