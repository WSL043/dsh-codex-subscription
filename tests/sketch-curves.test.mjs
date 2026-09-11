import test from 'node:test'
import assert from 'node:assert/strict'
import {applySketchCommands} from '../src/sketch-commands.js'
import {createSketchLayers,strokeHit,resizeSketch} from '../src/sketch-layers.js'
import {flattenSketchCurve} from '../src/sketch-curves.js'
import {paintSketch} from '../src/sketch-document.js'
import {encodeSketchDocument,decodeSketchDocument} from '../src/sketch-formats.js'
const curve={op:'stroke',shape:'bezier',color:'#0088ff',width:4,points:[{x:0,y:0},{x:0,y:1},{x:1,y:1},{x:1,y:0}]}
test('cubic controls render natively, survive draft and resize, and hit the actual curve',()=>{
 const doc=applySketchCommands(createSketchLayers(),[curve]),s=doc.layers[0].strokes[0],calls=[]
 const context={beginPath(){},moveTo(){},stroke(){},bezierCurveTo(...args){calls.push(args)}}
 paintSketch(context,[s],1024,true,768)
 assert.deepEqual(calls,[[0,768,1024,768,1024,0]])
 assert.ok(strokeHit(s,{x:.5,y:.75},1,1024,768))
 assert.equal(strokeHit(s,{x:.5,y:.25},1,1024,768),false)
 assert.deepEqual(decodeSketchDocument(encodeSketchDocument(doc)).layers[0].strokes[0].points,curve.points)
 assert.equal(resizeSketch(doc,'16:9').layers[0].strokes[0].points.length,4)
})
test('curve validation is atomic and detects malformed groups',()=>{
 const doc=createSketchLayers()
 for(const count of [1,2,3,5,6,194]) assert.throws(()=>applySketchCommands(doc,[{...curve,points:Array.from({length:count},()=>({x:.5,y:.5}))}]))
 assert.equal(doc.layers[0].strokes.length,0)
})
test('flattening preserves endpoints and collinear turns, and reuses cached geometry',()=>{
 const stroke={...curve,points:[{x:.2,y:.5},{x:1,y:.5},{x:0,y:.5},{x:.8,y:.5}]}
 const points=flattenSketchCurve(stroke,1024,768)
 assert.ok(points.length>2)
 assert.deepEqual(points[0],stroke.points[0]);assert.deepEqual(points.at(-1),stroke.points.at(-1))
 assert.equal(flattenSketchCurve(stroke,1024,768),points)
 const arch=flattenSketchCurve(curve,1024,768)
 assert.ok(arch.some(p=>Math.abs(p.x-.5)<.001&&Math.abs(p.y-.75)<.001))
})

test('ellipse alias normalizes to editable circle and malformed curves identify the command',()=>{
 const doc=createSketchLayers()
 const ellipse={op:'stroke',shape:'ellipse',color:'#112233',points:[{x:.2,y:.3},{x:.6,y:.8}]}
 const next=applySketchCommands(doc,[ellipse])
 assert.equal(next.layers[0].strokes[0].shape,'circle')
 assert.throws(()=>applySketchCommands(doc,[ellipse,{...curve,points:Array.from({length:9},()=>({x:.5,y:.5}))}]),/commands\[1\]: Bezier has 9 points/)
 assert.equal(doc.layers[0].strokes.length,0)
})
