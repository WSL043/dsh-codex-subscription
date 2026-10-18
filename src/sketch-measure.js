// Numbers instead of eyeballing: how far a drawing is from its reference picture, cell by cell, and what colour the
// reference has at given spots. Both pictures are {data (RGBA), width, height} of the same size.
const hex = (r, g, b) => '#' + [r, g, b].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')

function average(picture, x0, y0, x1, y1) {
  const { data, width, height } = picture
  const left = Math.max(0, Math.floor(x0)), top = Math.max(0, Math.floor(y0)), right = Math.min(width, Math.max(left + 1, Math.ceil(x1))), bottom = Math.min(height, Math.max(top + 1, Math.ceil(y1)))
  let r = 0, g = 0, b = 0, n = 0
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) { const at = (y * width + x) * 4; r += data[at]; g += data[at + 1]; b += data[at + 2]; n++ }
  return n ? [r / n, g / n, b / n] : [255, 255, 255]
}

export function measureDifference(reference, drawing, { columns = 6, rows = 8, worst = 10 } = {}) {
  const { width, height } = reference
  const cells = []
  let total = 0
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x0 = column * width / columns, x1 = (column + 1) * width / columns, y0 = row * height / rows, y1 = (row + 1) * height / rows
    let sum = 0, n = 0
    const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 24))
    for (let y = Math.floor(y0); y < y1; y += step) for (let x = Math.floor(x0); x < x1; x += step) {
      const at = (y * width + x) * 4
      sum += Math.abs(reference.data[at] - drawing.data[at]) + Math.abs(reference.data[at + 1] - drawing.data[at + 1]) + Math.abs(reference.data[at + 2] - drawing.data[at + 2])
      n++
    }
    const error = n ? sum / n / 3 / 255 * 100 : 0
    total += error
    const ref = average(reference, x0, y0, x1, y1), art = average(drawing, x0, y0, x1, y1)
    cells.push({ column, row, x: x0 / width, y: y0 / height, w: (x1 - x0) / width, h: (y1 - y0) / height, error: Math.round(error * 10) / 10, reference: hex(...ref), drawing: hex(...art), tone: Math.round((art[0] + art[1] + art[2] - ref[0] - ref[1] - ref[2]) / 3) })
  }
  cells.sort((a, b) => b.error - a.error)
  return { error: Math.round(total / cells.length * 10) / 10, worst: cells.slice(0, worst) }
}

// Reference (and drawing) colour around each point, averaged over a small square of `radius` normalised units.
export function sampleColors(reference, drawing, points, radius = 0.004) {
  return points.map(point => {
    const { width, height } = reference
    const box = [(point.x - radius) * width, (point.y - radius) * height, (point.x + radius) * width, (point.y + radius) * height]
    return { x: point.x, y: point.y, reference: hex(...average(reference, ...box)), drawing: hex(...average(drawing, ...box)) }
  })
}

