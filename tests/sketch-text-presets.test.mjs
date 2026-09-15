import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutSketchText, newTextBounds } from '../src/sketch-text.js'
import { applySketchCommands, createSketchCommandSession } from '../src/sketch-commands.js'
import { createSketchLayers } from '../src/sketch-layers.js'
import { updateSketchGesture } from '../src/sketch-gesture.js'

test('multiline text fits both axes uniformly and caches stable layout', () => {
  const context = {font:'', measureText(text) {return {width:[...text].length * parseFloat(this.font)}}}
  const stroke = {width:32,text:'长标题不会横向压扁\n第二行',points:[{x:0,y:0},{x:.2,y:.1}]}
  const result = layoutSketchText(stroke,context,1000,1000)
  assert.ok(result.size > 0 && result.size <= 32)
  assert.equal(result.lines.join(''),stroke.text.replaceAll('\n',''))
  assert.ok(result.lines.length * result.size * 1.2 <= 100)
  assert.ok(result.lines.every(line => [...line].length * result.size <= 200))
  assert.equal(layoutSketchText(stroke,context,1000,1000),result)
  assert.notEqual(layoutSketchText(stroke,context,500,500),result)
  assert.deepEqual(newTextBounds({x:1,y:1}),[{x:.65,y:.85},{x:1,y:1}])
})

test('shape presets remain canonical editable polygons; invalid batch is atomic', () => {
  const source = createSketchLayers()
  const commands = ['triangle','diamond','star'].map((shape,i) => ({op:'stroke',id:shape,shape,color:'#112233',fill:true,points:[{x:.1,y:.1},{x:.3+i*.1,y:.4}]}))
  const doc = applySketchCommands(source,commands)
  assert.deepEqual(doc.layers[0].strokes.map(s=>s.points.length),[3,4,10])
  assert.ok(doc.layers[0].strokes.every(s=>s.shape==='polygon'))
  assert.throws(()=>applySketchCommands(source,[...commands,{...commands[0],points:[{x:0,y:0}]}]))
  assert.equal(source.layers[0].strokes.length,0)
})

test('targeted inspect omits repeated help and unrelated objects', async () => {
  const doc=applySketchCommands(createSketchLayers(),[{op:'stroke',id:'badge',shape:'star',color:'#112233',points:[{x:.1,y:.1},{x:.3,y:.3}]}])
  const session=createSketchCommandSession({available:()=>true,snapshot:()=>({documentId:'d',revision:0}),objects:()=>doc.layers[0].strokes,object:()=>doc.layers[0].strokes[0]})
  const full=await session({action:'inspect'}), target=await session({action:'inspect',objectId:'badge'})
  assert.ok(full.help)
  assert.equal(target.help,undefined)
  assert.equal(target.object.id,'badge')
  assert.deepEqual(target.objects,[])
  assert.ok(JSON.stringify(target).length < JSON.stringify(full).length / 2)
})

test('dragging a selected object beyond the edge clamps without failing', () => {
  const doc=applySketchCommands(createSketchLayers(),[{op:'stroke',id:'box',shape:'rectangle',color:'#112233',points:[{x:.2,y:.2},{x:.4,y:.4}]}])
  const gesture={object:doc.layers[0].strokes[0],layer:doc.active,start:{x:.2,y:.2}}
  const next=updateSketchGesture(doc,gesture,[{clientX:1000,clientY:1000}],{left:0,top:0,width:1000,height:1000},2)
  assert.deepEqual(next.layers[0].strokes[0].points,[{x:.8,y:.8},{x:1,y:1}])
})
