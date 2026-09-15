// Explicit opt-in: sends Luna requests using an existing Codex login.
if (!process.argv.includes('--live')) throw Error('Pass --live to run the Luna acceptance experiment')
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {pathToFileURL} from 'node:url'
import {load,packagePath} from './native-runtime.mjs'
const root=await packagePath('@earendil-works/pi-ai')
registerHooks({resolve(s,c,next){const m={'@earendil-works/pi-ai':'index','@earendil-works/pi-ai/providers/openai-codex':'providers/openai-codex'};return m[s]?{url:pathToFileURL(path.join(root,'dist',m[s]+'.js')).href,shortCircuit:true}:next(s,c)}})
const {openaiCodexSubscriptionProvider}=await import('../../src/pi-ai-runtime.js')
const {createCodexNetworkTransport}=await import('../../src/oauth-network.js')
const {createSketchAgentTool}=await import('../../src/sketch-agent-tool.js')
const {createSketchAgentRun}=await import('../../src/sketch-agent-run.js')
const {createSketchCommandSession}=await import('../../src/sketch-commands.js')
const {createSketchLayers}=await import('../../src/sketch-layers.js')
const {sketchObjectSummary}=await import('../../src/sketch-objects.js')
const {PiAiAdapter}=await load('@deepseek-ai/dsh-llm-pi-ai')
const {BlockAssembler,createToolResultMessage}=await load('@deepseek-ai/dsh-llm')
const auth=JSON.parse(await fs.readFile(process.env.CODEX_AUTH_PATH ?? path.join(process.env.USERPROFILE ?? process.env.HOME,'.codex','auth.json'),'utf8')).tokens
const network=createCodexNetworkTransport(),provider=openaiCodexSubscriptionProvider({runNetwork:network.run})
const adapter=new PiAiAdapter({profiles:()=>new Map([['openai-codex',{provider:'openai-codex',piProvider:provider,configuredMaxTokens:new Map(),modelErrors:new Map(),transport:'sse',streamIdleTimeoutMs:30000}]]),resolveApiKey:async()=>auth.access_token})
let doc=createSketchLayers(),revision=0
const commands=createSketchCommandSession({available:()=>true,busy:()=>false,snapshot:()=>({documentId:'luna-upstream',revision}),document:()=>doc,commit:next=>{doc=next;revision++},objects:()=>sketchObjectSummary(doc),object:id=>doc.layers.flatMap(l=>l.strokes).find(s=>s.id===id),save:async()=>{}})
const run=createSketchAgentRun({execute:commands,open:()=>{},changed:()=>{}})
const tool=createSketchAgentTool({request:(_id,args)=>run.execute(args)},{})
const messages=[{role:'user',source:{kind:'user'},content:[{type:'text',text:'@sketch 画一张简洁的徽章卡片，包含星形、菱形、三角形和一条平滑贝塞尔曲线，文字 LUNA。使用图形预设而非手写顶点，先 inspect 再 apply。画好后 inspect 指定星形的 objectId，把它改为橙色，然后 finish。不要调用 preview，这次只验收原生可编辑对象。'}]}]
const rows=[]
try {
 for(let step=0;step<10;step++) {
  const asm=new BlockAssembler()
  for await(const event of adapter.stream({provider:'openai-codex',model:'gpt-5.6-luna',reasoningEffort:'low',messages,tools:[{name:tool.name,description:tool.description,parameters:tool.parameters}],signal:AbortSignal.timeout(60000)}))asm.push(event)
  const message=asm.message({kind:'model',provider:'openai-codex',model:'gpt-5.6-luna',replayState:asm.replayState});messages.push(message)
  const calls=message.content.filter(b=>b.type==='tool-call')
  if(!calls.length){console.log(JSON.stringify({finish:asm.finish,text:message.content.filter(b=>b.type==='text').map(b=>b.text).join('')}));break}
  for(const call of calls) {
   const args=JSON.parse(call.arguments);let result,isError=false
   try{result=await tool.execute(args,{agent:{id:'luna-upstream'},signal:AbortSignal.timeout(25000)})}catch(e){result={error:e.message};isError=true}
   rows.push({args,isError,responseBytes:JSON.stringify(result).length})
   messages.push(createToolResultMessage({callId:call.id,content:[{type:'text',text:JSON.stringify(result)}],isError}))
  }
 }
 assert.equal(rows.some(r=>r.isError),false)
 assert.equal(run.state,'finished')
 assert.ok(rows.some(r=>r.args.action==='inspect'&&r.args.objectId))
 for(const shape of ['star','diamond','triangle'])assert.ok(rows.some(r=>r.args.commands?.some(c=>c.shape===shape)),shape)
 assert.ok(doc.layers.some(l=>l.strokes.some(s=>s.shape==='bezier')))
 await fs.writeFile('.artifacts/luna-upstream-sketch.json',JSON.stringify(doc,null,2))
 await fs.writeFile('.artifacts/luna-upstream-sketch-result.json',JSON.stringify({passed:true,model:'gpt-5.6-luna',reasoning:'low',rows,objectCount:doc.layers.reduce((n,l)=>n+l.strokes.length,0)},null,2))
 console.log(JSON.stringify({passed:true,calls:rows.length,inspectionBytes:rows.filter(r=>r.args.action==='inspect').map(r=>r.responseBytes)}))
}catch(e){await fs.writeFile('.artifacts/luna-upstream-sketch-failure.json',JSON.stringify({error:e.message,rows,messages},null,2));throw e}finally{run.dispose()}