// The main colours of a picture (k-means from a sample), with the share of the area each covers.
export function dominantColors(picture, count) {
  const { data, width, height } = picture
  const pixels = width * height, stride = Math.max(1, Math.floor(pixels / 20_000)), sample = []
  for (let i = 0; i < pixels; i += stride) sample.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]])
  const total = Math.min(count, sample.length)
  if (!total) return []
  const mean = sample.reduce((sum, color) => [sum[0] + color[0], sum[1] + color[1], sum[2] + color[2]], [0, 0, 0]).map(value => value / sample.length)
  const centers = [mean]
  const nearest = sample.map(color => (color[0] - mean[0]) ** 2 + (color[1] - mean[1]) ** 2 + (color[2] - mean[2]) ** 2)
  while (centers.length < total) {
    let at = 0
    for (let i = 1; i < sample.length; i++) if (nearest[i] > nearest[at]) at = i
    if (nearest[at] === 0) break
    const center = sample[at].slice()
    centers.push(center)
    for (let i = 0; i < sample.length; i++) nearest[i] = Math.min(nearest[i], (sample[i][0] - center[0]) ** 2 + (sample[i][1] - center[1]) ** 2 + (sample[i][2] - center[2]) ** 2)
  }
  let sums = centers.map(() => [0, 0, 0, 0])
  for (let round = 0; round < 8; round++) {
    sums = centers.map(() => [0, 0, 0, 0])
    for (const color of sample) {
      let best = 0, bestDistance = Infinity
      for (let c = 0; c < centers.length; c++) {
        const d = (color[0] - centers[c][0]) ** 2 + (color[1] - centers[c][1]) ** 2 + (color[2] - centers[c][2]) ** 2
        if (d < bestDistance) { bestDistance = d; best = c }
      }
      const sum = sums[best]; sum[0] += color[0]; sum[1] += color[1]; sum[2] += color[2]; sum[3]++
    }
    sums.forEach((sum, c) => { if (sum[3]) centers[c] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]] })
  }
  return centers.map((center, c) => ({ color: hex(...center), share: Math.round(sums[c][3] / sample.length * 1000) / 10 })).filter(item => item.share > 0).sort((a, b) => b.share - a.share)
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// A ruler laid across the picture: the colour runs met along a line (positions as 0..1 of the picture), so edges can be placed exactly.
export function scanLine(picture, line, { tolerance = 36, maxRuns = 40 } = {}) {
  const { data, width, height } = picture
  const length = Math.max(2, Math.round(Math.hypot((line.x2 - line.x1) * width, (line.y2 - line.y1) * height)))
  const runs = []
  let current
  for (let i = 0; i <= length; i++) {
    const t = i / length, x = Math.min(width - 1, Math.max(0, Math.round((line.x1 + (line.x2 - line.x1) * t) * (width - 1)))), y = Math.min(height - 1, Math.max(0, Math.round((line.y1 + (line.y2 - line.y1) * t) * (height - 1))))
    const at = (y * width + x) * 4, color = [data[at], data[at + 1], data[at + 2]]
    if (current && distance(color, current.mean) <= tolerance) {
      current.to = t; current.n++
      for (let k = 0; k < 3; k++) current.sum[k] += color[k]
      current.mean = current.sum.map(value => value / current.n)
    } else {
      current = { from: t, to: t, n: 1, sum: [...color], mean: color }
      runs.push(current)
    }
  }
  const point = t => ({ x: Math.round((line.x1 + (line.x2 - line.x1) * t) * 1000) / 1000, y: Math.round((line.y1 + (line.y2 - line.y1) * t) * 1000) / 1000 })
  // Very short runs are anti-aliasing at an edge; fold them into the previous run.
  const merged = []
  for (const run of runs) {
    if (merged.length && run.n < 3) { merged.at(-1).to = run.to; continue }
    merged.push({ ...run })
  }
  return merged.slice(0, maxRuns).map(run => ({ from: point(run.from), to: point(run.to), color: hex(...run.mean) }))
}

// Where each main colour sits in the picture: its share, centre and the box that holds most of it (outliers trimmed).
export function colorRegions(picture, count) {
  const colors = dominantColors(picture, count)
  if (!colors.length) return []
  const { data, width, height } = picture
  const centers = colors.map(item => [1, 3, 5].map(at => Number.parseInt(item.color.slice(at, at + 2), 16)))
  const xs = colors.map(() => []), ys = colors.map(() => [])
  const stride = Math.max(1, Math.floor(Math.sqrt(width * height / 40_000)))
  for (let y = 0; y < height; y += stride) for (let x = 0; x < width; x += stride) {
    const at = (y * width + x) * 4, pixel = [data[at], data[at + 1], data[at + 2]]
    let best = 0, bestDistance = Infinity
    for (let c = 0; c < centers.length; c++) { const d = distance(pixel, centers[c]); if (d < bestDistance) { bestDistance = d; best = c } }
    xs[best].push(x / width); ys[best].push(y / height)
  }
  const cut = (values, share) => { values.sort((a, b) => a - b); return values[Math.min(values.length - 1, Math.floor(values.length * share))] }
  const round = value => Math.round(value * 1000) / 1000
  return colors.map((item, c) => {
    if (!xs[c].length) return { ...item }
    const x0 = cut(xs[c], .02), x1 = cut(xs[c], .98), y0 = cut(ys[c], .02), y1 = cut(ys[c], .98)
    const cx = xs[c].reduce((sum, value) => sum + value, 0) / xs[c].length, cy = ys[c].reduce((sum, value) => sum + value, 0) / ys[c].length
    return { ...item, center: { x: round(cx), y: round(cy) }, box: { x: round(x0), y: round(y0), width: round(x1 - x0), height: round(y1 - y0) } }
  })
}
