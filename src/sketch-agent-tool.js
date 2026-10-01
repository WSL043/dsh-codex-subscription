import { defineTool } from '@deepseek-ai/dsh-tools'
import { sketchCommandArray } from './sketch-command-schema.js'
import { readSessionImage } from './codex-images.js'

// The bridge carries at most 2 MB per request; a base64 image takes 4/3 of its size.
const MAX_REFERENCE_BYTES = 1_400_000

export function createSketchAgentTool(bridge, attachments, getSessionMessages = () => []) {
  return defineTool({
    name:'codex_sketch',
    description:'Edit the sketch board in this session using native editable strokes and layers. Use for @sketch requests and explicit follow-up edits to that drawing. The toolbar pen button is for manual drawing; do not require the user to open it. Start with inspect for the runId, documentId, revision and command reference. Draw with the svg op whenever possible: one SVG document per stage (paths, shapes, groups, transforms; see the reference from inspect) is far faster and richer than hand-placed strokes, and still becomes native editable strokes. Draw the shapes, hair, clothing and lettering outlines of every layer with svg; use stroke commands only for small corrections and native text. Apply atomic batches and preview between stages. When the user attached a reference image, call reference with its attachmentId once after inspect to put it on the board as a hidden picture layer. When a reference picture is on the board, keep its layer hidden while drawing (compare shows it anyway), measure its key positions with preview grid, draw big shapes first, and after each stage check preview compare and fix the largest offset before adding detail. For repeated details such as hair strands or lace, generate the SVG with a script instead of placing each one by hand. and call finish to save the finished draft and release the editing lock. save is only a checkpoint. Closing the board does not stop drawing. If the user stops drawing, do not retry. Never generates AI images, sends messages or attaches images automatically. Inspect automatically opens the board in the currently viewed session. Do not ask the user to open it first. If the session is not visible in DSH, ask them to switch to it. On timeout inspect before retrying; reuse the exact requestId only for the same request.',
    parameters:{
      action:{type:'string',required:true,enum:['inspect','apply','reference','preview','save','finish']},
      runId:{type:'string',description:'From inspect; required for all other actions. Never reuse a stopped run.'},
      documentId:{type:'string',description:'From inspect; required except for inspect.'},
      revision:{type:'integer',description:'From latest response; required for apply/reference/save/finish.'},
      requestId:{type:'string',description:'Unique id for apply/reference/save/finish; exact retries are deduplicated. After timeout inspect recentRequests before repeating a write.'},
      commands:{oneOf:[sketchCommandArray,{type:'string'}],description:'Prefer a native command array. Legacy JSON string also accepted. Required for apply. Use named objects and update existing IDs; prefer Bezier start + segments (control1/control2/end) for curves, not hundreds of pen points.'},
      name:{type:'string',description:'Draft name for save/finish.'},
      attachmentId:{type:'string',description:'reference only: the attachmentId of an image the user attached to this session (copy it from the image block, never a path or filename). It is added to the board as a hidden picture layer, ready for preview compare.'},
      compare:{type:'boolean',description:'preview only: blend the drawing 50/50 with the reference picture layer on the board, so offsets show as ghosting. Needs a picture layer; if there is none, ask the user to add the reference with the pictures button.'},
      grid:{type:'boolean',description:'preview only: overlay a labelled grid every 100 canvas pixels, to read positions and sizes instead of guessing them.'},
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
      delete request.attachmentId
      if(args.action==='apply') {try{request.commands=typeof args.commands==='string'?JSON.parse(args.commands):args.commands;if(!Array.isArray(request.commands))throw Error()}catch{throw Error('commands must be a native array or JSON array string')}}
      if(args.action==='reference'){
        const image=await readSessionImage(args.attachmentId,attachments,exec.signal,await getSessionMessages(sessionId))
        if(image.data.byteLength>MAX_REFERENCE_BYTES)throw Error('The reference image is too large to send to the board; ask the user to add it with the pictures button on the board')
        request.image=`data:${image.mediaType};base64,${Buffer.from(image.data).toString('base64')}`
        request.name=image.name??'reference'
      }
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
