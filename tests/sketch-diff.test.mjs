import assert from 'node:assert/strict'
import test from 'node:test'
import { diffHeatmap } from '../src/sketch-diff.js'

const picture = (width, height, paint) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([...paint(x, y), 255], (y * width + x) * 4)
  return { data, width, height }
}
const at = (map, x, y) => [...map.data.slice((y * map.width + x) * 4, (y * map.width + x) * 4 + 3)]

test('where the pictures match the heat map stays dark, where they differ it turns hot', () => {
  const reference = picture(40, 40, (x) => x < 20 ? [255, 255, 255] : [30, 30, 30])
  const drawing = picture(40, 40, (x, y) => y < 20 ? (x < 20 ? [255, 255, 255] : [30, 30, 30]) : (x < 20 ? [255, 255, 255] : [200, 40, 40]))
  const map = diffHeatmap(reference, drawing)
  const [r, g, b] = at(map, 8, 8)
  assert.ok(r < 40 && g < 40 && b < 40, 'matching area is dark')
  const hot = at(map, 30, 30)
  assert.ok(hot[0] > 150 && hot[2] < 120, 'a wrong colour is hot: ' + hot)
  assert.equal(map.width, 40)
})
