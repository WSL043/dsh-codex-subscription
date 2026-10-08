import { paintSketch } from './sketch-document.js'
import { applySketchCommands } from './sketch-commands.js'
import { createSketchLayers, SKETCH_RATIOS } from './sketch-layers.js'

export const SKETCH_FILE_ACCEPT = '.dsh-sketch.json,image/png,image/jpeg,image/webp'
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c}
export function encodeSketchDocument(doc) {
  return JSON.stringify({format:'dsh-sketch',version:1,doc})
}
export function decodeSketchDocument(text) {
  if(text.length>32*1024*1024)throw Error('Draft exceeds 32 MB')
  const file=JSON.parse(text),source=file.doc
  if(file.format!=='dsh-sketch'||file.version!==1||!source||!Array.isArray(source.layers)||!source.layers.length||source.layers.length>8)throw Error('Invalid sketch file')
  const w=source.width??1024,h=source.height??1024
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>2048||h>2048)throw Error('Invalid canvas size')
  let doc={...createSketchLayers(),width:w,height:h,ratio:Object.keys(SKETCH_RATIOS).find(k=>SKETCH_RATIOS[k][0]===w&&SKETCH_RATIOS[k][1]===h)??'custom'}
  for(let i=0;i<source.layers.length;i++){
    const layer=source.layers[i]
    if(i)doc=applySketchCommands(doc,[{op:'layer',action:'add'}])
    if(!Array.isArray(layer.strokes))throw Error('Invalid strokes')
    for(let j=0;j<layer.strokes.length;j+=256){
      const strokes=layer.strokes.slice(j,j+256)
      doc=applySketchCommands(doc,strokes.map(s=>({...s,op:'stroke',layer:doc.active,fill:s.fill??false})))
      const added=doc.layers.at(-1).strokes
      for(let k=0;k<strokes.length;k++){
        const s=strokes[k]
        if(s.brush!==undefined&&!['pen','pencil','marker'].includes(s.brush))throw Error('Invalid brush')
        if(s.pressure!==undefined&&(!Number.isFinite(s.pressure)||s.pressure<.2||s.pressure>1))throw Error('Invalid pressure')
        if(s.brushVersion!==undefined && s.brushVersion!==2)throw Error('Unsupported brush version')
        Object.assign(added[added.length-strokes.length+k],{brush:s.brush??'pen',pressure:s.pressure??1,...(s.brushVersion===2?{brushVersion:2}:{})})
      }
    }
    const target=doc.layers.at(-1);target.name=String(layer.name??'').slice(0,40);target.visible=layer.visible!==false
    if(layer.image){
      const image=layer.image
      if(typeof image.src!=='string'||!/^data:image\/png;base64,/.test(image.src)||image.src.length>8*1024*1024||['x','y','width','height'].some(k=>!Number.isFinite(image[k])||image[k]<0||image[k]>1))throw Error('Invalid draft image')
      const bytes=Uint8Array.from(atob(image.src.slice(image.src.indexOf(',')+1)),c=>c.charCodeAt(0))
      if(bytes.length<24)throw Error('Invalid draft image')
      const header=new DataView(bytes.buffer)
      if(header.getUint32(0)!==0x89504e47||header.getUint32(4)!==0x0d0a1a0a||header.getUint32(16)<1||header.getUint32(20)<1||header.getUint32(16)>4096||header.getUint32(20)>4096)throw Error('Invalid draft image size')
      target.image={src:image.src,x:image.x,y:image.y,width:image.width,height:image.height}
    }
  }
  const activeIndex=source.layers.findIndex(layer=>layer.id===source.active)
  doc.active=doc.layers[Math.max(0,activeIndex)].id
  return doc
}
