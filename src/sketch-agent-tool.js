import { defineTool } from '@deepseek-ai/dsh-tools'
import { sketchCommandArray } from './sketch-command-schema.js'

export function createSketchAgentTool(bridge, attachments) {
  return defineTool({
    name:'codex_sketch',
    description:'Edit the sketch board in this session using native editable strokes and layers. Use for @sketch requests and explicit follow-up edits to that drawing. The toolbar pen button is for manual drawing; do not require the user to open it. Start with inspect for the runId, documentId, revision and command reference. Apply atomic batches, preview between stages, and call finish to save the finished draft and release the editing lock. save is only a checkpoint. finish returns an image only when the user enables experimental preview feedback. Closing the board does not stop drawing. If the user stops drawing, do not retry. Never generates AI images, sends messages or attaches images automatically. Inspect automatically opens the board in the currently viewed session. Do not ask the user to open it first. If the session is not visible in DSH, ask them to switch to it. On timeout inspect before retrying; reuse the exact requestId only for the same request.',
    parameters:{
      action:{type:'string',required:true,enum:['inspect','apply','preview','save','finish']},
      runId:{type:'string',description:'From inspect; required for all other actions. Never reuse a stopped run.'},
      documentId:{type:'string',description:'From inspect; required except for inspect.'},
      revision:{type:'integer',description:'From latest response; required for apply/save/finish.'},
      requestId:{type:'string',description:'Unique id for apply/save/finish; exact retries are deduplicated. After timeout inspect recentRequests before repeating a write.'},
      commands:{oneOf:[sketchCommandArray,{type:'string'}],description:'Prefer a native command array. Legacy JSON string also accepted. Required for apply. Use named objects and update existing IDs; prefer Bezier start + segments (control1/control2/end) for curves, not hundreds of pen points.'},
      name:{type:'string',description:'Draft name for save/finish.'},
      offset:{type:'integer',description:'inspect only: object list offset, default 0. Follow nextOffset for further pages.'},
      objectId:{type:'string',description:'inspect only: return full editable geometry for this object, in layer (defaults to active layer).'},
      layer:{type:'integer',description:'inspect only: layer containing objectId.'},
    },
    timeoutMs:25_000,
    isConcurrencySafe:()=>false,
    async execute(args,exec){
      const sessionId=exec.agent?.id
      if(typeof sessionId!=='string')throw Error('A session-owned sketch call is required')
      const request={...args}
      if(args.action==='apply') {try{request.commands=typeof args.commands==='string'?JSON.parse(args.commands):args.commands;if(!Array.isArray(request.commands))throw Error()}catch{throw Error('commands must be a native array or JSON array string')}}
      const value=await bridge.request(sessionId,request,exec.signal)
      if(value.png){
        if(!/^data:image\/png;base64,/.test(value.png) || value.png.length>8*1024*1024)throw Error('Invalid sketch preview')
        const image=await attachments.saveImage({data:new Uint8Array(Buffer.from(value.png.split(',')[1],'base64')),mediaType:'image/png',name:'sketch-preview.png'})
        const {png,...snapshot}=value
        return {...snapshot,image}
      }
      return value
    },
    output:{
      schema:{type:'object',additionalProperties:true},
      render:(_args,value)=>[
        {type:'text',text:JSON.stringify({...value,image:undefined})},
        ...(value.image?[{type:'image',attachment:value.image}]:[]),
      ],
    },
  })
}
