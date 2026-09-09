import test from 'node:test'
import { createImageTrigger } from '../src/sketch-trigger.js'
import { watchImageTool } from '../src/image-tool-registration.js'
import assert from 'node:assert/strict'
import { attachImageFiles, appendImagePrompt } from '../src/image-composer.js'
import { imageFeaturePatch, assertImageOperation } from '../src/image-features.js'
import { resolveImageModel, validateImageQuality } from '../src/image-models.js'
import { sketchPoint, paintSketch } from '../src/sketch-document.js'
import { createSketchTrigger } from '../src/sketch-trigger.js'

test('image model quality combinations reject unsupported requests without downgrade', () => {
  assert.equal(resolveImageModel(), 'gpt-image-2')
  assert.throws(() => resolveImageModel('__proto__'))
  assert.throws(() => validateImageQuality('gpt-image-2', 'max'))
  for (const model of ['gpt-image-2.5-flare','gpt-image-2.5-sunburst']) validateImageQuality(model, 'max')
})
test('generation and editing switches are independent and strictly boolean', () => {
  assert.throws(() => imageFeaturePatch({ imageEditing: 'false' }))
  assert.throws(() => assertImageOperation({ imageGeneration: false }, false))
  assertImageOperation({ imageGeneration: false }, true)
  assert.throws(() => assertImageOperation({ imageEditing: false }, true))
})
test('composer rejects release all newly created attachments, including thrown errors', () => {
  const created = [{id:'a'},{id:'b'}]; let released
  const conversation={createDraftImages:()=>created,releaseDraftImages:value=>{released=value}}
  assert.throws(()=>attachImageFiles(conversation,{addImages:()=>false},[]))
  assert.equal(released,created)
  released=undefined
  assert.throws(()=>attachImageFiles(conversation,{addImages:()=>{throw Error('busy')}},[]))
  assert.equal(released,created)
})
test('image instruction insertion preserves existing draft and refuses to flatten reference chips', () => {
  let draft='Existing text'
  const input={state:{getSnapshot:()=>({draft,phase:'plain',occurrences:[]})},setDraft:value=>{draft=value}}
  appendImagePrompt(input,'New brief'); assert.equal(draft,'Existing text\n\nNew brief')
  input.state.getSnapshot=()=>({draft,phase:'plain',occurrences:[{}]})
  assert.throws(()=>appendImagePrompt(input,'More'))
})
test('sketch coordinates remain relative across viewport sizes and paint taps', () => {
  assert.deepEqual(sketchPoint(100,50,{left:0,top:0,width:200,height:100}),{x:.5,y:.5})
  assert.deepEqual(sketchPoint(-5,200,{left:0,top:0,width:100,height:100}),{x:0,y:1})
  assert.equal(sketchPoint(0,0,{width:0,height:0}),undefined)
  let arc
  const context={fillRect(){},beginPath(){},arc(...args){arc=args},fill(){}}
  paintSketch(context,[{color:'#000000',width:10,points:[{x:.5,y:.5}]}],100)
  assert.deepEqual(arc,[50,50,5,0,Math.PI*2])
})

test('Sketch consumes only an accepted session span, and disabled sources disappear', async () => {
  let enabled=true,accepted=false,opened
  const source=createSketchTrigger({enabled:()=>enabled,consume:()=>accepted,open:id=>{opened=id}})
  const pick={session:{sessionId:'a'},span:{start:0,end:7,draftRev:1}}
  assert.equal(source.onPick(pick),undefined); assert.equal(opened,undefined)
  accepted=true;assert.equal(source.onPick(pick),'handled');assert.equal(opened,'a')
  enabled=false;assert.deepEqual(await source.candidates({}, {query:'Sketch'}),[])
})

test('Image shortcut accepts Chinese and English queries without sending a message', async () => {
  let opened = 0
  const source = createImageTrigger({ enabled: () => true, consume: () => true, open: () => opened++ })
  for (const query of ['image', 'Image', '生图']) assert.equal((await source.candidates({}, { query })).length, 1)
  assert.deepEqual(await source.candidates({}, { query: 'image', quoted: true }), [])
  assert.deepEqual(await source.candidates({}, { query: 'unrelated' }), [])
  assert.equal(opened, 0)
  assert.equal(source.onPick({ session: { sessionId: 'a' }, span: {} }), 'handled')
  assert.equal(opened, 1)
})

test('disabling both image operations removes the tool and re-enabling restores it once', () => {
  let notify, active = 0, registered = 0, watching = true
  const dispose = watchImageTool({ get: () => ({}), watch: callback => { notify = callback; return () => { watching = false } } }, () => {
    active++; registered++
    return () => active--
  })
  assert.equal(active, 1)
  notify({ imageGeneration: false, imageEditing: true })
  assert.equal(active, 1)
  notify({ imageGeneration: false, imageEditing: false })
  assert.equal(active, 0)
  notify({ imageGeneration: false, imageEditing: false })
  notify({ imageGeneration: true, imageEditing: false })
  assert.equal(active, 1)
  assert.equal(registered, 2)
  dispose()
  assert.equal(active, 0)
  assert.equal(watching, false)
})
