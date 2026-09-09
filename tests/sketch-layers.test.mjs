import test from 'node:test'
import assert from 'node:assert/strict'
import {createSketchLayers,changeSketchLayer,strokeHit,MAX_SKETCH_LAYERS} from '../src/sketch-layers.js'
import {capabilityPatch,quotaWarning} from '../src/capability-settings.js'
test('layer operations preserve source content and top-to-bottom ordering',()=>{
 let doc=createSketchLayers();doc.layers[0].strokes=[{shape:'pen',width:8,points:[{x:.1,y:.1},{x:.9,y:.9}]}]
 const original=doc
 doc=changeSketchLayer(doc,'duplicate');assert.equal(doc.active,2);assert.equal(doc.layers[1].strokes.length,1)
 doc=changeSketchLayer(doc,'visible',2);assert.equal(doc.layers[1].visible,false);assert.equal(original.layers[0].visible,true)
 doc=changeSketchLayer(doc,'down');assert.deepEqual(doc.layers.map(l=>l.id),[2,1])
 doc=changeSketchLayer(doc,'rename',2,'Copy');assert.equal(doc.layers[0].name,'Copy')
 doc=changeSketchLayer(doc,'clear');assert.equal(doc.layers[0].strokes.length,0);assert.equal(original.layers[0].strokes.length,1)
 doc=changeSketchLayer(doc,'delete');assert.equal(doc.active,1);assert.equal(changeSketchLayer(doc,'delete'),doc)
 while(doc.layers.length<MAX_SKETCH_LAYERS)doc=changeSketchLayer(doc,'add')
 assert.equal(changeSketchLayer(doc,'add'),doc)
})
test('stroke eraser hits segments and shape outlines, not empty shape interiors',()=>{
 assert.ok(strokeHit({width:10,points:[{x:0,y:0},{x:1,y:1}]},{x:.5,y:.5},4))
 assert.equal(strokeHit({shape:'rectangle',width:10,points:[{x:.1,y:.1},{x:.9,y:.9}]},{x:.5,y:.5},4),false)
 assert.ok(strokeHit({shape:'circle',width:10,points:[{x:.1,y:.1},{x:.9,y:.9}]},{x:.9,y:.5},4))
})
test('custom quota thresholds validate, select the matching window and exclude stale data',()=>{
 for(const value of [0,101,NaN,12.5,'20'])assert.throws(()=>capabilityPatch({quotaShortThreshold:value}))
 assert.deepEqual(capabilityPatch({quotaShortThreshold:35,quotaLongThreshold:10}),{quotaShortThreshold:35,quotaLongThreshold:10})
 const now=1800000000000, usage={fetchedAt:now,rateLimits:[{id:'codex',windows:[{windowSeconds:18000,remainingPercent:30},{windowSeconds:604800,remainingPercent:15}]}]}
 assert.equal(quotaWarning(usage,'custom',now,{quotaShortThreshold:35,quotaLongThreshold:10}).remainingPercent,30)
 assert.equal(quotaWarning(usage,'custom',now+301000,{quotaShortThreshold:35,quotaLongThreshold:10}),undefined)
})
