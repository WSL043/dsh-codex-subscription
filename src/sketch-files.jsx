import { useEffect, useRef, useState } from 'react'
import { useSketchDismiss } from './sketch-interactions.js'
import { sketchDrafts } from './sketch-drafts.js'
export function SketchFiles({ save, load, fresh, importImage, disabled, t, report, onWorking }) {
  const [open,setOpen]=useState(false),[rows,setRows]=useState([]),[name,setName]=useState(''),[remove,setRemove]=useState(null),[working,setWorking]=useState(false)
  const input=useRef(null), host=useRef(null)
  useEffect(()=>{if(open&&!working){host.current?.querySelector('input:not([type=file])')?.focus({preventScroll:true})}else if(!open&&document.activeElement===document.body){const dialog=host.current?.closest('dialog');if(dialog?.open)dialog.querySelector('canvas')?.focus({preventScroll:true})}},[open,working])
  useSketchDismiss(open,setOpen,host,['.codexSketchFiles'])
  const run=async operation=>{setWorking(true);onWorking(true);try{await operation()}catch{report(t('sketchStorageFailed'))}finally{setWorking(false);onWorking(false)}}
  const refresh=async()=>setRows(await sketchDrafts('list'))
  return <div ref={host} className="codexSketchFiles" onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false)}}}>
    <button type="button" disabled={disabled||working} aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void run(refresh)}}>{t('sketchFiles')}</button>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(async()=>{await importImage(file);setOpen(false)})}} />
    {open?<section className="codexSketchFilePanel" aria-label={t('sketchFiles')}>
      <div className="codexSketchFileActions"><button type="button" disabled={working} onClick={()=>void run(async()=>{await fresh();setName('');setOpen(false)})}>{t('sketchNew')}</button><button type="button" disabled={working} onClick={()=>input.current.click()}>{t('sketchImport')}</button></div>
      <input aria-label={t('sketchDraftName')} placeholder={t('sketchDraftName')} value={name} maxLength={60} onChange={e=>setName(e.target.value)}/>
      <button type="button" disabled={working} onClick={()=>void run(async()=>{await save(name);await refresh()})}>{t('sketchSave')}</button>
      <small>{t('sketchLocalDrafts')}</small>
      <div className="codexSketchDraftList">{rows.map(row=><div key={row.id}><button type="button" disabled={working} onClick={()=>void run(async()=>{await load(row);setName(row.name);setOpen(false)})}>{row.name}</button><button type="button" disabled={working} aria-label={`${t('sketchDeleteDraft')} ${row.name}`} onClick={()=>{if(remove!==row.id){setRemove(row.id);return}void run(async()=>{await sketchDrafts('delete',row.id);setRemove(null);await refresh()})}}>{remove===row.id?t('sketchDeleteConfirm'):t('sketchDeleteDraft')}</button></div>)}</div>
      <button type="button" onClick={()=>setOpen(false)}>{t('sketchFileClose')}</button>
    </section>:null}
  </div>
}
