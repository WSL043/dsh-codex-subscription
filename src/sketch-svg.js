import { normalizeGradient } from './sketch-effects.js'
// Import a subset of SVG as native, editable sketch commands.
//
// Models draw far more fluently in SVG path syntax than in a JSON list of
// Bezier points, so one `svg` command carries a whole illustration. Everything
// is converted to the sketch's own strokes (bezier, polygon, rectangle, circle,
// line), so the result stays editable and exportable like hand-made content.
// Anything that would change the picture but cannot be represented is refused
// with a message that names it, and approximations are reported as warnings.

export const MAX_SVG_CHARACTERS = 200_000
const MAX_BEZIER_SEGMENTS = 64
const FLATTEN_STEPS = 10

const NAMED_COLORS = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', brown: '#a52a2a', gray: '#808080', grey: '#808080',
  silver: '#c0c0c0', gold: '#ffd700', navy: '#000080', teal: '#008080', maroon: '#800000', olive: '#808000',
  lime: '#00ff00', aqua: '#00ffff', cyan: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', ivory: '#fffff0',
  beige: '#f5f5dc', tan: '#d2b48c', khaki: '#f0e68c', coral: '#ff7f50', salmon: '#fa8072', crimson: '#dc143c',
  indigo: '#4b0082', violet: '#ee82ee', turquoise: '#40e0d0', skyblue: '#87ceeb', darkgray: '#a9a9a9', darkgrey: '#a9a9a9',
  lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkred: '#8b0000', darkgreen: '#006400', darkblue: '#00008b', transparent: 'none',
}
const UNSUPPORTED = new Set(['text', 'tspan', 'image', 'foreignObject', 'mask', 'pattern', 'style', 'script', 'switch', 'marker', 'symbol'])
const IGNORED = new Set(['title', 'desc', 'metadata', 'defs', 'clipPath', 'linearGradient', 'radialGradient', 'stop', 'filter', 'feGaussianBlur', 'feDropShadow', 'feOffset', 'feColorMatrix', 'feFlood', 'feComposite', 'feMerge', 'feMergeNode', 'feBlend', 'feMorphology', 'feTurbulence', 'feComponentTransfer', 'namedview', 'sodipodi:namedview'])

const decode = value => value.split('&quot;').join('"').split('&apos;').join("'").split('&lt;').join('<').split('&gt;').join('>').split('&amp;').join('&')

function parseXml(text) {
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g
  const attribute = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  const root = { name: '#root', attrs: {}, children: [] }
  const stack = [root]
  for (let match = tag.exec(text); match; match = tag.exec(text)) {
    if (match[2] === undefined) continue
    if (match[1] === '/') {
      if (stack.length > 1 && stack.at(-1).name === match[2]) stack.pop()
      else throw Error(`SVG is malformed: unexpected </${match[2]}>`)
      continue
    }
    const attrs = {}
    for (let item = attribute.exec(match[3]); item; item = attribute.exec(match[3])) attrs[item[1]] = decode(item[2] ?? item[3])
    const node = { name: match[2], attrs, children: [] }
    stack.at(-1).children.push(node)
    if (match[4] !== '/') stack.push(node)
  }
  if (stack.length !== 1) throw Error(`SVG is malformed: <${stack.at(-1).name}> is not closed`)
  return root
}

const IDENTITY = [1, 0, 0, 1, 0, 0]
const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g
const numbers = text => (String(text ?? '').match(NUMBER) ?? []).map(Number)

function parseTransform(text) {
  let matrix = IDENTITY
  const source = String(text ?? '')
  const item = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g
  if (source.replace(item, '').replace(/[\s,]/g, '')) throw Error(`Unsupported SVG transform: ${source}`)
  for (let match = item.exec(source); match; match = item.exec(source)) {
    const v = numbers(match[2])
    let next
    if (match[1] === 'matrix' && v.length === 6) next = v
    else if (match[1] === 'translate' && v.length >= 1) next = [1, 0, 0, 1, v[0], v[1] ?? 0]
    else if (match[1] === 'scale' && v.length >= 1) next = [v[0], 0, 0, v[1] ?? v[0], 0, 0]
    else if (match[1] === 'rotate' && v.length >= 1) {
      const a = v[0] * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
      const turn = [c, s, -s, c, 0, 0]
      next = v.length >= 3 ? multiply(multiply([1, 0, 0, 1, v[1], v[2]], turn), [1, 0, 0, 1, -v[1], -v[2]]) : turn
    } else if (match[1] === 'skewX' && v.length === 1) next = [1, 0, Math.tan(v[0] * Math.PI / 180), 1, 0, 0]
    else if (match[1] === 'skewY' && v.length === 1) next = [1, Math.tan(v[0] * Math.PI / 180), 0, 1, 0, 0]
    else throw Error(`Unsupported SVG transform: ${match[0]}`)
    matrix = multiply(matrix, next)
  }
  return matrix
}

