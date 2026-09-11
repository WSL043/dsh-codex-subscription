import test from 'node:test'
import assert from 'node:assert/strict'
import { applySketchCommands } from '../src/sketch-commands.js'
import { createSketchLayers } from '../src/sketch-layers.js'
import { encodeSketchDocument,decodeSketchDocument } from '../src/sketch-formats.js'
import { objectBounds } from '../src/sketch-objects.js'
const arrow={op:'stroke',id:'route',shape:'arrow',color:'#0088ff',width:6,points:[{x:.1,y:.1},{x:.4,y:.4}]}
test('targeted edits preserve unrelated objects and reject invalid batches atomically',()=>{
  const doc=applySketchCommands(createSketchLayers(),[arrow,{...arrow,id:'other'}])
  const next=applySketchCommands(doc,[{op:'object',id:'route',action:'update',patch:{color:'#ff0000'},transform:{dx:.1,scaleX:2}}])
  assert.equal(next.layers[0].strokes[0].color,'#ff0000')
  assert.equal(doc.layers[0].strokes[0].color,'#0088ff')
  assert.equal(next.layers[0].strokes[1],doc.layers[0].strokes[1])
  assert.throws(()=>applySketchCommands(doc,[{op:'object',id:'route',action:'delete'},{op:'object',id:'missing',action:'delete'}]))
  assert.equal(doc.layers[0].strokes.length,2)
  assert.throws(()=>applySketchCommands(doc,[{op:'object',id:'route',action:'update',transform:{dx:2}}]))
})
test('text and object IDs round trip through editable draft',()=>{
  const doc=applySketchCommands(createSketchLayers(),[{...arrow,shape:'text',text:'Hello',width:24}])
  const roundtrip=decodeSketchDocument(encodeSketchDocument(doc))
  assert.equal(roundtrip.layers[0].strokes[0].text,'Hello')
  assert.equal(roundtrip.layers[0].strokes[0].id,'route')
  const next=applySketchCommands(roundtrip,[{op:'object',id:'route',action:'duplicate'}])
  assert.notEqual(next.layers[0].strokes[1].id,'route')
  assert.deepEqual(objectBounds(next.layers[0].strokes[1]),objectBounds(next.layers[0].strokes[0]))
})
test('text validation rejects empty text and arbitrary object patches',()=>{
  assert.throws(()=>applySketchCommands(createSketchLayers(),[{...arrow,shape:'text',text:''}]))
  const doc=applySketchCommands(createSketchLayers(),[arrow])
  assert.throws(()=>applySketchCommands(doc,[{op:'object',id:'route',action:'update',patch:{shape:'unknown'}}]))
  assert.throws(()=>applySketchCommands(doc,[arrow]))
})
test('style edits preserve handwritten brush and pressure',()=>{
  const doc=applySketchCommands(createSketchLayers(),[arrow])
  Object.assign(doc.layers[0].strokes[0],{brush:'marker',pressure:.4})
  const next=applySketchCommands(doc,[{op:'object',id:'route',action:'update',patch:{opacity:.5}}])
  assert.equal(next.layers[0].strokes[0].brush,'marker')
  assert.equal(next.layers[0].strokes[0].pressure,.4)
})
