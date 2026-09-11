import { identifyObjects, transformObject } from './sketch-objects.js'
import { MAX_SKETCH_STROKES, MAX_STROKE_POINTS } from './sketch-document.js'
import { changeSketchLayer, strokeCount, resizeSketch } from './sketch-layers.js'

export const MAX_SKETCH_POINTS = 200_000
export const SKETCH_COMMAND_HELP = {
  coordinates: 'Assign short meaningful stroke id values for later edits. Text uses two opposite box corners and text content; width is font size in pixels, automatic fitting within the box. Arrow uses two endpoints. Normalized x/y in [0,1]; width is canvas pixels. Read documentId and revision before editing.',
  shapes: 'line: exactly two endpoints; rectangle/circle: exactly two opposite bounding-box corners (circle draws an ellipse within that box); polygon: three or more vertices, closed automatically; pen: ordered path points. bezier: start point, then groups of control1/control2/end; use 4 points for one cubic curve, max 64 segments. Prefer bezier for smooth designed curves instead of many pen samples. fill:true closes and fills the curve. fill:true fills rectangle/circle/polygon. Layers and strokes paint in list order, later ones on top. All commands needed for drawing are described here; no source-code search is required.',
  commands: {
    stroke: '{op:"stroke",layer:1,shape:"pen|line|arrow|text|rectangle|circle|polygon|bezier",color:"#rrggbb",width:2,opacity:1,fill:false,points:[{x:0.1,y:0.1},...]}',
    layer: '{op:"layer",action:"add|select|rename|visible|duplicate|up|down|delete|clear",id:1,value:"name"}',
    object: '{op:"object",layer:1,id:"title",action:"update|duplicate|delete",patch:{color:"#0088ff",text:"Title"},transform:{dx:0.05,dy:0,scaleX:1,scaleY:1}}. All patch and transform fields optional. Inspect returns object IDs and bounds. Prefer targeted edits over redrawing layers.',
    resize: '{op:"resize",ratio:"1:1|4:3|3:4|16:9|9:16"}',
  },
  limits: { strokes: MAX_SKETCH_STROKES, pointsPerStroke: MAX_STROKE_POINTS, pointsTotal: MAX_SKETCH_POINTS, commandsPerBatch: 256 },
}
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
export function applySketchCommands(source, commands) {
  if (!Array.isArray(commands) || !commands.length || commands.length > 256) throw Error('Expected 1–256 commands')
  let doc = identifyObjects(source)
  for (const command of commands) {
    if (!command || typeof command !== 'object') throw Error('Invalid command')
    if (command.op === 'resize') { doc = resizeSketch(doc, command.ratio); continue }
    if (command.op === 'layer') {
      if (!['add','select','rename','visible','duplicate','up','down','delete','clear'].includes(command.action)) throw Error('Unknown layer action')
      const next = changeSketchLayer(doc, command.action, command.id ?? doc.active, command.value)
      if (next === doc) throw Error('Layer action unavailable; inspect the document first')
      doc = next; continue
    }
    if (command.op === 'object') {
      const layer=doc.layers.find(l=>l.id===(command.layer??doc.active)), index=layer?.strokes.findIndex(s=>s.id===command.id)
      if(!layer?.visible || index<0 || index===undefined)throw Error('Object missing or hidden; inspect again')
      const strokes=layer.strokes.slice(), original=strokes[index]
      if(command.action==='delete')strokes.splice(index,1)
      else if(command.action==='duplicate'){strokes.splice(index+1,0,{...original,id:crypto.randomUUID(),points:original.points.map(p=>({...p}))})}
      else if(command.action==='update'){
        const patch=command.patch??{}
        if(Object.keys(patch).some(k=>!['color','width','opacity','fill','text','points'].includes(k)))throw Error('Unsupported object property')
        const changed=command.transform?transformObject({...original,...patch},command.transform):{...original,...patch}
        const validated=applySketchCommands({...doc,layers:[{...layer,strokes:[]}]},[{...changed,op:'stroke',layer:layer.id}])
        strokes[index]={...validated.layers[0].strokes[0],brush:original.brush??'pen',...(original.pressure!==undefined?{pressure:original.pressure}:{})}
      }else throw Error('Unknown object action')
      doc={...doc,layers:doc.layers.map(l=>l===layer?{...l,strokes}:l)};continue
    }
    if (command.op !== 'stroke') throw Error('Unknown command')
    const { points, color, shape = 'pen', width = shape==='text'?24:2, opacity = 1, fill = false } = command
    if (!['pen','line','rectangle','circle','polygon','bezier','arrow','text','eraser'].includes(shape) || !/^#[0-9a-f]{6}$/i.test(color ?? '') ||
      !finite(width, 1, 256) || !finite(opacity, 0, 1) || typeof fill !== 'boolean' ||
      !Array.isArray(points) || !points.length || points.length > MAX_STROKE_POINTS ||
      points.some(p => !p || !finite(p.x,0,1) || !finite(p.y,0,1))) throw Error('Invalid stroke')
    if ((['line','arrow','text','rectangle','circle'].includes(shape) && points.length !== 2) || (shape === 'polygon' && points.length < 3)) throw Error('Invalid shape points')
    if (shape==='bezier' && (points.length<4 || points.length>193 || (points.length-1)%3!==0)) throw Error('Bezier needs a start point followed by groups of two controls and an endpoint (max 64 segments)')
    if (fill && !['rectangle','circle','polygon','bezier'].includes(shape)) throw Error('Fill requires a closed shape')
    const layer = doc.layers.find(layer => layer.id === (command.layer ?? doc.active))
    if (!layer?.visible) throw Error('Target layer is missing or hidden')
    if(shape==='text' && (typeof command.text!=='string'||!command.text.trim()||command.text.length>500||points[0].x===points[1].x||points[0].y===points[1].y))throw Error('Text requires 1–500 characters and a non-empty bounding box')
    const id=command.id??crypto.randomUUID()
    if(typeof id!=='string'||!id.length||id.length>100||layer.strokes.some(s=>s.id===id))throw Error('Invalid or duplicate object id')
    const stroke = { id, ...(shape==='text'?{text:command.text}:{}), shape, color, width, opacity, fill, brush:'pen', points:points.map(p=>({x:p.x,y:p.y})) }
    doc = {...doc,layers:doc.layers.map(item=>item===layer?{...item,strokes:[...item.strokes,stroke]}:item)}
  }
  if (strokeCount(doc) > MAX_SKETCH_STROKES || doc.layers.reduce((n,l)=>n+l.strokes.reduce((m,s)=>m+s.points.length,0),0) > MAX_SKETCH_POINTS) throw Error('Sketch resource budget exceeded')
  return doc
}

