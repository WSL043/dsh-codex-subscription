const DATABASE = 'dsh-codex-sketches-v1'
const MAX_STORAGE = 32 * 1024 * 1024
const metadata = (kind, row) => ({key:`${kind}:${row.id}`,kind,id:row.id,name:row.name,updated:row.updated,size:JSON.stringify(row).length})

export async function sketchDrafts(action, value, recoverySession) {
  const db = await new Promise((resolve,reject) => {
    const request=indexedDB.open(DATABASE,2)
    request.onupgradeneeded=()=>{
      const db=request.result,tx=request.transaction
      if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'id'})
      const meta=db.createObjectStore('metadata',{keyPath:'key'})
      db.createObjectStore('recovery',{keyPath:'id'})
      // One-time migration; subsequent list/save operations read only metadata.
      const cursor=tx.objectStore('drafts').openCursor()
      cursor.onsuccess=()=>{const row=cursor.result;if(row){meta.put(metadata('drafts',row.value));row.continue()}}
    }
    request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)}
    request.onerror=()=>reject(request.error)
  })
  try {
    return await new Promise((resolve,reject) => {
      const write=['save','delete','checkpoint','clearRecovery'].includes(action)
      const tx=db.transaction(['drafts','metadata','recovery'],write?'readwrite':'readonly')
      const meta=tx.objectStore('metadata'),kind=['checkpoint','recover','clearRecovery'].includes(action)?'recovery':'drafts',store=tx.objectStore(kind)
      let result, failure
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(failure??tx.error??Error('Draft transaction aborted'))
      if(action==='get'||action==='recover'){const req=store.get(value);req.onsuccess=()=>{result=req.result};return}
      if(action==='delete'||action==='clearRecovery'){store.delete(value);meta.delete(`${kind}:${value}`);return}
      if(!['list','save','checkpoint'].includes(action)){tx.abort();return}
      const request=meta.getAll()
      request.onsuccess=()=>{
        const rows=request.result
        if(action==='list'){result=rows.filter(row=>row.kind==='drafts').sort((a,b)=>b.updated-a.updated);return}
        const next=metadata(kind,value),others=rows.filter(row=>row.key!==next.key && !(action==='save'&&recoverySession&&row.key===`recovery:${recoverySession}`))
        const code=others.filter(row=>row.kind===kind).length>=20?'SKETCH_DRAFT_LIMIT':others.reduce((n,row)=>n+row.size,0)+next.size>MAX_STORAGE?'SKETCH_STORAGE_LIMIT':null
        if(code){failure=Object.assign(Error('Draft storage limit reached'),{code});tx.abort();return}
        store.put(value);meta.put(next);if(action==='save'&&recoverySession){tx.objectStore('recovery').delete(recoverySession);meta.delete(`recovery:${recoverySession}`)}result=value
      }
    })
  } finally { db.close() }
}

export async function decodeSketchImages(doc, images) {
  for(const layer of doc.layers) {
    const src=layer.image?.src
    if(!src || images.has(src))continue
    if(!src.startsWith('data:image/png;base64,') || src.length>8*1024*1024)throw Error('Invalid image')
    const image=new Image();image.src=src;await image.decode();images.set(src,image)
  }
}

export async function importSketchImage(file) {
  if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>20*1024*1024)throw Error('Image must be PNG, JPEG or WebP under 20 MB')
  const bitmap=await createImageBitmap(file)
  try {
    if(bitmap.width*bitmap.height>32*1024*1024)throw Error('Image too large')
    const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height))
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height)
    return {src:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height}
  } finally {bitmap.close()}
}
