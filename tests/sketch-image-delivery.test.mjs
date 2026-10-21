import test from 'node:test'
import assert from 'node:assert/strict'
import { createSketchAgentTool } from '../src/sketch-agent-tool.js'
import { createSketchCommandSession } from '../src/sketch-commands.js'
import { imageConversationNode } from '../src/image-conversation-node.js'

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='
const request={action:'save',finalPreview:true,documentId:'d',revision:2,requestId:'finish'}
const exec={agent:{id:'session'}}
function board(overrides={}) {
  const calls=[]
  const session=createSketchCommandSession({available:()=>true,busy:()=>false,snapshot:()=>({documentId:'d',revision:2}),document:()=>({layers:[]}),preview:async options=>{calls.push(['preview',options]);return png},save:async()=>{calls.push(['save'])},...overrides})
  return {session,calls}
}
test('finish delivery renders only the drawing before saving and deduplicates retries',async()=>{
  const {session,calls}=board()
  const result=await session(request)
  assert.equal(result.png,png)
  assert.deepEqual(result.delivery,{status:'saved',documentId:'d',revision:2})
  assert.deepEqual(calls,[['preview',{drawingOnly:true}],['save']])
  assert.deepEqual(await session(request),result)
  assert.equal(calls.length,2)
})
test('preview failure prevents save; save failure does not cache a successful finish',async()=>{
  const first=board({preview:async()=>{throw Error('render failed')}})
  await assert.rejects(first.session(request),/render failed/)
  assert.equal(first.calls.length,0)
  let attempts=0
  const second=board({save:async()=>{if(++attempts===1)throw Error('disk failed')}})
  await assert.rejects(second.session(request),/disk failed/)
  assert.equal((await second.session(request)).delivery.status,'saved')
  assert.equal(attempts,2)
})
test('only actual PNG bytes become a final native image, with persistent image presentation',async()=>{
  const saved=[]
  const attachments={saveImage:async image=>{saved.push(image);return {attachmentId:'sha256:test',mediaType:'image/png'}}}
  const args={...request,action:'finish',runId:'r'}
  const tool=createSketchAgentTool({request:async()=>({png,documentId:'d',revision:2})},attachments)
  const value=await tool.execute(args,exec)
  assert.equal(saved[0].name,'sketch-finished.png')
  assert.equal(tool.output.render(args,value)[1].type,'image')
  const event={type:'tool/result',data:{turn:1,meta:tool.output.presentationMeta(args,value),message:{content:tool.output.render(args,value)}}}
  assert.notEqual(imageConversationNode.match(event),null)
  event.data.message.isError=true
  assert.equal(imageConversationNode.match(event),null)
  for(const response of [{},{png:'data:image/png;base64,'+Buffer.from('shell log').toString('base64')}]){
    await assert.rejects(createSketchAgentTool({request:async()=>response},attachments).execute(args,exec),/no final image|expected PNG bytes/)
  }
  assert.equal(saved.length,1)
})
