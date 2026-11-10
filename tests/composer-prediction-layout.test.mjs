import test from 'node:test'
import assert from 'node:assert/strict'
import { predictionMinHeight } from '../src/composer-prediction-layout.js'

const style = overrides => ({
  boxSizing: 'content-box',
  paddingTop: '0px',
  paddingBottom: '0px',
  borderTopWidth: '0px',
  borderBottomWidth: '0px',
  minHeight: '0px',
  ...overrides,
})

test('border-box reserves the full prediction height without subtracting padding or borders', () => {
  const computed = style({ boxSizing: 'border-box', paddingTop: '12px', paddingBottom: '8px', borderTopWidth: '1px', borderBottomWidth: '2px' })
  assert.equal(predictionMinHeight(83, computed), 83)
})

test('content-box subtracts both vertical paddings and borders from the measured border box', () => {
  const computed = style({ paddingTop: '12px', paddingBottom: '8px', borderTopWidth: '1px', borderBottomWidth: '2px' })
  const minimum = predictionMinHeight(83, computed)
  assert.equal(minimum, 60)
  assert.equal(minimum + 12 + 8 + 1 + 2, 83, 'the resulting editor border box must fit the prediction')
})

test('fractional geometry is preserved rather than rounded and clipping the final line', () => {
  const computed = style({ paddingTop: '2.25px', paddingBottom: '3.5px', borderTopWidth: '0.5px', borderBottomWidth: '1.25px' })
  assert.equal(predictionMinHeight(69.75, computed), 62.25)
  assert.equal(predictionMinHeight(69.75, { ...computed, boxSizing: 'border-box' }), 69.75)
})

test('a shorter prediction never lowers the existing theme minimum in either box model', () => {
  for (const boxSizing of ['border-box', 'content-box']) {
    const computed = style({ boxSizing, minHeight: '72.5px', paddingTop: '10px', paddingBottom: '10px' })
    assert.equal(predictionMinHeight(40, computed), 72.5)
    assert.equal(predictionMinHeight(0, computed), 72.5)
  }
})

test('content-box compares the adjusted content height, not the raw border-box height, to the theme minimum', () => {
  const computed = style({ minHeight: '72px', paddingTop: '10px', paddingBottom: '10px', borderTopWidth: '1px', borderBottomWidth: '1px' })
  assert.equal(predictionMinHeight(90, computed), 72)
  assert.equal(predictionMinHeight(94, computed), 72)
  assert.equal(predictionMinHeight(102, computed), 80)
})

test('zero or negative available content height cannot produce a negative CSS minimum', () => {
  const computed = style({ paddingTop: '8px', paddingBottom: '9px', borderTopWidth: '1px', borderBottomWidth: '2px' })
  for (const height of [20, 10, 0, -1]) assert.equal(predictionMinHeight(height, computed), 0)
  for (const height of [0, -1]) assert.equal(predictionMinHeight(height, style({ boxSizing: 'border-box' })), 0)
})

test('auto minimums impose no numeric floor on prediction sizing', () => {
  for (const boxSizing of ['border-box', 'content-box']) {
    assert.equal(predictionMinHeight(48, style({ boxSizing, minHeight: 'auto' })), 48)
    assert.equal(predictionMinHeight(0, style({ boxSizing, minHeight: 'auto' })), 0)
  }
})

test('non-finite measurements are skipped rather than applied to layout', () => {
  for (const boxSizing of ['border-box', 'content-box']) {
    for (const height of [NaN, Infinity, -Infinity]) {
      assert.equal(predictionMinHeight(height, style({ boxSizing, minHeight: '72px' })), null)
    }
  }
})

test('computing a minimum does not mutate the sampled styles', () => {
  const computed = Object.freeze(style({ minHeight: '24px', paddingTop: '2px', paddingBottom: '2px' }))
  assert.equal(predictionMinHeight(60, computed), 56)
  assert.equal(computed.minHeight, '24px')
})
