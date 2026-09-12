import test from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { sketchDrafts } from '../src/sketch-drafts.js'
const name='dsh-codex-sketches-v1'
const open=(version)=>new Promise((resolve,reject)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
test.beforeEach(()=>{globalThis.indexedDB=new IDBFactory()})
test.after(()=>{delete globalThis.indexedDB})
test('migration preserves named drafts and lists only metadata',async()=>{
 const db=await open(1)
 await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({id:'old',name:'Original',updated:1,doc:{layers:[]}});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})
 db.close()
 assert.equal((await sketchDrafts('list'))[0].name,'Original')
 assert.equal('doc' in (await sketchDrafts('list'))[0],false)
 assert.deepEqual((await sketchDrafts('get','old')).doc,{layers:[]})
})
test('failed full-store save keeps both named data and recovery; successful replacement clears recovery',async()=>{
 for(let i=0;i<20;i++)await sketchDrafts('save',{id:String(i),updated:i,doc:{value:i}})
 await sketchDrafts('checkpoint',{id:'session',updated:21,doc:{value:'recovery'}})
 await assert.rejects(sketchDrafts('save',{id:'overflow',updated:22,doc:{}},'session'),{code:'SKETCH_DRAFT_LIMIT'})
 assert.equal((await sketchDrafts('recover','session')).doc.value,'recovery')
 assert.equal((await sketchDrafts('get','0')).doc.value,0)
 await sketchDrafts('save',{id:'0',updated:23,doc:{value:'saved'}},'session')
 assert.equal(await sketchDrafts('recover','session'),undefined)
 assert.equal((await sketchDrafts('get','0')).doc.value,'saved')
})
test('oversized replacement is atomic and clearRecovery does not touch named drafts',async()=>{
 await sketchDrafts('save',{id:'a',doc:{value:'kept'}})
 await assert.rejects(sketchDrafts('save',{id:'a',doc:{value:'x'.repeat(32*1024*1024)}}),{code:'SKETCH_STORAGE_LIMIT'})
 assert.equal((await sketchDrafts('get','a')).doc.value,'kept')
 await sketchDrafts('checkpoint',{id:'session',doc:{}})
 await sketchDrafts('clearRecovery','session')
 assert.equal(await sketchDrafts('recover','session'),undefined)
 assert.equal((await sketchDrafts('get','a')).doc.value,'kept')
})
test('blocked upgrade rejects promptly, aborts its late upgrade and permits explicit retry',async()=>{
 const held=await open(1)
 await assert.rejects(sketchDrafts('list'),{code:'SKETCH_STORAGE_BLOCKED'})
 held.close()
 const old=await open(1)
 assert.equal(old.version,1)
 old.close()
 assert.deepEqual(await sketchDrafts('list'),[])
})
