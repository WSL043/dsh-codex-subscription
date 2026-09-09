const DATABASE = 'dsh-codex-sketches-v1'
export async function sketchDrafts(action, value) {
  const db = await new Promise((resolve,reject) => {
    const request=indexedDB.open(DATABASE,1)
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'id'})
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
  })
  try {
    return await new Promise((resolve,reject) => {
      const tx=db.transaction('drafts',action==='list'?'readonly':'readwrite'), store=tx.objectStore('drafts')
      let result
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error ?? Error('Draft limit reached'))
      const request=store.getAll()
      request.onsuccess=()=>{
        const rows=request.result
        if(action==='list'){result=rows.sort((a,b)=>b.updated-a.updated);return}
        if(action==='delete'){store.delete(value);return}
        const others=rows.filter(row=>row.id!==value.id)
        if(others.length>=20 || JSON.stringify([...others,value]).length>32*1024*1024){tx.abort();return}
        store.put(value);result=value
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
