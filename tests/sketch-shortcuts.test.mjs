import test from 'node:test'
import assert from 'node:assert/strict'
import { sketchShortcutAction } from '../src/sketch-shortcuts.js'

test('configured shortcuts win over built-in convenience aliases', () => {
  assert.equal(sketchShortcutAction({pen:'v',line:'t',eraser:'+'},'V'),'pen')
  assert.equal(sketchShortcutAction({pen:'v',line:'t',eraser:'+'},'t'),'line')
  assert.equal(sketchShortcutAction({pen:'v',line:'t',eraser:'+'},'+'),'eraser')
})
test('unbound aliases and configured navigation remain available', () => {
  const keys={pen:'b',pan:' ',zoomIn:'=',zoomOut:'-',fit:'0'}
  assert.equal(sketchShortcutAction(keys,'v'),'select')
  assert.equal(sketchShortcutAction(keys,'t'),'text')
  assert.equal(sketchShortcutAction(keys,'+'),'zoomIn')
  assert.equal(sketchShortcutAction(keys,' '),'pan')
  assert.equal(sketchShortcutAction(keys,'0'),'fit')
  assert.equal(sketchShortcutAction(keys,'q'),undefined)
})
