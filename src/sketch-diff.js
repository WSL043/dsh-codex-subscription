// A picture of where two renderings differ, for the drawing agent: brightness, colour and edge differences are combined
// and shown as a heat map (dark = matches, blue to red = increasingly different). Both inputs are {data (RGBA), width, height}.
const luma = (data, at) => data[at] * .299 + data[at + 1] * .587 + data[at + 2] * .114

function lumaPlane(picture) {
  const { data, width, height } = picture, plane = new Float32Array(width * height)
  for (let i = 0; i < plane.length; i++) plane[i] = luma(data, i * 4)
  return plane
}

function gradient(plane, width, height) {
  const out = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const at = y * width + x
    const gx = plane[at - width + 1] + 2 * plane[at + 1] + plane[at + width + 1] - plane[at - width - 1] - 2 * plane[at - 1] - plane[at + width - 1]
    const gy = plane[at + width - 1] + 2 * plane[at + width] + plane[at + width + 1] - plane[at - width - 1] - 2 * plane[at - width] - plane[at - width + 1]
    out[at] = Math.hypot(gx, gy) / 4
  }
  return out
}

const percentile = (values, share) => {
  const sample = []
  const stride = Math.max(1, Math.floor(values.length / 20_000))
  for (let i = 0; i < values.length; i += stride) sample.push(values[i])
  sample.sort((a, b) => a - b)
  return sample[Math.min(sample.length - 1, Math.floor(sample.length * share))] || 1e-6
}

const STOPS = [[0, [24, 24, 28]], [.12, [24, 24, 28]], [.3, [40, 80, 230]], [.5, [30, 200, 220]], [.72, [250, 220, 40]], [1, [235, 30, 30]]]
const heat = value => {
  for (let i = 1; i < STOPS.length; i++) {
    if (value <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], part = (value - a) / (b - a || 1)
      return ca.map((channel, k) => channel + (cb[k] - channel) * part)
    }
  }
  return STOPS.at(-1)[1]
}

export function diffHeatmap(reference, drawing) {
  const { width, height } = reference, count = width * height
  const lumaR = lumaPlane(reference), lumaD = lumaPlane(drawing)
  const gradR = gradient(lumaR, width, height), gradD = gradient(lumaD, width, height)
  const bright = new Float32Array(count), color = new Float32Array(count), edge = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const at = i * 4
    const cbR = reference.data[at + 2] - lumaR[i], crR = reference.data[at] - lumaR[i], cbD = drawing.data[at + 2] - lumaD[i], crD = drawing.data[at] - lumaD[i]
    bright[i] = Math.abs(lumaR[i] - lumaD[i])
    color[i] = Math.hypot(cbR - cbD, crR - crD)
    edge[i] = Math.abs(gradR[i] - gradD[i])
  }
  const [pb, pc, pe] = [bright, color, edge].map(values => percentile(values, .97))
  const out = new Uint8ClampedArray(count * 4)
  for (let i = 0; i < count; i++) {
    const mix = .3 * bright[i] / pb + .45 * color[i] / pc + .25 * edge[i] / pe
    const [r, g, b] = heat(Math.min(1, Math.pow(Math.min(1, mix / 1.3), .7)))
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255
  }
  return { data: out, width, height }
}
