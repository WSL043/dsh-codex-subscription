import { defineTool } from '@deepseek-ai/dsh-tools'
import { sketchCommandArray } from './sketch-command-schema.js'
import { readSessionImage } from './codex-images.js'

// The bridge carries at most 2 MB per request; a base64 image takes 4/3 of its size.
const MAX_REFERENCE_BYTES = 1_400_000

export function createSketchAgentTool(bridge, attachments, getSessionMessages = () => []) {
  return defineTool({
    name:'codex_sketch',
    description:'Edit the sketch board in this session using native editable strokes and layers. Use for @sketch requests and explicit follow-up edits to that drawing. The toolbar pen button is for manual drawing; do not require the user to open it. Start with inspect for the runId, documentId, revision and command reference. Draw with the svg op whenever possible: one SVG document per stage (paths, shapes, groups, transforms; see the reference from inspect) is far faster and richer than hand-placed strokes, and still becomes native editable strokes. Draw with depth, not flat colour: skies, skin, metal and glass take real linear/radial gradients (fill="url(#id)"), glows, shadows, haze and distant things take a feGaussianBlur filter (soft edge), and light comes from a consistent direction with a darker shade, a lighter highlight and a reflected-light edge on each form. Draw the shapes, hair, clothing and lettering outlines of every layer with svg; use stroke commands only for small corrections and native text. Apply atomic batches and preview between stages. When the user attached a reference image, call reference with its attachmentId once after inspect to put it on the board as a hidden picture layer. To reproduce a reference faithfully, draw it yourself in stages, from big to small: 1) write a short plan (parts, drawing order, rough position and size of each), using preview with grid and measure with palette and regions to read proportions, key positions and the main colours, and measure scan along a few rows and columns to find exact edges; 2) block in the silhouette and the big colour areas (hair, clothes, skin, background) as filled shapes; 3) after every apply read progress (error, previous error, worst cells) and use preview mode side or diff, with box to zoom into a part, to see what is off; 4) fix the worst area first (position and size before colour, colour before detail), 5) then shading, then outlines and small details (eyes, headphones, patterns). Read exact colours from the reference with measure points instead of guessing. If a stage raised the error or looks wrong, undo it instead of painting over it. When the whole picture is roughly right, do refinement passes region by region instead of stopping: split the picture into its parts (for a figure: head and face, each mass of hair, torso, each arm, each leg, shoes and small accessories). For every part, call preview mode side with box set to that part and grid on (zoomed up to 3x) and look at reference and drawing next to each other, then measure with box on the same part and use scan along an edge to read exact positions; list the three biggest differences (edge position, size, colour, missing detail), fix them with targeted object updates or a replacement shape, and check progress. A part is done when its error stops falling or the zoomed pair looks the same; then go to the next part. Make at least one pass over every part before you finish, and never end with the first full draft. Stop when every part has had its pass and the error stops improving. When a reference picture is on the board, keep its layer hidden while drawing (compare shows it anyway), measure its key positions with preview grid, draw big shapes first, and after each stage check preview compare and fix the largest offset before adding detail. For repeated details such as hair strands or lace, generate the SVG with a script instead of placing each one by hand. and call finish to save the finished draft and release the editing lock. save is only a checkpoint. Closing the board does not stop drawing. If the user stops drawing, do not retry. Never generates AI images, sends messages or attaches images automatically. Inspect automatically opens the board in the currently viewed session. Do not ask the user to open it first. If the session is not visible in DSH, ask them to switch to it. On timeout inspect before retrying; reuse the exact requestId only for the same request.',
    parameters:{
      action:{type:'string',required:true,enum:['inspect','apply','undo','reference','preview','measure','save','finish']},
      runId:{type:'string',description:'From inspect; required for all other actions. Never reuse a stopped run.'},
      documentId:{type:'string',description:'From inspect; required except for inspect.'},
      revision:{type:'integer',description:'From latest response; required for apply/reference/save/finish.'},
      requestId:{type:'string',description:'Unique id for apply/reference/save/finish; exact retries are deduplicated. After timeout inspect recentRequests before repeating a write.'},
      commands:{oneOf:[sketchCommandArray,{type:'string'}],description:'Prefer a native command array. Legacy JSON string also accepted. Required for apply. Use named objects and update existing IDs; prefer Bezier start + segments (control1/control2/end) for curves, not hundreds of pen points.'},
      name:{type:'string',description:'Draft name for save/finish.'},
      attachmentId:{type:'string',description:'reference only: the attachmentId of an image the user attached to this session (copy it from the image block, never a path or filename). It is added to the board as a hidden picture layer, ready for preview compare.'},
      compare:{type:'boolean',description:'preview only: blend the drawing 50/50 with the reference picture layer on the board, so offsets show as ghosting. Needs a picture layer; if there is none, ask the user to add the reference with the pictures button.'},
      grid:{type:'boolean',description:'preview only: overlay a labelled grid every 100 canvas pixels, to read positions and sizes instead of guessing them.'},
      mode:{type:'string',enum:['side','diff'],description:'preview only: side = reference and your drawing next to each other; diff = reference, drawing and a difference heat map.'},
      box:{type:'object',additionalProperties:false,properties:{x:{type:'number',required:true},y:{type:'number',required:true},width:{type:'number',required:true},height:{type:'number',required:true}},description:'preview and measure: only this part of the canvas, normalised 0..1 (zoomed in for preview).'},
      regions:{type:'integer',description:'measure only: where each of this many (1–12) main colours of the reference sits: share, centre and box.'},
      scan:{type:'object',additionalProperties:false,properties:{x1:{type:'number',required:true},y1:{type:'number',required:true},x2:{type:'number',required:true},y2:{type:'number',required:true}},description:'measure only: a line (0..1 coordinates); returns the colour runs of the reference and of your drawing along it, with exact positions.'},
      palette:{type:'integer',description:'measure only: also return this many (1–12) main colours of the reference with their share of the area.'},
      look:{type:'boolean',description:'apply only: also return the reference and your drawing side by side after this batch.'},
      steps:{type:'integer',description:'undo only: how many applied batches to take back, 1–20, default 1.'},
      columns:{type:'integer',description:'measure only: grid columns, 1–16, default 6.'},
      rows:{type:'integer',description:'measure only: grid rows, 1–16, default 8.'},
      points:{type:'array',description:'measure only: up to 40 {x,y} points (0..1) whose reference and drawing colours are returned.',items:{type:'object',additionalProperties:false,properties:{x:{type:'number',required:true},y:{type:'number',required:true}}}},
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