function parseColor(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text || text === 'none') return 'none'
  if (text === 'currentcolor') return '#000000'
  if (Object.hasOwn(NAMED_COLORS, text)) return NAMED_COLORS[text]
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text)
  if (hex) return hex[1].length === 3 ? `#${[...hex[1]].map(ch => ch + ch).join('')}` : text
  const rgb = /^rgba?\(([^)]*)\)$/.exec(text)
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean)
    const channel = part => Math.max(0, Math.min(255, Math.round(part.endsWith('%') ? parseFloat(part) * 2.55 : parseFloat(part))))
    if (parts.length >= 3) return `#${parts.slice(0, 3).map(part => channel(part).toString(16).padStart(2, '0')).join('')}`
  }
  throw Error(`Unsupported SVG color: ${value}. Use #rrggbb, #rgb, rgb(), a basic color name, none, or a gradient id.`)
}

function styleOf(node, parent) {
  const own = { ...node.attrs }
  if (own.style) {
    for (const rule of own.style.split(';')) {
      const at = rule.indexOf(':')
      if (at > 0) own[rule.slice(0, at).trim()] = rule.slice(at + 1).trim()
    }
  }
  const pick = (name, fallback) => own[name] === undefined || own[name] === 'inherit' ? fallback : own[name]
  const number = (name, fallback) => {
    const value = pick(name, undefined)
    return value === undefined ? fallback : Number.parseFloat(value)
  }
  return {
    fill: pick('fill', parent.fill),
    stroke: pick('stroke', parent.stroke),
    strokeWidth: number('stroke-width', parent.strokeWidth),
    fillOpacity: number('fill-opacity', parent.fillOpacity),
    strokeOpacity: number('stroke-opacity', parent.strokeOpacity),
    opacity: parent.opacity * number('opacity', 1),
    display: own.display === 'none' || own.visibility === 'hidden' ? 'none' : 'inline',
    blur: parent.blur ?? 0,
    blend: own['mix-blend-mode'] === undefined ? parent.blend : own['mix-blend-mode'] === 'normal' ? undefined : own['mix-blend-mode'],
    clip: parent.clip,
  }
}

// --- path data ---------------------------------------------------------------------------------

function arcToCubics(x1, y1, rx, ry, rotation, large, sweep, x2, y2) {
  if (x1 === x2 && y1 === y2) return []
  rx = Math.abs(rx); ry = Math.abs(ry)
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]]
  const phi = rotation * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi)
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda) }
  const sign = large === sweep ? -1 : 1
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const factor = sign * Math.sqrt(Math.max(0, numerator / denominator))
  const cxp = factor * rx * y1p / ry, cyp = -factor * ry * x1p / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const theta = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI
  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9))
  const step = delta / count, k = 4 / 3 * Math.tan(step / 4)
  const out = []
  for (let index = 0; index < count; index++) {
    const a1 = theta + index * step, a2 = a1 + step
    const point = (a, scale) => {
      const px = rx * Math.cos(a), py = ry * Math.sin(a)
      const tx = -rx * Math.sin(a) * scale, ty = ry * Math.cos(a) * scale
      return [cos * px - sin * py + cx, sin * px + cos * py + cy, cos * tx - sin * ty, sin * tx + cos * ty]
    }
    const p1 = point(a1, k), p2 = point(a2, k)
    out.push([p1[0] + p1[2], p1[1] + p1[3], p2[0] - p2[2], p2[1] - p2[3], p2[0], p2[1]])
  }
  return out
}

