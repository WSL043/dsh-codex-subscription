import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeSketchDocument, decodeSketchDocument } from '../src/sketch-formats.js'
import { createSketchLayers } from '../src/sketch-layers.js'
import { applySketchCommands } from '../src/sketch-commands.js'

test('editable draft preserves native drawing, hidden layers and selected layer',()=>{
 let doc=applySketchCommands(createSketchLayers(),[{op:'stroke',color:'#0088ff',points:[{x:.1,y:.2},{x:.3,y:.4}],width:7},{op:'layer',action:'add'}])
 doc.layers[0].strokes[0].brush='pencil';doc.layers[0].strokes[0].pressure=.6
 doc.layers[0].strokes[0].brushVersion=2
 doc.layers[1].visible=false;doc.active=doc.layers[0].id
 const result=decodeSketchDocument(encodeSketchDocument(doc))
 assert.deepEqual(result.layers,doc.layers);assert.equal(result.active,doc.active)
})
test('editable draft rejects unsupported version and oversized embedded image before decoding',()=>{
 assert.throws(()=>decodeSketchDocument('{"format":"dsh-sketch","version":2}'))
 const doc=createSketchLayers(),header=Buffer.alloc(24)
 header.writeUInt32BE(0x89504e47,0);header.writeUInt32BE(0x0d0a1a0a,4);header.writeUInt32BE(100000,16);header.writeUInt32BE(100000,20)
 doc.layers[0].image={src:'data:image/png;base64,'+header.toString('base64'),x:0,y:0,width:1,height:1}
 assert.throws(()=>decodeSketchDocument(encodeSketchDocument(doc)),/image size/)
})
test('PSD codec route uses buffered GET',async()=>{
 const {registerSketchCodec}=await import('../src/sketch-codec-route.js')
 let route;registerSketchCodec({fetch:{register(value){route=value;return ()=>{}}}})
 assert.deepEqual(route.methods,['GET']);assert.equal(route.requestBody,'buffered')
})
