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

test('a gradient on a stroke line is averaged with a warning; unsupported features are refused by name', () => {
  const gradient = convert('<defs><linearGradient id="g"><stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><path d="M0 0L100 100" fill="none" stroke="url(#g)" stroke-width="4"/>')
  assert.equal(gradient.commands[0].color, '#808080')
  assert.match(gradient.warnings[0], /average color/)
  assert.throws(() => convert('<text x="1" y="1">hi</text>'), /Unsupported SVG element <text>/)
  assert.throws(() => convert('<rect width="5" height="5" mask="url(#f)"/>'), /Unsupported SVG attribute mask/)
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
  applySketchCommands(doc, [{ op: 'svg', svg: wrap('<defs><linearGradient id="g"><stop stop-color="#f00"/><stop stop-color="#00f"/></linearGradient></defs><path d="M0 0L200 200" fill="none" stroke="url(#g)" stroke-width="5"/>') }], report)
  assert.match(report.warnings[0], /average color/)
})

test('an over-budget batch says which limit it hit and what to do', () => {
  let body = ''
  for (let i = 0; i < 1100; i++) body += `<rect x="${i % 900}" y="${i % 700}" width="9" height="9" fill="#123456" stroke="#000"/>`
  assert.throws(() => applySketchCommands(doc, [{ op: 'svg', svg: wrap(body) }]), /2200 strokes; the limit is 2000\. Merge shapes/)
})

test('gradient fills stay real gradients, relative to the shape box', () => {
  const object = convert('<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcc66"/><stop offset="1" stop-color="#ff6644" stop-opacity="0.5"/></linearGradient></defs><rect x="100" y="100" width="200" height="300" fill="url(#g)"/>')
  const gradient = object.commands[0].gradient
  assert.equal(object.warnings.length, 0)
  assert.equal(gradient.type, 'linear')
  assert.deepEqual([gradient.x1, gradient.y1, gradient.x2, gradient.y2], [0, 0, 0, 1])
  assert.deepEqual(gradient.stops, [{ offset: 0, color: '#ffcc66' }, { offset: 1, color: '#ff6644', opacity: 0.5 }])
  const user = convert('<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="768"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect x="0" y="384" width="1024" height="384" fill="url(#g)"/>').commands[0].gradient
  assert.deepEqual([user.y1, user.y2], [-1, 1])
  const radial = convert('<defs><radialGradient id="r" cx="512" cy="384" r="256" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient></defs><rect width="1024" height="768" fill="url(#r)"/>').commands[0].gradient
  assert.equal(radial.type, 'radial')
  assert.deepEqual([radial.cx, radial.cy, radial.r, radial.ry], [.5, .5, .25, .3333])
  const shared = convert('<defs><linearGradient id="base"><stop offset="0" stop-color="#111"/><stop offset="1" stop-color="#eee"/></linearGradient><linearGradient id="g" href="#base" x2="1" y2="0"/></defs><rect width="10" height="10" fill="url(#g)"/>').commands[0].gradient
  assert.equal(shared.stops.length, 2)
  assert.deepEqual([shared.x2, shared.y2], [1, 0])
})

test('a blur filter becomes a soft edge on the shapes it covers', () => {
  const result = convert('<defs><filter id="b"><feGaussianBlur stdDeviation="12"/></filter></defs><circle cx="200" cy="200" r="80" fill="#ffd27a" filter="url(#b)"/><circle cx="500" cy="200" r="30" fill="#fff"/>')
  assert.equal(result.commands[0].blur, 12)
  assert.equal(result.commands[1].blur, undefined)
  const other = convert('<defs><filter id="d"><feGaussianBlur stdDeviation="4"/><feOffset dx="3"/></filter></defs><g filter="url(#d)"><rect width="50" height="50"/></g>')
  assert.equal(other.commands[0].blur, 4)
  assert.ok(other.warnings.some(item => /only feGaussianBlur/.test(item)))
})