// Returns subpaths: { start:[x,y], curves:[[c1x,c1y,c2x,c2y,x,y],...], closed, straight }
function parsePathData(data) {
  // Arc flags may be written without separators ("a1 1 0 00 1 1"), so read the data by hand.
  const source = String(data ?? '')
  const subpaths = []
  let index = 0, command = '', current, x = 0, y = 0, startX = 0, startY = 0, lastControl, lastCommand = ''
  const skip = () => { while (index < source.length && /[\s,]/.test(source[index])) index++ }
  const readNumber = () => {
    skip()
    NUMBER.lastIndex = index
    const match = NUMBER.exec(source)
    if (!match || match.index !== index) throw Error(`Malformed SVG path data near "${source.slice(index, index + 12)}"`)
    index = NUMBER.lastIndex
    return Number(match[0])
  }
  const readFlag = () => {
    skip()
    const ch = source[index]
    if (ch !== '0' && ch !== '1') throw Error('Malformed SVG arc flag in path data')
    index++
    return ch === '1'
  }
  const begin = (px, py) => { current = { start: [px, py], curves: [], closed: false, straight: true }; subpaths.push(current) }
  const line = (px, py) => { current.curves.push([x, y, px, py, px, py]); x = px; y = py }
  const cubic = (c1x, c1y, c2x, c2y, px, py) => { current.curves.push([c1x, c1y, c2x, c2y, px, py]); current.straight = false; lastControl = [c2x, c2y]; x = px; y = py }
  for (;;) {
    skip()
    if (index >= source.length) break
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(source[index])) command = source[index++]
    else if (!command) throw Error('SVG path data must start with a command')
    else if (command === 'M') command = 'L'
    else if (command === 'm') command = 'l'
    else if (command === 'Z' || command === 'z') throw Error('Unexpected number after Z in SVG path data')
    const relative = command === command.toLowerCase()
    const upper = command.toUpperCase()
    const ox = relative ? x : 0, oy = relative ? y : 0
    if (upper === 'M') {
      const px = readNumber() + ox, py = readNumber() + oy
      x = startX = px; y = startY = py
      begin(px, py)
      lastControl = undefined
    } else if (upper === 'Z') {
      if (current && !current.closed) {
        if (x !== startX || y !== startY) line(startX, startY)
        current.closed = true
      }
      x = startX; y = startY
      lastControl = undefined
      current = undefined
    } else {
      if (!current) { begin(x, y); startX = x; startY = y }
      if (upper === 'L') line(readNumber() + ox, readNumber() + oy)
      else if (upper === 'H') line(readNumber() + ox, y)
      else if (upper === 'V') line(x, readNumber() + oy)
      else if (upper === 'C') cubic(readNumber() + ox, readNumber() + oy, readNumber() + ox, readNumber() + oy, readNumber() + ox, readNumber() + oy)
      else if (upper === 'S') {
        const [rx, ry] = lastControl && lastCommand && 'CScs'.includes(lastCommand) ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y]
        cubic(rx, ry, readNumber() + ox, readNumber() + oy, readNumber() + ox, readNumber() + oy)
      } else if (upper === 'Q' || upper === 'T') {
        let qx, qy
        if (upper === 'Q') { qx = readNumber() + ox; qy = readNumber() + oy }
        else [qx, qy] = lastControl && lastCommand && 'QTqt'.includes(lastCommand) ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y]
        const px = readNumber() + ox, py = readNumber() + oy
        const from = [x, y]
        cubic(from[0] + 2 / 3 * (qx - from[0]), from[1] + 2 / 3 * (qy - from[1]), px + 2 / 3 * (qx - px), py + 2 / 3 * (qy - py), px, py)
        lastControl = [qx, qy]
      } else if (upper === 'A') {
        const rx = readNumber(), ry = readNumber(), rotation = readNumber(), large = readFlag(), sweep = readFlag()
        const px = readNumber() + ox, py = readNumber() + oy
        const pieces = arcToCubics(x, y, rx, ry, rotation, large, sweep, px, py)
        for (const piece of pieces) cubic(...piece)
        if (!pieces.length) { x = px; y = py }
        lastControl = undefined
      } else throw Error(`Unsupported SVG path command: ${command}`)
    }
    lastCommand = command
  }
  return subpaths.filter(subpath => subpath.curves.length > 0)
}

const ellipsePath = (cx, cy, rx, ry) => {
  const k = 0.5522847498
  return { start: [cx + rx, cy], closed: true, straight: false, curves: [
    [cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry],
    [cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy],
    [cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry],
    [cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy],
  ] }
}
const polylinePath = (points, closed) => {
  const path = { start: points[0], curves: [], closed, straight: true }
  let [x, y] = points[0]
  for (const [px, py] of points.slice(1)) { path.curves.push([x, y, px, py, px, py]); x = px; y = py }
  if (closed && (x !== points[0][0] || y !== points[0][1])) path.curves.push([x, y, points[0][0], points[0][1], points[0][0], points[0][1]])
  return path
}
const roundedRectPath = (x, y, w, h, rx, ry) => {
  rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2)
  const k = 0.5522847498
  const curves = []
  let cx = x + rx, cy = y
  const go = (...piece) => { curves.push(piece); cx = piece[4]; cy = piece[5] }
  go(cx, cy, x + w - rx, y, x + w - rx, y)
  go(x + w - rx + rx * k, y, x + w, y + ry - ry * k, x + w, y + ry)
  go(x + w, y + ry, x + w, y + h - ry, x + w, y + h - ry)
  go(x + w, y + h - ry + ry * k, x + w - rx + rx * k, y + h, x + w - rx, y + h)
  go(x + w - rx, y + h, x + rx, y + h, x + rx, y + h)
  go(x + rx - rx * k, y + h, x, y + h - ry + ry * k, x, y + h - ry)
  go(x, y + h - ry, x, y + ry, x, y + ry)
  go(x, y + ry - ry * k, x + rx - rx * k, y, x + rx, y)
  return { start: [x + rx, y], curves, closed: true, straight: false }
}

