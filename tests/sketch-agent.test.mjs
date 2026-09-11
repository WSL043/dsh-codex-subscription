import test from 'node:test'
import assert from 'node:assert/strict'
import { createSketchLayers, strokeHit } from '../src/sketch-layers.js'
import { applySketchCommands, createSketchCommandSession } from '../src/sketch-commands.js'
import { createSketchAgentBridge } from '../src/sketch-agent-bridge.js'
import { createSketchAgentTool } from '../src/sketch-agent-tool.js'
import { rpcErrorSchema } from '@deepseek-ai/dsh-client-connection'
const stroke={op:'stroke',shape:'polygon',color:'#123456',fill:true,points:[{x:.1,y:.1},{x:.9,y:.1},{x:.5,y:.9}]}
test('atomic batch preserves source, validates all points, and supports native filled shape erasure',()=>{
  const doc=createSketchLayers(),copy=structuredClone(doc)
  assert.throws(()=>applySketchCommands(doc,[stroke,{...stroke,color:'bad'}]))
  assert.deepEqual(doc,copy)
  const next=applySketchCommands(doc,[stroke])
  assert.ok(strokeHit(next.layers[0].strokes[0],{x:.5,y:.3},1))
  assert.equal(strokeHit(next.layers[0].strokes[0],{x:.95,y:.95},1),false)
  assert.throws(()=>applySketchCommands(doc,[{...stroke,points:[{x:NaN,y:0}]}]))
})
test('native session prevents stale edits and duplicate batches, and stops on board close',async()=>{
  let doc=createSketchLayers(),revision=0,available=true,commits=0
  const run=createSketchCommandSession({available:()=>available,busy:()=>false,snapshot:()=>({documentId:'a',revision}),document:()=>doc,commit:next=>{doc=next;revision++;commits++},save:async()=>{}})
  const req={action:'apply',documentId:'a',revision:0,requestId:'one',commands:[stroke]}
  await run(req);await run(req);assert.equal(commits,1)
  await assert.rejects(run({...req,requestId:'two'}),/changed/)
  await assert.rejects(run({...req,commands:[]}),/reused/)
  available=false;await assert.rejects(run({action:'inspect'}),/Open/)
})
test('bridge isolates sessions, leases, cancellations and close; delivery occurs once',async()=>{
  const bridge=createSketchAgentBridge({enabled:()=>true})
  const {value:{token}}=await bridge.rpc('sketch/connect',{sessionId:'a'})
  assert.equal((await bridge.rpc('sketch/connect',{sessionId:'a'})).ok,false)
  assert.ok(rpcErrorSchema.safeParse((await bridge.rpc('sketch/connect',{sessionId:''})).error).success)
  assert.equal((await bridge.rpc('sketch/poll',{sessionId:'a',token:'wrong'})).ok,false)
  await assert.rejects(bridge.request('b',{}),/Switch/)
  const request=bridge.request('a',{action:'inspect'})
  const {value:[task]}=await bridge.rpc('sketch/poll',{sessionId:'a',token})
  assert.deepEqual((await bridge.rpc('sketch/poll',{sessionId:'a',token})).value,[])
  await bridge.rpc('sketch/result',{sessionId:'a',token,id:task.id,value:{revision:0}})
  assert.deepEqual(await request,{revision:0})
  const pending=bridge.request('a',{});const rejection=assert.rejects(pending,/closed/)
  await bridge.rpc('sketch/disconnect',{sessionId:'a',token});await rejection
  bridge.dispose()
})
test('native DSH tool definition accepts the command contract',()=>{
  const tool=createSketchAgentTool({request:()=>{}},{})
  assert.ok(tool)
})

test('expired leases and aborted requests cannot remain queued for later drawing',async()=>{
  let clock=0
  const bridge=createSketchAgentBridge({enabled:()=>true,now:()=>clock})
  const {value:{token}}=await bridge.rpc('sketch/connect',{sessionId:'a'})
  const control=new AbortController(),pending=bridge.request('a',{action:'apply'},control.signal)
  const rejection=assert.rejects(pending,/interrupted/);control.abort();await rejection
  assert.deepEqual((await bridge.rpc('sketch/poll',{sessionId:'a',token})).value,[])
  clock=11_000
  assert.equal((await bridge.rpc('sketch/poll',{sessionId:'a',token})).ok,false)
  assert.equal((await bridge.rpc('sketch/connect',{sessionId:'a'})).ok,true)
  bridge.dispose()
})

test('cancellation after poll rejects claim and notifies browser before subsequent work',async()=>{
  const bridge=createSketchAgentBridge({enabled:()=>true})
  const {value:{token}}=await bridge.rpc('sketch/connect',{sessionId:'a'})
  const controller=new AbortController()
  const pending=bridge.request('a',{action:'apply'},controller.signal)
  const rejection=assert.rejects(pending,/interrupted/)
  const {value:[task]}=await bridge.rpc('sketch/poll',{sessionId:'a',token})
  controller.abort();await rejection
  assert.equal((await bridge.rpc('sketch/claim',{sessionId:'a',token,id:task.id})).value,false)
  assert.deepEqual((await bridge.rpc('sketch/poll',{sessionId:'a',token})).value,[{id:task.id,cancelled:true}])
  bridge.dispose()
})

test('DSH typed tool accepts native arrays and rejects malformed geometry before dispatch',async()=>{
  let calls=0
  const tool=createSketchAgentTool({request:async(_session,request)=>{calls++;assert.ok(Array.isArray(request.commands));return {}}},{})
  const exec={agent:{id:'a'},signal:new AbortController().signal}
  await tool.execute({action:'apply',commands:[stroke]},exec)
  await tool.execute({action:'apply',commands:JSON.stringify([stroke])},exec)
  await tool.execute({action:'apply',commands:[{op:'stroke',shape:'bezier',color:'#123456',start:{x:0,y:0},segments:[{control1:{x:.2,y:0},control2:{x:.8,y:1},end:{x:1,y:1}}]}]},exec)
  await assert.rejects(tool.execute({action:'apply',commands:[{op:'stroke',shape:'bezier',start:{x:0,y:0},segments:[{end:{x:1,y:1}}]}]},exec),/invalid arguments/)
  await assert.rejects(tool.execute({action:'apply',commands:[{...stroke,points:[{x:'bad',y:0}]}]},exec),/invalid arguments/)
  assert.equal(calls,3)
})

test('inspect is paged and reports receipts; retry after a new run does not apply twice',async()=>{
  let doc=createSketchLayers(),revision=0
  const session=createSketchCommandSession({available:()=>true,busy:()=>false,snapshot:()=>({documentId:'a',revision}),objects:()=>Array.from({length:60},(_,id)=>({id})),document:()=>doc,commit:next=>{doc=next;revision++}})
  const request={action:'apply',runId:'old',documentId:'a',revision:0,requestId:'paint',commands:[stroke]}
  const result=await session(request)
  assert.equal(result.changedObjects.length,1)
  const view=await session({action:'inspect'})
  assert.equal(view.objects.length,50);assert.equal(view.nextOffset,50)
  assert.equal(view.recentRequests[0].requestId,'paint')
  await session({...request,runId:'new'})
  assert.equal(revision,1)
})