test('native commands accept gradient and blur, reject them where they cannot apply', () => {
  const stops = [{ offset: 0, color: '#112233' }, { offset: 1, color: '#ffffff' }]
  const next = applySketchCommands(doc, [{ op: 'stroke', shape: 'rectangle', color: '#000000', fill: true, points: [{ x: .1, y: .1 }, { x: .5, y: .5 }], gradient: { type: 'linear', stops }, blur: 8 }])
  const stroke = next.layers[0].strokes[0]
  assert.equal(stroke.gradient.type, 'linear')
  assert.equal(stroke.blur, 8)
  assert.throws(() => applySketchCommands(doc, [{ op: 'stroke', shape: 'line', color: '#000000', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], gradient: { type: 'linear', stops } }]), /gradient needs fill/i)
  assert.throws(() => applySketchCommands(doc, [{ op: 'stroke', shape: 'circle', color: '#000000', fill: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], gradient: { type: 'linear', stops: [stops[0]] } }]), /2–8 stops/)
  const id = next.layers[0].strokes[0].id
  const moved = applySketchCommands(next, [{ op: 'object', id, action: 'update', transform: { dx: .1 } }]).layers[0].strokes[0]
  assert.equal(moved.gradient.type, 'linear')
  assert.equal(moved.blur, 8)
  const cleared = applySketchCommands(next, [{ op: 'object', id, action: 'update', patch: { gradient: { type: 'none' }, blur: 0 } }]).layers[0].strokes[0]
  assert.equal(cleared.gradient, undefined)
  assert.equal(cleared.blur, undefined)
})

test('the painter fills with the gradient and blurs the stroke', async () => {
  const { paintSketch } = await import('../src/sketch-document.js')
  const calls = []
  const gradient = { addColorStop: (...args) => calls.push(['stop', ...args]) }
  const context = new Proxy({
    createLinearGradient: (...args) => { calls.push(['linear', ...args]); return gradient },
    createRadialGradient: (...args) => { calls.push(['radial', ...args]); return gradient },
    fill: () => calls.push(['fill', context.filter, context.fillStyle === gradient]),
    save() {}, restore() {}, translate() {}, scale() {},
  }, { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => { target[key] = value; return true } })
  const stops = [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff', opacity: .5 }]
  paintSketch(context, [
    { shape: 'rectangle', color: '#000000', width: 2, opacity: 1, fill: true, brush: 'pen', points: [{ x: .25, y: .25 }, { x: .75, y: .75 }], gradient: { type: 'linear', x1: 0, y1: 0, x2: 0, y2: 1, stops }, blur: 6 },
    { shape: 'circle', color: '#000000', width: 2, opacity: 1, fill: true, brush: 'pen', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], gradient: { type: 'radial', cx: .5, cy: .5, r: .5, fx: .5, fy: .5, stops } },
  ], 1000, true, 1000)
  assert.deepEqual(calls[0], ['linear', 0 + 250, 250, 250, 750])
  assert.deepEqual(calls[1], ['stop', 0, 'rgba(255,0,0,1)'])
  assert.deepEqual(calls[2], ['stop', 1, 'rgba(0,0,255,0.5)'])
  assert.deepEqual(calls[3], ['fill', 'blur(6px)', true])
  assert.deepEqual(calls[4], ['radial', 0, 0, 0, 0, 0, 1])
  assert.deepEqual(calls.at(-1), ['fill', 'none', true])
})

