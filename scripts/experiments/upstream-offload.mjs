import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {load} from './native-runtime.mjs'

const {Context}=await load('@deepseek-ai/cordis')
const {SessionStore}=await load('@deepseek-ai/dsh-session')
const {default:Storage}=await load('@deepseek-ai/dsh-session-persistence-jsonl')
const ctx=new Context(), sessions=new SessionStore(ctx), handlers={}
const offload=await load('@deepseek-ai/dsh-compaction-image-offload')
offload.apply({sessions,on:(name,fn)=>{handlers[name]=fn}})
const session=sessions.create('offload-acceptance',{meta:{cwd:path.resolve('.artifacts')}})
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')
const ref={attachmentId:'fixture-image',name:'fixture.png',mediaType:'image/png',bytes:bytes.length,width:1,height:1}
const image={type:'image',attachment:ref}, text={type:'text',text:'Original image remains available.'}
session.append('user/message',{id:crypto.randomUUID(),role:'user',source:{kind:'user'},content:[text,image,image]},{surfaceOp:'append'})

const {PiAiAdapter}=await load('@deepseek-ai/dsh-llm-pi-ai')
let reads=0
const attachments={readImageRequest:async()=>{reads++;return {...ref,data:bytes}},readImage:async()=>({...ref,data:bytes})}
const {openaiCodexSubscriptionProvider}=await import('../../src/pi-ai-runtime.js')
const original=openaiCodexSubscriptionProvider();let convertedContext
const provider={...original,streamSimple:(_m,context)=>{convertedContext=context;return(async function*(){})()}}
const adapter=new PiAiAdapter({profiles:()=>new Map([['openai-codex',{provider:'openai-codex',piProvider:provider,configuredMaxTokens:new Map(),modelErrors:new Map(),maxRequestImageBytes:100,requestImagePixelBudget:4096,requestImageMaxBytes:1024,streamIdleTimeoutMs:1000}]]),resolveApiKey:async()=> 'synthetic-no-network',resolveAttachments:()=>attachments})
const convert=async messages=>{try{for await(const event of adapter.stream({provider:'openai-codex',model:'gpt-5.6-luna',messages})){} }catch(e){if(e.code!=='STREAM_CLOSED'||!convertedContext)throw e}return convertedContext}
let failure
try {await convert(session.deriveMessages())} catch(e) {failure=e.failure}
assert.equal(failure?.code,'IMAGE_OFFLOAD_REQUIRED')
const action=await handlers['agent/request-error']({agent:{session},failure},()=>{throw Error('Unexpected fallback')})
assert.equal(action.kind,'retry')
const projected=session.deriveMessages()
assert.equal(projected[0].content.filter(b=>b.offloaded).length,1)
const converted=await convert(projected)
assert.equal(converted.messages[0].content.filter(b=>b.type==='image').length,1)
assert.ok(converted.messages[0].content.some(b=>b.type==='text'&&/offload|omitt/i.test(b.text)))
assert.deepEqual((await attachments.readImage(ref)).data,bytes)
const root=path.resolve('.artifacts/upstream-offload-jsonl-'+Date.now()),storage=new Storage(new Context(),{root,compression:'none'})
const handle=await storage.create(session.header)
try{await handle.append(session.snapshotEvents());await handle.flush()}finally{await handle.close()}
const reader=await storage.open(session.id,'read');let events
try{events=(await reader.read()).events}finally{await reader.close()}
const restored=sessions.create('restored-offload',{seed:events,meta:{cwd:path.resolve('.artifacts')}})
assert.deepEqual(restored.deriveMessages(),projected)
const fork=sessions.create('forked-offload',{seed:events,meta:{cwd:path.resolve('.artifacts'),parentSession:session.id}})
assert.deepEqual(fork.deriveMessages(),projected)
fork.append('user/message',{id:crypto.randomUUID(),role:'user',source:{kind:'user'},content:[image]},{surfaceOp:'append'})
assert.equal(fork.deriveMessages().at(-1).content[0].offloaded,undefined)
await fs.writeFile('.artifacts/upstream-offload-result.json',JSON.stringify({passed:true,events:events.map(e=>e.type),imageReads:reads,restored:true,seededFork:true,newReferenceRetained:true,originalRetained:true},null,2))
console.log('Native offload, JSONL restore, seeded fork and fresh reference passed')