// --- conversion --------------------------------------------------------------------------------

export function svgToSketchCommands(text, { width, height, layer, existingIds = [] }) {
  if (typeof text !== 'string' || !text.trim()) throw Error('svg must be a non-empty SVG document')
  if (text.length > MAX_SVG_CHARACTERS) throw Error(`svg is too large: ${text.length} characters, limit ${MAX_SVG_CHARACTERS}. Split it across several svg commands.`)
  const root = parseXml(text).children.find(node => node.name === 'svg')
  if (!root) throw Error('svg must contain an <svg> element')
  const box = numbers(root.attrs.viewBox)
  const viewWidth = box.length === 4 ? box[2] : Number.parseFloat(root.attrs.width)
  const viewHeight = box.length === 4 ? box[3] : Number.parseFloat(root.attrs.height)
  const originX = box.length === 4 ? box[0] : 0, originY = box.length === 4 ? box[1] : 0
  if (!(viewWidth > 0 && viewHeight > 0)) throw Error('<svg> needs a viewBox="0 0 W H" (or width and height)')
  if (Math.abs(viewWidth / viewHeight - width / height) > 0.01 * (width / height)) {
    throw Error(`SVG viewBox ${viewWidth}x${viewHeight} does not match the ${width}x${height} sketch ratio. Use viewBox="0 0 ${width} ${height}".`)
  }

  const byId = new Map()
  const index = node => { if (node.attrs.id) byId.set(node.attrs.id, node); node.children.forEach(index) }
  index(root)
  const warnings = new Set()
  const used = new Set(existingIds)
  let counter = 0, clamped = 0
  const nextId = suffix => {
    for (;;) {
      counter++
      const id = `svg-${counter}${suffix}`
      if (!used.has(id)) { used.add(id); return id }
    }
  }
  const scale = width / viewWidth
  const commands = []
  const clamp = value => {
    if (value < 0 || value > 1) clamped++
    return Math.max(0, Math.min(1, value))
  }
  const norm = (matrix, px, py) => {
    const [tx, ty] = apply(matrix, px, py)
    return { x: clamp((tx - originX) / viewWidth), y: clamp((ty - originY) / viewHeight) }
  }

  const gradientNode = reference => {
    const target = byId.get(/^url\(\s*['"]?#([^)'"]+)['"]?\s*\)/.exec(reference)?.[1] ?? '')
    if (!target || !/Gradient$/.test(target.name)) throw Error(`SVG paint ${reference} does not reference a gradient defined in the same SVG`)
    return target
  }
  // A gradient may take its stops and attributes from another one through href.
  const gradientChain = target => {
    const chain = [target]
    for (let node = target; chain.length < 5;) {
      const href = node.attrs.href ?? node.attrs['xlink:href']
      node = href?.startsWith('#') ? byId.get(href.slice(1)) : undefined
      if (!node || !/Gradient$/.test(node.name)) break
      chain.push(node)
    }
    return chain
  }
  const gradientStops = target => {
    const holder = gradientChain(target).find(node => node.children.some(child => child.name === 'stop'))
    if (!holder) throw Error(`Gradient ${target.attrs.id} has no stops`)
    let last = 0
    return holder.children.filter(child => child.name === 'stop').map(stop => {
      const css = name => stop.attrs[name] ?? new RegExp(name + '\\s*:\\s*([^;]+)').exec(stop.attrs.style ?? '')?.[1]
      const raw = String(stop.attrs.offset ?? '0').trim()
      const offset = Math.max(last, Math.min(1, raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw) || 0))
      last = offset
      const opacity = Number.parseFloat(css('stop-opacity') ?? '1')
      return { offset, color: parseColor(css('stop-color') ?? '#000000'), opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1 }
    }).filter(stop => stop.color !== 'none')
  }
  const averageColor = (reference, warn) => {
    const target = gradientNode(reference)
    const colors = gradientStops(target).map(stop => stop.color)
    if (!colors.length) throw Error(`Gradient ${target.attrs.id} has no usable stops`)
    const channels = colors.map(color => [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16)))
    const mean = [0, 1, 2].map(channel => Math.round(channels.reduce((sum, item) => sum + item[channel], 0) / channels.length))
    if (warn) warnings.add(`Gradient ${target.attrs.id} was flattened to its average color (a gradient on a stroke line, or on a path that had to be split).`)
    return `#${mean.map(value => value.toString(16).padStart(2, '0')).join('')}`
  }
  const determinant = m => Math.abs(m[0] * m[3] - m[1] * m[2])
  // Build the native gradient of a filled shape, relative to the shape's own box.
  const nativeGradient = (reference, matrix, command) => {
    const target = gradientNode(reference)
    const chain = gradientChain(target)
    const attr = name => chain.find(node => node.attrs[name] !== undefined)?.attrs[name]
    const stops = gradientStops(target)
    if (stops.length < 2) return undefined
    const radial = target.name === 'radialGradient'
    const objectBox = (attr('gradientUnits') ?? 'objectBoundingBox') === 'objectBoundingBox'
    const xs = command.points.map(point => point.x), ys = command.points.map(point => point.y)
    const bx = Math.min(...xs), by = Math.min(...ys), bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by
    if (!(bw > 1e-4 && bh > 1e-4)) return undefined
    const gt = parseTransform(attr('gradientTransform'))
    const length = (name, fraction, axis) => {
      const raw = String(attr(name) ?? `${fraction * 100}%`).trim()
      if (!raw.endsWith('%')) return Number.parseFloat(raw) || 0
      const part = Number.parseFloat(raw) / 100
      return objectBox ? part : part * (axis === 'x' ? viewWidth : axis === 'y' ? viewHeight : Math.hypot(viewWidth, viewHeight) / Math.SQRT2)
    }
    const full = objectBox ? gt : multiply(matrix, gt)
    // A point of the gradient, as a fraction of the shape's box.
    const place = (x, y) => {
      const [px, py] = apply(full, x, y)
      return objectBox ? [px, py] : [((px - originX) / viewWidth - bx) / bw, ((py - originY) / viewHeight - by) / bh]
    }
    const colors = stops.map(stop => ({ offset: stop.offset, color: stop.color, opacity: stop.opacity }))
    if (!radial) {
      const [x1, y1] = place(length('x1', 0, 'x'), length('y1', 0, 'y'))
      const [x2, y2] = place(length('x2', 1, 'x'), length('y2', 0, 'y'))
      return normalizeGradient({ type: 'linear', x1, y1, x2, y2, stops: colors })
    }
    const cx0 = length('cx', .5, 'x'), cy0 = length('cy', .5, 'y'), r0 = length('r', .5, 'r')
    const [cx, cy] = place(cx0, cy0)
    const [fx, fy] = place(attr('fx') === undefined ? cx0 : length('fx', .5, 'x'), attr('fy') === undefined ? cy0 : length('fy', .5, 'y'))
    const k = Math.sqrt(determinant(full))
    const r = objectBox ? r0 * k : r0 * k / viewWidth / bw
    const ry = objectBox ? r0 * k : r0 * k / viewHeight / bh
    return normalizeGradient({ type: 'radial', cx, cy, r, ry, fx, fy, stops: colors })
  }
  const paint = value => String(value).startsWith('url(') ? averageColor(value, false) : parseColor(value)

  const emit = (subpath, matrix, style, id) => {
    const points = [subpath.start, ...subpath.curves.flatMap(curve => [[curve[0], curve[1]], [curve[2], curve[3]], [curve[4], curve[5]]])]
    const fillGradient = String(style.fill).startsWith('url(')
    const fill = style.fill === 'none' ? 'none' : paint(style.fill)
    const stroke = style.stroke === 'none' ? 'none' : String(style.stroke).startsWith('url(') ? averageColor(style.stroke, true) : paint(style.stroke)
    const blur = Math.min(64, Math.round(style.blur * scale * Math.sqrt(determinant(matrix)) * 10) / 10)
    const add = list => commands.push(...list.map(item => ({ ...item, ...(blur >= 0.5 ? { blur } : {}), ...(style.clip ? { clip: style.clip } : {}), ...(style.blend ? { blend: style.blend } : {}) })))
    const common = layer === undefined ? {} : { layer }
    const strokeWidth = Math.max(1, Math.min(256, (style.strokeWidth || 1) * scale * Math.hypot(matrix[0], matrix[1])))
    const segments = subpath.curves.length
    const closed = subpath.closed
    const straightPoints = [subpath.start, ...subpath.curves.map(curve => [curve[4], curve[5]])]
    const build = (color, opacity, filled, suffix) => {
      if (subpath.straight && straightPoints.length >= 2) {
        // A closed straight-line path ends by returning to its start; polygon closes itself.
        const vertices = closed ? straightPoints.slice(0, -1) : straightPoints
        if (filled || closed) {
          if (vertices.length >= 3) return [{ op: 'stroke', ...common, id: nextId(suffix), shape: 'polygon', color, opacity, fill: filled, width: strokeWidth, points: vertices.map(([px, py]) => norm(matrix, px, py)) }]
        }
        if (vertices.length === 2 && !filled) return [{ op: 'stroke', ...common, id: nextId(suffix), shape: 'line', color, opacity, fill: false, width: strokeWidth, points: vertices.map(([px, py]) => norm(matrix, px, py)) }]
        if (!filled) {
          const pieces = []
          for (let from = 0; from < vertices.length - 1; from += 1900) {
            pieces.push({ op: 'stroke', ...common, id: nextId(suffix), shape: 'pen', color, opacity, fill: false, width: strokeWidth, points: vertices.slice(from, from + 1901).map(([px, py]) => norm(matrix, px, py)) })
          }
          return pieces
        }
        return []
      }
      if (filled && segments > MAX_BEZIER_SEGMENTS) {
        warnings.add(`A filled path with ${segments} curve segments was flattened to a polygon (more than ${MAX_BEZIER_SEGMENTS} segments cannot stay a Bezier).`)
        const flat = [subpath.start]
        let [cx, cy] = subpath.start
        for (const [a, b, c1, d, e, f] of subpath.curves) {
          for (let step = 1; step <= FLATTEN_STEPS; step++) {
            const t = step / FLATTEN_STEPS, u = 1 - t
            flat.push([u * u * u * cx + 3 * u * u * t * a + 3 * u * t * t * c1 + t * t * t * e, u * u * u * cy + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * f])
          }
          cx = e; cy = f
        }
        if (flat.length > 2000) throw Error('A filled path is too complex to import; simplify it or split it into several paths.')
        return [{ op: 'stroke', ...common, id: nextId(suffix), shape: 'polygon', color, opacity, fill: true, width: strokeWidth, points: flat.map(([px, py]) => norm(matrix, px, py)) }]
      }
      const pieces = []
      for (let from = 0; from < segments; from += MAX_BEZIER_SEGMENTS) {
        const chunk = subpath.curves.slice(from, from + MAX_BEZIER_SEGMENTS)
        const start = from === 0 ? subpath.start : [subpath.curves[from - 1][4], subpath.curves[from - 1][5]]
        const chunkPoints = [start, ...chunk.flatMap(curve => [[curve[0], curve[1]], [curve[2], curve[3]], [curve[4], curve[5]]])]
        pieces.push({ op: 'stroke', ...common, id: nextId(suffix), shape: 'bezier', color, opacity, fill: filled, width: strokeWidth, points: chunkPoints.map(([px, py]) => norm(matrix, px, py)) })
      }
      return pieces
    }
    void points
    if (fill !== 'none' && style.fillOpacity * style.opacity > 0) {
      let pieces = build(fill, style.fillOpacity * style.opacity, true, '')
      if (fillGradient) {
        const gradient = pieces.length === 1 && ['rectangle', 'circle', 'polygon', 'bezier'].includes(pieces[0].shape) ? nativeGradient(style.fill, matrix, pieces[0]) : undefined
        if (gradient) pieces = [{ ...pieces[0], gradient }]
        else warnings.add('A gradient fill was flattened to its average color (the path was split into several pieces, or its box is empty).')
      }
      add(pieces)
    }
    if (stroke !== 'none' && style.strokeOpacity * style.opacity > 0 && style.strokeWidth > 0) add(build(stroke, style.strokeOpacity * style.opacity, false, '-line'))
    void id
  }

  // Only feGaussianBlur of a filter is kept (as a soft edge); the rest is ignored with a warning.
  const filterBlur = (reference, group) => {
    const target = byId.get(/^url\(\s*['"]?#([^)'"]+)['"]?\s*\)/.exec(reference)?.[1] ?? '')
    if (!target || target.name !== 'filter') { warnings.add(`Filter ${reference} was ignored (it must be a <filter> defined in the same SVG).`); return 0 }
    const blurs = target.children.filter(child => child.name === 'feGaussianBlur').map(child => Math.max(...numbers(child.attrs.stdDeviation ?? '0'), 0))
    if (target.children.some(child => child.name !== 'feGaussianBlur')) warnings.add(`Filter ${target.attrs.id ?? ''}: only feGaussianBlur is applied; other effects were ignored.`)
    if (blurs.length && group) warnings.add('A blur filter on a group softens each shape inside it separately.')
    return Math.max(0, ...blurs)
  }
  // Shapes inside a clipPath, as subpaths in the clip's coordinate system.
  const clipSubpaths = child => {
    const m = name => Number.parseFloat(child.attrs[name] ?? 0)
    switch (child.name) {
      case 'path': return parsePathData(child.attrs.d)
      case 'rect': {
        const w = m('width'), h = m('height')
        if (!(w > 0 && h > 0)) return []
        const rx = child.attrs.rx !== undefined ? m('rx') : child.attrs.ry !== undefined ? m('ry') : 0, ry = child.attrs.ry !== undefined ? m('ry') : rx
        return [rx > 0 || ry > 0 ? roundedRectPath(m('x'), m('y'), w, h, rx, ry) : polylinePath([[m('x'), m('y')], [m('x') + w, m('y')], [m('x') + w, m('y') + h], [m('x'), m('y') + h]], true)]
      }
      case 'circle': return m('r') > 0 ? [ellipsePath(m('cx'), m('cy'), m('r'), m('r'))] : []
      case 'ellipse': return m('rx') > 0 && m('ry') > 0 ? [ellipsePath(m('cx'), m('cy'), m('rx'), m('ry'))] : []
      case 'polygon': {
        const values = numbers(child.attrs.points), pts = []
        for (let at = 0; at + 1 < values.length; at += 2) pts.push([values[at], values[at + 1]])
        return pts.length >= 3 ? [polylinePath(pts, true)] : []
      }
      default: return []
    }
  }
  // clip-path="url(#id)": the first shape of the clipPath, placed with the referencing element's matrix, as a native clip.
  const clipFor = (reference, matrix) => {
    const target = byId.get(/^url\(\s*['"]?#([^)'"]+)['"]?\s*\)/.exec(reference)?.[1] ?? '')
    if (!target || target.name !== 'clipPath') { warnings.add(`clip-path ${reference} was ignored (it must be a <clipPath> defined in the same SVG).`); return undefined }
    const shapes = target.children.filter(child => ['path', 'rect', 'circle', 'ellipse', 'polygon'].includes(child.name))
    if (!shapes.length) { warnings.add(`clipPath ${target.attrs.id ?? ''} has no path, rect, circle, ellipse or polygon and was ignored.`); return undefined }
    if (shapes.length > 1) warnings.add(`clipPath ${target.attrs.id ?? ''} has several shapes; only the first is used (merge them into one path).`)
    const placed = multiply(multiply(matrix, parseTransform(target.attrs.transform)), parseTransform(shapes[0].attrs.transform))
    const subpath = clipSubpaths(shapes[0])[0]
    if (!subpath) return undefined
    const toPoint = ([px, py]) => norm(placed, px, py)
    const straightPoints = [subpath.start, ...subpath.curves.map(curve => [curve[4], curve[5]])]
    if (subpath.straight && straightPoints.length >= 3) {
      const vertices = subpath.closed ? straightPoints.slice(0, -1) : straightPoints
      return vertices.length >= 3 ? { shape: 'polygon', points: vertices.slice(0, 2000).map(toPoint) } : undefined
    }
    if (subpath.curves.length <= MAX_BEZIER_SEGMENTS) return { shape: 'bezier', points: [subpath.start, ...subpath.curves.flatMap(curve => [[curve[0], curve[1]], [curve[2], curve[3]], [curve[4], curve[5]]])].map(toPoint) }
    const flat = [subpath.start]
    let [cx, cy] = subpath.start
    for (const [a, b, c1, d, e, g] of subpath.curves) {
      for (let step = 1; step <= FLATTEN_STEPS; step++) {
        const t = step / FLATTEN_STEPS, u = 1 - t
        flat.push([u * u * u * cx + 3 * u * u * t * a + 3 * u * t * t * c1 + t * t * t * e, u * u * u * cy + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * g])
      }
      cx = e; cy = g
    }
    return flat.length >= 3 && flat.length <= 2000 ? { shape: 'polygon', points: flat.map(toPoint) } : undefined
  }
  const walk = (node, matrix, parentStyle, depth) => {
    if (depth > 24) throw Error('SVG is nested too deeply')
    if (UNSUPPORTED.has(node.name)) throw Error(`Unsupported SVG element <${node.name}>. Draw with path, rect, circle, ellipse, line, polyline, polygon, g and use; add text with a native text command.`)
    if (IGNORED.has(node.name)) return
    if (node.attrs.mask && node.attrs.mask !== 'none') throw Error('Unsupported SVG attribute mask. Bake it into the shapes instead.')
    const style = styleOf(node, parentStyle)
    if (style.display === 'none') return
    const filterValue = (node.attrs.filter ?? /(?:^|;)\s*filter\s*:\s*([^;]+)/.exec(node.attrs.style ?? '')?.[1] ?? 'none').trim()
    if (filterValue !== 'none') style.blur = Math.max(style.blur, filterBlur(filterValue, ['g', 'svg', 'a', 'use'].includes(node.name)))
    const local = multiply(matrix, parseTransform(node.attrs.transform))
    const clipValue = (node.attrs['clip-path'] ?? /(?:^|;)\s*clip-path\s*:\s*([^;]+)/.exec(node.attrs.style ?? '')?.[1] ?? 'none').trim()
    if (clipValue !== 'none') style.clip = clipFor(clipValue, local)
    const n = name => Number.parseFloat(node.attrs[name] ?? 0)
    const finish = subpaths => subpaths.forEach(subpath => emit(subpath, local, style, node.attrs.id))
    switch (node.name) {
      case 'svg': case 'g': case 'a':
        for (const child of node.children) walk(child, local, style, depth + 1)
        return
      case 'use': {
        const href = node.attrs.href ?? node.attrs['xlink:href']
        const target = href?.startsWith('#') ? byId.get(href.slice(1)) : undefined
        if (!target) throw Error(`<use> must reference an element in the same SVG (${href ?? 'missing href'})`)
        walk(target, multiply(local, [1, 0, 0, 1, n('x'), n('y')]), { ...style }, depth + 1)
        return
      }
      case 'path': finish(parsePathData(node.attrs.d)); return
      case 'rect': {
        const w = n('width'), h = n('height')
        if (!(w > 0 && h > 0)) return
        const rx = node.attrs.rx !== undefined ? n('rx') : node.attrs.ry !== undefined ? n('ry') : 0
        const ry = node.attrs.ry !== undefined ? n('ry') : rx
        finish([rx > 0 || ry > 0 ? roundedRectPath(n('x'), n('y'), w, h, rx, ry) : polylinePath([[n('x'), n('y')], [n('x') + w, n('y')], [n('x') + w, n('y') + h], [n('x'), n('y') + h]], true)])
        return
      }
      case 'circle': if (n('r') > 0) finish([ellipsePath(n('cx'), n('cy'), n('r'), n('r'))]); return
      case 'ellipse': if (n('rx') > 0 && n('ry') > 0) finish([ellipsePath(n('cx'), n('cy'), n('rx'), n('ry'))]); return
      case 'line': finish([polylinePath([[n('x1'), n('y1')], [n('x2'), n('y2')]], false)]); return
      case 'polyline': case 'polygon': {
        const values = numbers(node.attrs.points)
        if (values.length < 4 || values.length % 2) throw Error(`<${node.name}> needs an even number of coordinates, at least two points`)
        const pts = []
        for (let at = 0; at < values.length; at += 2) pts.push([values[at], values[at + 1]])
        finish([polylinePath(pts, node.name === 'polygon')])
        return
      }
      default: throw Error(`Unsupported SVG element <${node.name}>`)
    }
  }
  const base = { fill: '#000000', stroke: 'none', strokeWidth: 1, fillOpacity: 1, strokeOpacity: 1, opacity: 1, blur: 0 }
  walk(root, IDENTITY, base, 0)
  if (!commands.length) throw Error('The SVG contained no drawable shapes')
  return { commands, warnings: [...warnings], clamped }
}

// Replace `svg` commands with the native commands they stand for.
export function expandSvgCommands(commands, doc, report) {
  if (!commands.some(command => command?.op === 'svg')) return commands
  const width = doc.width ?? 1024, height = doc.height ?? 1024
  const ids = new Set(doc.layers.flatMap(item => item.strokes.map(stroke => stroke.id).filter(Boolean)))
  const out = []
  let clamped = 0
  for (const command of commands) {
    if (command?.op !== 'svg') { out.push(command); if (command?.id) ids.add(command.id); continue }
    const result = svgToSketchCommands(command.svg, { width, height, layer: command.layer, existingIds: ids })
    result.commands.forEach(item => ids.add(item.id))
    out.push(...result.commands)
    clamped += result.clamped
    if (report) report.warnings = [...new Set([...(report.warnings ?? []), ...result.warnings])]
  }
  if (report && clamped) report.clampedPoints = (report.clampedPoints ?? 0) + clamped
  return out
}
