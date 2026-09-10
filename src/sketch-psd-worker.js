import { readPsd, writePsd, initializeCanvas } from 'ag-psd'
initializeCanvas((w,h)=>new OffscreenCanvas(w,h),undefined,(w,h)=>new ImageData(w,h))

const fail = () => { throw Error('PSD supports 8-bit RGB pixel layers, normal blending, up to 8 layers and 4096 × 4096. Flatten masks/effects in your painting software first.') }
function rasterLayers(children, inherited = {opacity:1,hidden:false}, result=[]) {
  for(const layer of children ?? []) {
    if(layer.blendMode && !['normal','pass through'].includes(layer.blendMode) || layer.mask || layer.realMask || layer.effects || layer.adjustment || layer.clipping || layer.vectorMask)fail()
    const opacity=inherited.opacity*(layer.opacity??1),hidden=inherited.hidden||Boolean(layer.hidden)
    if(layer.children && opacity!==1)fail()
    if(layer.children)rasterLayers(layer.children,{opacity,hidden},result)
    else if(layer.imageData)result.push({name:String(layer.name??'').slice(0,40),left:layer.left??0,top:layer.top??0,opacity,hidden,imageData:layer.imageData})
    if(result.length>8)fail()
  }
  return result
}
self.onmessage=event=>{
  try {
    const {action,payload}=event.data
    if(action==='write'){
      const data=writePsd(payload,{noBackground:true,trimImageData:true})
      self.postMessage({ok:true,value:data},[data]);return
    }
    if(action!=='read')throw Error('Unknown PSD operation')
    const header=new DataView(payload)
    if(header.byteLength<26 || header.getUint32(0)!==0x38425053 || header.getUint16(4)!==1 || header.getUint16(22)!==8 || header.getUint16(24)!==3 || header.getUint32(14)<1 || header.getUint32(18)<1 || header.getUint32(14)>4096 || header.getUint32(18)>4096)fail()
    const psd=readPsd(payload,{useImageData:true,skipThumbnail:true,skipLinkedFilesData:true,totalMemoryLimit:192*1024*1024,throwForMissingFeatures:true})
    const layers=rasterLayers(psd.children)
    if(!layers.length && psd.imageData)layers.push({name:'Background',left:0,top:0,opacity:1,hidden:false,imageData:psd.imageData})
    if(!layers.length)throw Error('PSD has no readable pixels')
    self.postMessage({ok:true,value:{width:psd.width,height:psd.height,layers}})
  }catch(error){self.postMessage({ok:false,error:error.message})}
}
