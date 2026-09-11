import test from 'node:test'
import assert from 'node:assert/strict'
import {createSketchSessionRegistry} from '../src/sketch-session-state.js'
import {createSketchCommandSession,applySketchCommands} from '../src/sketch-commands.js'
import {createSketchAgentRun} from '../src/sketch-agent-run.js'
import {createSketchLayers} from '../src/sketch-layers.js'

test('input remount keeps document, running identity and retry receipts; sessions stay isolated',async()=>{
 const registry=createSketchSessionRegistry(),state=registry.get('one')
 const mount=()=>{
  const s=registry.get('one')
  Object.assign(s.agentAdapter.current,{available:()=>true,busy:()=>false,document:()=>s.doc.current,
   snapshot:()=>({documentId:s.documentId.current,revision:s.documentRevision.current}),
   commit:doc=>{s.doc.current=doc;s.documentRevision.current++},save:async()=>{}})
  s.agentSession.current??=createSketchCommandSession(s.agentAdapter.current)
  s.agentRun.current??=createSketchAgentRun({execute:r=>s.agentSession.current(r),open:()=>{},changed:()=>{}})
  return s.agentRun.current
 }
 const run=mount(),first=await run.execute({action:'inspect'})
 const request={...first,action:'apply',requestId:'one',commands:[{op:'stroke',color:'#123456',points:[{x:0,y:0},{x:1,y:1}]}]}
 await run.execute(request)
 const remounted=mount()
 assert.equal(remounted,run);assert.equal(remounted.locked,true)
 await remounted.execute(request)
 assert.equal(state.documentRevision.current,1);assert.equal(state.doc.current.layers[0].strokes.length,1)
 assert.notEqual(registry.get('two').documentId.current,state.documentId.current)
 run.stop();assert.equal(mount().state,'stopped');registry.dispose()
})

test('invalid geometry can be corrected without inspect or a new run',async()=>{
 let doc=createSketchLayers(),revision=0
 const session=createSketchCommandSession({available:()=>true,busy:()=>false,document:()=>doc,snapshot:()=>({documentId:'a',revision}),commit:d=>{doc=d;revision++}})
 const run=createSketchAgentRun({execute:session,open:()=>{},changed:()=>{}})
 const first=await run.execute({action:'inspect'})
 const request={...first,action:'apply',requestId:'curve',commands:[{op:'stroke',shape:'bezier',color:'#123456',points:Array.from({length:9},()=>({x:.5,y:.5}))}]}
 await assert.rejects(run.execute(request),/same runId and revision/)
 assert.equal(run.locked,true);assert.equal(revision,0)
 request.commands=[{op:'stroke',shape:'bezier',color:'#123456',start:{x:0,y:0},segments:[{control1:{x:.2,y:0},control2:{x:.8,y:1},end:{x:1,y:1}}]}]
 await run.execute(request);assert.equal(revision,1);assert.equal(doc.layers[0].strokes[0].points.length,4);run.dispose()
})

test('new layer ID and name have creation semantics and batches remain atomic',()=>{
 const original=createSketchLayers()
 const doc=applySketchCommands(original,[{op:'layer',action:'add',id:2,value:'Portrait'},{op:'stroke',layer:2,color:'#123456',points:[{x:0,y:0}]}])
 assert.equal(doc.layers[1].name,'Portrait');assert.equal(doc.layers[1].strokes.length,1)
 assert.throws(()=>applySketchCommands(doc,[{op:'layer',action:'add',id:2}]),/unique/)
 assert.equal(original.layers.length,1)
 assert.throws(()=>applySketchCommands(original,[{op:'layer',action:'add',id:2},{op:'stroke',color:'bad'}]))
 assert.equal(original.layers.length,1)
})