test('clip-path becomes a native clip and mix-blend-mode a blend, inherited through groups', () => {
  const result = convert('<defs><clipPath id="c"><circle cx="200" cy="200" r="100"/></clipPath></defs><g clip-path="url(#c)" style="mix-blend-mode:multiply"><rect x="0" y="0" width="1000" height="700" fill="#336699"/></g><rect width="10" height="10" fill="#fff"/>')
  const [shaded, plain] = result.commands
  assert.equal(shaded.blend, 'multiply')
  assert.equal(shaded.clip.shape, 'bezier')
  assert.equal(shaded.clip.points.length, 13)
  assert.ok(Math.abs(shaded.clip.points[0].x - 300 / 1024) < 1e-6)
  assert.equal(plain.clip, undefined)
  assert.equal(plain.blend, undefined)
  const polygon = convert('<defs><clipPath id="p"><polygon points="10,10 300,10 150,200"/></clipPath></defs><rect width="400" height="400" fill="#000" clip-path="url(#p)"/>').commands[0]
  assert.equal(polygon.clip.shape, 'polygon')
  assert.equal(polygon.clip.points.length, 3)
  const several = convert('<defs><clipPath id="s"><rect width="9" height="9"/><rect x="20" width="9" height="9"/></clipPath></defs><rect width="40" height="40" clip-path="url(#s)"/>')
  assert.ok(several.warnings.some(item => /only the first/.test(item)))
  const missing = convert('<rect width="40" height="40" clip-path="url(#nope)"/>')
  assert.ok(missing.warnings.some(item => /was ignored/.test(item)))
  assert.equal(missing.commands[0].clip, undefined)
})

test('native commands take blend and clip, layers blend, and clips follow their object', () => {
  const square = [{ x: .2, y: .2 }, { x: .6, y: .6 }]
  const next = applySketchCommands(doc, [
    { op: 'stroke', shape: 'rectangle', color: '#000000', fill: true, points: square, blend: 'multiply', clip: { shape: 'circle', points: square } },
    { op: 'layer', action: 'blend', value: 'screen' },
  ])
  const stroke = next.layers[0].strokes[0]
  assert.equal(stroke.blend, 'multiply')
  assert.equal(stroke.clip.shape, 'circle')
  assert.equal(next.layers[0].blend, 'screen')
  assert.equal(applySketchCommands(next, [{ op: 'layer', action: 'blend', value: 'normal' }]).layers[0].blend, undefined)
  assert.throws(() => applySketchCommands(doc, [{ op: 'stroke', shape: 'rectangle', color: '#000000', points: square, blend: 'plaid' }]), /blend must be/)
  assert.throws(() => applySketchCommands(doc, [{ op: 'stroke', shape: 'rectangle', color: '#000000', points: square, clip: { shape: 'polygon', points: square } }]), /3–2000/)
  const moved = applySketchCommands(next, [{ op: 'object', id: stroke.id, action: 'update', transform: { dx: .1 } }]).layers[0].strokes[0]
  assert.ok(Math.abs(moved.clip.points[0].x - .3) < 1e-9)
  assert.equal(moved.blend, 'multiply')
  const cleared = applySketchCommands(next, [{ op: 'object', id: stroke.id, action: 'update', patch: { clip: { shape: 'none' }, blend: 'normal' } }]).layers[0].strokes[0]
  assert.equal(cleared.clip, undefined)
  assert.equal(cleared.blend, undefined)
})

test('the painter clips to the clip shape and blends strokes and layers', async () => {
  const { paintSketch } = await import('../src/sketch-document.js')
  const calls = []
  const context = new Proxy({ save: () => calls.push('save'), restore: () => calls.push('restore'), clip: () => calls.push('clip'), fill: () => calls.push('fill') }, { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => { if (key === 'globalCompositeOperation') calls.push('op:' + value); target[key] = value; return true } })
  paintSketch(context, [{ shape: 'rectangle', color: '#000000', width: 2, opacity: 1, fill: true, brush: 'pen', points: [{ x: .1, y: .1 }, { x: .5, y: .5 }], blend: 'multiply', clip: { shape: 'circle', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }], 1000, true, 1000)
  assert.ok(calls.includes('op:multiply'))
  assert.deepEqual(calls.filter(call => ['save', 'clip', 'fill', 'restore'].includes(call)), ['save', 'clip', 'fill', 'restore'])
})
