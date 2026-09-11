import test from 'node:test'
import assert from 'node:assert/strict'
import { createSketchAgentRun } from '../src/sketch-agent-run.js'

test('run stays locked between calls, finishes once, and optionally returns a preview', async () => {
  const calls=[],states=[];let opens=0,preview=false
  const run=createSketchAgentRun({execute:async r=>{calls.push(r.action);return {documentId:'a',revision:1,...(r.action==='preview'?{png:'image'}:{})}},open:()=>opens++,changed:s=>states.push(s),previewEnabled:()=>preview})
  let {runId}=await run.execute({action:'inspect'});await run.execute({action:'apply',runId})
  assert.equal(run.locked,true);assert.equal(opens,1)
  await run.execute({action:'save',runId});assert.equal(run.locked,true)
  assert.equal((await run.execute({action:'finish',runId})).png,undefined)
  assert.equal(run.locked,false);assert.equal(run.state,'finished')
  preview=true;({runId}=await run.execute({action:'inspect'}))
  assert.equal((await run.execute({action:'finish',runId})).png,'image')
  assert.deepEqual(calls,['inspect','apply','save','save','inspect','save','preview'])
})
test('stop rejects late calls until the user resumes; pending completion cannot undo stop',async()=>{
  let resolve;const run=createSketchAgentRun({execute:()=>new Promise(r=>resolve=r),open:()=>{},changed:()=>{}})
  const request=run.execute({action:'inspect'});run.stop();resolve({})
  await assert.rejects(request,/interrupted/)
  await assert.rejects(run.execute({action:'inspect'}),/stopped by the user/)
  assert.equal(run.state,'stopped');run.fail();assert.equal(run.state,'stopped');run.resume()
  await assert.rejects(run.execute({action:'apply'}),/inspect/)
})
test('failure releases editing lock and requires a new inspect',async()=>{
  const run=createSketchAgentRun({execute:async()=>{throw Error('failed')},open:()=>{},changed:()=>{}})
  await assert.rejects(run.execute({action:'inspect'}),/failed/)
  assert.equal(run.locked,false);assert.equal(run.state,'failed')
  await assert.rejects(run.execute({action:'apply'}),/inspect/)
})

test('a new run rejects old writes and exact finish retries do not repeat preview',async()=>{
 let previews=0
 const run=createSketchAgentRun({execute:async r=>{if(r.action==='preview')previews++;return {documentId:'a'}},open:()=>{},changed:()=>{},previewEnabled:()=>true})
 const first=await run.execute({action:'inspect'})
 assert.equal(first.runId,'run-1')
 const finish={action:'finish',runId:first.runId,requestId:'done'}
 await run.execute(finish);await run.execute(finish);assert.equal(previews,1)
 assert.equal((await run.execute({action:'inspect'})).runId,'run-2')
 await assert.rejects(run.execute({action:'apply',runId:first.runId}),/run changed/)
 run.dispose()
})
test('abandoned runs unlock after a bounded idle interval',async()=>{
 const run=createSketchAgentRun({execute:async()=>({}),open:()=>{},changed:()=>{},idleMs:5})
 await run.execute({action:'inspect'})
 await new Promise(resolve=>setTimeout(resolve,15))
 assert.equal(run.locked,false);assert.equal(run.state,'failed');run.dispose()
})

test('failed writes tell the caller to inspect and allow recovery without partial mutation',async()=>{
 let revision=0
 const run=createSketchAgentRun({execute:async r=>{if(r.action==='apply'&&r.invalid)throw Error('commands[2]: malformed curve');if(r.action==='apply')revision++;return {revision}},open:()=>{},changed:()=>{}})
 const first=await run.execute({action:'inspect'})
 await assert.rejects(run.execute({action:'apply',runId:first.runId,invalid:true}),/commands\[2\].*Call inspect/)
 assert.equal(revision,0)
 const next=await run.execute({action:'inspect'})
 await run.execute({action:'apply',runId:next.runId})
 assert.equal(revision,1);run.dispose()
})