// A rejected batch leaves both the document and its history untouched.
export function createSketchCommandSession(adapter) {
  const completed = new Map()
  let pending = false, cachedCharacters=0
  return async request => {
    if (!request || typeof request!=='object') throw Error('Invalid sketch request')
    if (!adapter.available()) throw Error('Open the sketch board for this session first')
    const current = adapter.snapshot()
    if (request.action === 'inspect') {
      const offset=request.offset??0,objects=adapter.objects?.()??[]
      if(!Number.isInteger(offset)||offset<0)throw Error('offset must be a non-negative integer')
      return {...current,objects:objects.slice(offset,offset+50),objectCount:objects.length,
        ...(offset+50<objects.length?{nextOffset:offset+50}:{}),
        ...(request.objectId?{object:adapter.object?.(request.objectId,request.layer)}:{}),
        recentRequests:[...completed.values()].slice(-8).map(entry=>entry.receipt),help:SKETCH_COMMAND_HELP}
    }
    if (request.documentId !== current.documentId) throw Error('Document changed; inspect again')
    if (pending || adapter.busy()) throw Error('Sketch is being edited; retry after it settles')
    if (request.action === 'preview') return {...current, png:await adapter.preview()}
    if (!['apply','save'].includes(request.action)) throw Error('Unknown sketch action')
    if (typeof request.requestId !== 'string' || !request.requestId.length || request.requestId.length > 100) throw Error('A unique requestId is required')
    const key = `${current.documentId}:${request.requestId}`, fingerprint = JSON.stringify({...request,runId:undefined})
    const cached = completed.get(key)
    if (cached) { if(cached.fingerprint!==fingerprint)throw Error('requestId reused with different content');return cached.result }
    if (request.revision !== current.revision || adapter.busy()) throw Error('Sketch changed or is being edited; inspect again')
    let changedObjects
    if (request.action === 'apply') {
      const before=adapter.document(), next = applySketchCommands(before,request.commands)
      adapter.commit(next)
      const previous=new Map(before.layers.flatMap(l=>l.strokes.map(s=>[`${l.id}:${s.id}`,s])))
      changedObjects=next.layers.flatMap(l=>l.strokes.filter(s=>previous.get(`${l.id}:${s.id}`)!==s).map(s=>({layer:l.id,id:s.id})))
    } else {
      if(request.name!==undefined && (typeof request.name!=='string'||request.name.length>60))throw Error('Invalid draft name')
      pending=true;try{await adapter.save(request.name)}finally{pending=false}
    }
    const result = {...adapter.snapshot(),...(changedObjects?{changedObjects:changedObjects.slice(0,100),changedObjectCount:changedObjects.length}:{})}
    completed.set(key,{fingerprint,result,receipt:{requestId:request.requestId,action:request.action,revision:result.revision}})
    cachedCharacters+=fingerprint.length
    while(completed.size>1 && (completed.size>128 || cachedCharacters>4_000_000)){
      const oldest=completed.keys().next().value;cachedCharacters-=completed.get(oldest).fingerprint.length;completed.delete(oldest)
    }
    return result
  }
}
