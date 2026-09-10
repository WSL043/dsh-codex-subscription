import { defineTool } from '@deepseek-ai/dsh-tools'

export function createSketchAgentTool(bridge, attachments) {
  return defineTool({
    name:'codex_sketch',
    description:'Edit the open sketch board in this session using native editable strokes and layers. Only use when asked to draw or edit a sketch. Start with inspect for the documentId, revision and command reference. Apply atomic batches, preview between stages, and save the finished draft. Never generates AI images, sends messages or attaches images automatically. The user must keep this session’s sketch board open. On timeout inspect before retrying; reuse the exact requestId only for the same request.',
    parameters:{
      action:{type:'string',required:true,enum:['inspect','apply','preview','save']},
      documentId:{type:'string',description:'From inspect; required except for inspect.'},
      revision:{type:'integer',description:'From latest response; required for apply/save.'},
      requestId:{type:'string',description:'Unique id for apply/save; exact retries are deduplicated.'},
      commands:{type:'string',description:'JSON array of native commands described by inspect. Required for apply.'},
      name:{type:'string',description:'Draft name for save.'},
    },
    timeoutMs:25_000,
    isConcurrencySafe:()=>false,
    async execute(args,exec){
      const sessionId=exec.agent?.id
      if(typeof sessionId!=='string')throw Error('A session-owned sketch call is required')
      const request={...args}
      if(args.action==='apply') {try{request.commands=JSON.parse(args.commands)}catch{throw Error('commands must be a JSON array')}}
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
