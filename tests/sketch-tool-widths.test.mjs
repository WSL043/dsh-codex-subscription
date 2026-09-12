import test from 'node:test'
import assert from 'node:assert/strict'
import { switchSketchToolWidth, stepSketchWidth } from '../src/sketch-tool-widths.js'

test('eraser, text and individual brushes remember independent widths', () => {
  const memory={}
  assert.equal(switchSketchToolWidth(memory,{tool:'pen',brush:'pencil',width:7},{tool:'eraser'}),24)
  assert.equal(switchSketchToolWidth(memory,{tool:'eraser',width:140},{tool:'pen',brush:'pencil'}),7)
  assert.equal(switchSketchToolWidth(memory,{tool:'pen',brush:'pencil',width:7},{tool:'text'}),32)
  assert.equal(switchSketchToolWidth(memory,{tool:'text',width:96},{tool:'pen',brush:'marker'}),28)
  assert.equal(switchSketchToolWidth(memory,{tool:'pen',brush:'marker',width:30},{tool:'eraser'}),140)
})

test('selecting and resizing an object does not overwrite the previous brush width', () => {
  const memory={}
  switchSketchToolWidth(memory,{tool:'pen',brush:'pen',width:18},{tool:'select'})
  assert.equal(switchSketchToolWidth(memory,{tool:'select',width:180},{tool:'pen',brush:'pen'}),18)
})

test('keyboard width changes preserve the full side-control range', () => {
  assert.equal(stepSketchWidth(140,1),142)
  assert.equal(stepSketchWidth(140,-1),138)
  assert.equal(stepSketchWidth(255,1),256)
  assert.equal(stepSketchWidth(1,-1),1)
})
