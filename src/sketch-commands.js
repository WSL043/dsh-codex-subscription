import { MAX_SKETCH_STROKES, MAX_STROKE_POINTS } from './sketch-document.js'
import { changeSketchLayer, strokeCount, resizeSketch } from './sketch-layers.js'

export const MAX_SKETCH_POINTS = 200_000
export const SKETCH_COMMAND_HELP = {
  coordinates: 'Normalized x/y in [0,1]; width is canvas pixels. Read documentId and revision before editing.',
  commands: {
    stroke: '{op:"stroke",layer:1,shape:"pen|line|rectangle|circle|polygon",color:"#rrggbb",width:2,opacity:1,fill:false,points:[{x:0.1,y:0.1},...]}',
    layer: '{op:"layer",action:"add|select|rename|visible|duplicate|up|down|delete|clear",id:1,value:"name"}',
    resize: '{op:"resize",ratio:"1:1|4:3|3:4|16:9|9:16"}',
  },
  limits: { strokes: MAX_SKETCH_STROKES, pointsPerStroke: MAX_STROKE_POINTS, pointsTotal: MAX_SKETCH_POINTS, commandsPerBatch: 256 },
}
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
export function applySketchCommands(source, commands) {
  if (!Array.isArray(commands) || !commands.length || commands.length > 256) throw Error('Expected 1–256 commands')
  let doc = source
  for (const command of commands) {
    if (!command || typeof command !== 'object') throw Error('Invalid command')
    if (command.op === 'resize') { doc = resizeSketch(doc, command.ratio); continue }
    if (command.op === 'layer') {
      if (!['add','select','rename','visible','duplicate','up','down','delete','clear'].includes(command.action)) throw Error('Unknown layer action')
      const next = changeSketchLayer(doc, command.action, command.id ?? doc.active, command.value)
      if (next === doc) throw Error('Layer action unavailable; inspect the document first')
      doc = next; continue
    }
    if (command.op !== 'stroke') throw Error('Unknown command')
    const { points, color, shape = 'pen', width = 2, opacity = 1, fill = false } = command
    if (!['pen','line','rectangle','circle','polygon','eraser'].includes(shape) || !/^#[0-9a-f]{6}$/i.test(color ?? '') ||
      !finite(width, 1, 256) || !finite(opacity, 0, 1) || typeof fill !== 'boolean' ||
      !Array.isArray(points) || !points.length || points.length > MAX_STROKE_POINTS ||
      points.some(p => !p || !finite(p.x,0,1) || !finite(p.y,0,1))) throw Error('Invalid stroke')
    if ((['line','rectangle','circle'].includes(shape) && points.length !== 2) || (shape === 'polygon' && points.length < 3)) throw Error('Invalid shape points')
    if (fill && !['rectangle','circle','polygon'].includes(shape)) throw Error('Fill requires a closed shape')
    const layer = doc.layers.find(layer => layer.id === (command.layer ?? doc.active))
    if (!layer?.visible) throw Error('Target layer is missing or hidden')
    const stroke = { shape, color, width, opacity, fill, brush:'pen', points:points.map(p=>({x:p.x,y:p.y})) }
    doc = {...doc,layers:doc.layers.map(item=>item===layer?{...item,strokes:[...item.strokes,stroke]}:item)}
  }
  if (strokeCount(doc) > MAX_SKETCH_STROKES || doc.layers.reduce((n,l)=>n+l.strokes.reduce((m,s)=>m+s.points.length,0),0) > MAX_SKETCH_POINTS) throw Error('Sketch resource budget exceeded')
  return doc
}

// A rejected batch leaves both the document and its history untouched.
export function createSketchCommandSession(adapter) {
  const completed = new Map()
  let pending = false
  return async request => {
    if (!request || typeof request!=='object') throw Error('Invalid sketch request')
    if (!adapter.available()) throw Error('Open the sketch board for this session first')
    const current = adapter.snapshot()
    if (request.action === 'inspect') return {...current, help:SKETCH_COMMAND_HELP}
    if (request.documentId !== current.documentId) throw Error('Document changed; inspect again')
    if (pending || adapter.busy()) throw Error('Sketch is being edited; retry after it settles')
    if (request.action === 'preview') return {...current, png:await adapter.preview()}
    if (!['apply','save'].includes(request.action)) throw Error('Unknown sketch action')
    if (typeof request.requestId !== 'string' || !request.requestId.length || request.requestId.length > 100) throw Error('A unique requestId is required')
    const key = `${current.documentId}:${request.requestId}`, fingerprint = JSON.stringify(request)
    const cached = completed.get(key)
    if (cached) { if(cached.fingerprint!==fingerprint)throw Error('requestId reused with different content');return cached.result }
    if (request.revision !== current.revision || adapter.busy()) throw Error('Sketch changed or is being edited; inspect again')
    if (request.action === 'apply') {
      const next = applySketchCommands(adapter.document(),request.commands)
      adapter.commit(next)
    } else {
      if(request.name!==undefined && (typeof request.name!=='string'||request.name.length>60))throw Error('Invalid draft name')
      pending=true;try{await adapter.save(request.name)}finally{pending=false}
    }
    const result = adapter.snapshot()
    completed.set(key,{fingerprint,result})
    if (completed.size > 128) completed.delete(completed.keys().next().value)
    return result
  }
}
