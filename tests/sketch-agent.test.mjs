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


test('agent inspect opens the board, but a queued write cannot reopen it',async()=>{
  const {executeSketchFromAgent}=await import('../src/sketch-agent-client.js')
  let opened=false,opens=0,executed=0
  const adapter={available:()=>opened,open:()=>{opens++;opened=true},execute:()=>{executed++;return 'ready'}}
  assert.equal(await executeSketchFromAgent({action:'inspect'},adapter),'ready')
  assert.equal(opens,1);assert.equal(executed,1)
  opened=false
  await assert.rejects(executeSketchFromAgent({action:'apply'},adapter),/closed/)
  assert.equal(opens,1);assert.equal(executed,1)
  await assert.rejects(executeSketchFromAgent({action:'inspect'},{...adapter,live:()=>false}),/disconnected/)
  assert.equal(opens,1)
})
test('opening waits for the mounted board and fails boundedly if unavailable',async()=>{
  const {executeSketchFromAgent}=await import('../src/sketch-agent-client.js')
  let ticks=0
  assert.equal(await executeSketchFromAgent({action:'inspect'},{available:()=>ticks>=2,open:()=>{},wait:async()=>{ticks++},execute:()=>42}),42)
  await assert.rejects(executeSketchFromAgent({action:'inspect'},{available:()=>false,open:()=>{},wait:async()=>{},execute:()=>{throw Error('must not execute')}}),/could not open/)
})
