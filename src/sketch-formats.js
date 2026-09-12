import { paintSketch } from './sketch-document.js'
import { applySketchCommands } from './sketch-commands.js'
import { createSketchLayers, SKETCH_RATIOS } from './sketch-layers.js'

export const SKETCH_FILE_ACCEPT = '.psd,.dsh-sketch.json,image/png,image/jpeg,image/webp'
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c}
export function runPsdCodec(action,payload) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker('/api/codex-subscription/sketch-psd-worker',{type:'module'})
    const finish=(callback,value)=>{clearTimeout(timer);worker.terminate();callback(value)}
    const timer=setTimeout(()=>finish(reject,Error('PSD operation timed out')),30_000)
    worker.onerror=()=>finish(reject,Error('PSD codec could not be loaded'))
    worker.onmessage=event=>event.data.ok?finish(resolve,event.data.value):finish(reject,Error(event.data.error))
    worker.postMessage({action,payload})
  })
}
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
export async function exportSketchPsd(doc, images, composite) {
  const width=doc.width??1024,height=doc.height??1024
  const children=doc.layers.map((layer,i)=>{
    const c=canvas(width,height),ctx=c.getContext('2d'),ref=layer.image
    if(ref)ctx.drawImage(images.get(ref.src),ref.x*width,ref.y*height,ref.width*width,ref.height*height)
    paintSketch(ctx,layer.strokes,width,true,height)
    return {name:layer.name||`Layer ${i+1}`,hidden:!layer.visible,opacity:1,blendMode:'normal',imageData:ctx.getImageData(0,0,width,height)}
  })
  // The sketch editor's white paper is part of the exported PSD, including transparency below strokes.
  const paper=canvas(width,height),context=paper.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,width,height)
  // Bake the implicit paper into the bottom layer, keeping the public layer count stable.
  if(children[0] && !children[0].hidden){const bottom=canvas(width,height);bottom.getContext('2d').putImageData(children[0].imageData,0,0);context.drawImage(bottom,0,0);children[0].imageData=context.getImageData(0,0,width,height)}
  else {
    if(children.length>=8)throw Error('Show the bottom layer before exporting this eight-layer drawing')
    children.unshift({name:'Paper',opacity:1,blendMode:'normal',imageData:context.getImageData(0,0,width,height)})
  }
  return runPsdCodec('write',{width,height,children,imageData:composite.getContext('2d').getImageData(0,0,width,height)})
}

export async function importSketchPsd(file) {
  if(file.size>32*1024*1024)throw Error('PSD exceeds 32 MB')
  const psd=await runPsdCodec('read',await file.arrayBuffer())
  const scale=Math.min(1,1024/Math.max(psd.width,psd.height)),width=Math.max(1,Math.round(psd.width*scale)),height=Math.max(1,Math.round(psd.height*scale))
  const doc={...createSketchLayers(),width,height,ratio:Object.keys(SKETCH_RATIOS).find(k=>SKETCH_RATIOS[k][0]===width&&SKETCH_RATIOS[k][1]===height)??'custom',layers:[],nextId:psd.layers.length+1}
  for(const [i,layer]of psd.layers.entries()){
    const src=canvas(layer.imageData.width,layer.imageData.height);src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(layer.imageData.data),layer.imageData.width,layer.imageData.height),0,0)
    const out=canvas(width,height),ctx=out.getContext('2d');ctx.globalAlpha=layer.opacity;ctx.drawImage(src,layer.left*scale,layer.top*scale,src.width*scale,src.height*scale)
    doc.layers.push({id:i+1,name:layer.name,visible:!layer.hidden,strokes:[],image:{src:out.toDataURL('image/png'),x:0,y:0,width:1,height:1}})
  }
  return doc
}
