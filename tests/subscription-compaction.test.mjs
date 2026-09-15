import test from 'node:test'
import assert from 'node:assert/strict'
import {createCompactionBridge} from '../src/subscription-compaction.js'
const user=text=>({id:text,role:'user',source:{kind:'user'},content:[{type:'text',text}]})
const native={response:{kind:'pi-ai',version:2},blocks:[{type:'text'}]}
const item={type:'compaction',encrypted_content:'SYNTHETIC_ONLY'}
function fixture({enabled=true,complete=true,reason='stop',block={type:'text',text:'READY'},contextWindow}={}){
 const wires=[];let bridge
 const adapter={async *stream(options){
  const payload=bridge.preparePayload({input:options.messages.map(m=>({role:m.role,content:m.content})),model:options.model},contextWindow);wires.push(payload)
  const toolItems=block.type==='tool-call'?[{type:'response.output_item.done',item:{type:'function_call',call_id:block.id,name:block.name,arguments:block.arguments}}]:[]
  const events=[{type:'response.output_item.done',item},...toolItems,{type:'response.completed',response:{status:complete?'completed':'incomplete'}}]
  const bytes=new TextEncoder().encode(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''))
  const raw=new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close()}}))
  const response=bridge.networkOptions({})?.transformResponse?.(raw,new URL('https://chatgpt.com/backend-api/codex/responses'))??raw
  assert.equal(await response.text(),new TextDecoder().decode(bytes))
  yield {type:'block-end',index:0,block}
  yield {type:'finish',reason:{kind:reason},replayState:native}
 },async prepareCall(){return {stream:o=>this.stream(o)}}}
 bridge=createCompactionBridge({enabled:()=>enabled,accountScope:async o=>o.account??'a',threshold:()=>4000})
 return {bridge,adapter:bridge.wrapAdapter(adapter),wires,setEnabled:value=>{enabled=value}}
}
async function run(adapter,messages,extra={}){const events=[];for await(const e of adapter.stream({provider:'openai-codex',model:'gpt-5.6-luna',messages,...extra}))events.push(e);return events.at(-1)}
function message(finish){return {id:'assistant',role:'assistant',source:{kind:'model',provider:'openai-codex',model:'gpt-5.6-luna',replayState:JSON.parse(JSON.stringify(finish.replayState))},content:[{type:'text',text:'READY'}]}}
test('checkpoint captured without content-type and restored after JSON roundtrip',async()=>{
 const f=fixture();const first=await run(f.adapter,[user('history')]);assert.ok(first.replayState.response.codexCompactionV1)
 await run(f.adapter,[user('history'),message(first),user('next')]);assert.equal(f.wires[1].input[0].type,'compaction');assert.equal(f.wires[1].input.length,2)
 assert.deepEqual(first.replayState.blocks,native.blocks)
})
test('disabled and unsuccessful requests never adopt state',async()=>{
 for(const args of [{enabled:false},{complete:false},{reason:'aborted'},{reason:'error'}]){const f=fixture(args);assert.equal((await run(f.adapter,[user('history')])).replayState.response.codexCompactionV1,undefined)}
})
test('account changes, edited prefix and edited assistant retain full input',async()=>{
 const f=fixture();const first=await run(f.adapter,[user('history')]);const saved=message(first)
 for(const [messages,extra] of [[[user('changed'),saved,user('next')],{}],[[user('history'),saved,user('next')],{account:'b'}],[[user('history'),{...saved,content:[{type:'text',text:'edited'}]},user('next')],{}]]){await run(f.adapter,messages,extra);assert.equal(f.wires.at(-1).input.some(x=>x.type==='compaction'),false)}
})
test('prepared calls and concurrent requests retain independent scopes',async()=>{
 const f=fixture();const call=await f.adapter.prepareCall();const a={stream:call.stream};const [left,right]=await Promise.all([run(a,[user('left')]),run(f.adapter,[user('right')])]);assert.notEqual(left.replayState.response.codexCompactionV1.prefix,right.replayState.response.codexCompactionV1.prefix)
 assert.equal(f.bridge.requestOptions({transport:'websocket'}).transport,'websocket')
})

test('cancelled requests never persist a completed checkpoint', async () => {
 const f=fixture(), controller=new AbortController()
 controller.abort()
 const finish=await run(f.adapter,[user('history')],{signal:controller.signal})
 assert.equal(finish.replayState.response.codexCompactionV1,undefined)
})

test('tool-result continuation survives checkpoint replay and edited calls reject it', async () => {
 const block={type:'tool-call',id:'call-1',name:'lookup',arguments:'{}'}
 const f=fixture({reason:'tool-calls',block})
 const first=await run(f.adapter,[user('history')])
 const saved={...message(first),content:[block]}
 const result={role:'user',source:{kind:'tool',callId:'call-1'},content:[{type:'tool-result',toolCallId:'call-1',content:[{type:'text',text:'BLUE_716'}],isError:false}]}
 await run(f.adapter,[user('history'),saved,result])
 assert.equal(f.wires.at(-1).input[0].type,'compaction')
 assert.equal(f.wires.at(-1).input[1].type,'function_call')
 assert.deepEqual(f.wires.at(-1).input.at(-1).content,result.content)
 await run(f.adapter,[user('history'),{...saved,content:[{...block,arguments:'{"changed":true}'}]},result])
 assert.equal(f.wires.at(-1).input.some(x=>x.type==='compaction'),false)
})

test('damaged persisted checkpoint falls back to complete history', async () => {
 const f=fixture(), first=await run(f.adapter,[user('history')]), saved=message(first)
 saved.source.replayState.response.codexCompactionV1.items[0].encrypted_content='damaged'
 await run(f.adapter,[user('history'),saved,user('next')])
 assert.equal(f.wires.at(-1).input.length,3)
 assert.equal(f.wires.at(-1).input.some(x=>x.type==='compaction'),false)
})

test('native image offload and native summary replacement invalidate cloud history', async () => {
 const f=fixture(), image={...user('image'),content:[{type:'image',attachment:{attachmentId:'original'}}]}
 const first=await run(f.adapter,[image]), saved=message(first)
 const projected={...image,content:[{...image.content[0],offloaded:true}]}
 for(const prefix of [[projected],[user('native summary')]]) {
  await run(f.adapter,[...prefix,saved,user('continue')])
  assert.equal(f.wires.at(-1).input.some(x=>x.type==='compaction'),false)
  assert.deepEqual(f.wires.at(-1).input[0].content,prefix[0].content)
 }
 assert.equal(image.content[0].offloaded,undefined)
})

test('expired or future imported checkpoints retain the full current history', async () => {
 const f=fixture(), first=await run(f.adapter,[user('history')])
 for(const createdAt of [0,Date.now()+3600000,undefined]) {
  const saved=message(first)
  saved.source.replayState.response.codexCompactionV1.createdAt=createdAt
  await run(f.adapter,[user('history'),saved,user('next')])
  assert.equal(f.wires.at(-1).input.some(x=>x.type==='compaction'),false)
 }
})

test('small context caps the trigger and disabling cloud restores original history', async () => {
 const f=fixture({contextWindow:4000}), first=await run(f.adapter,[user('history')])
 assert.equal(f.wires[0].context_management[0].compact_threshold,2000)
 f.setEnabled(false)
 await run(f.adapter,[user('history'),message(first),user('next')])
 assert.equal(f.wires.at(-1).context_management,undefined)
 assert.equal(f.wires.at(-1).input.length,3)
})
