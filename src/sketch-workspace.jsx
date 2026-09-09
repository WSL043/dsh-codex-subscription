import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { SketchStudio } from './sketch-studio.jsx'
export { SKETCH_CSS } from './sketch-styles.js'
export function SketchWorkspace({ preference, attachSketch, appendPrompt, registerOpen, t }) {
  const settings = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const [mode,setMode]=useState(null),[brief,setBrief]=useState(''),[template,setTemplate]=useState('templatePoster'),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const dialog=useRef(null),opener=useRef(null)
  useEffect(()=>registerOpen((nextMode='sketch',source=document.activeElement)=>{
    opener.current=source;setError('')
    if(nextMode==='image'){try{appendPrompt(t('imageInlinePrompt'),'image')}catch{setError(t('imageDraftFailed'))}return}
    setMode(nextMode)
  }),[registerOpen,appendPrompt,t])
  useEffect(()=>{if(mode==='template')dialog.current?.showModal()},[mode])
  const close=()=>{setMode(null);opener.current?.focus()}
  const confirm=async()=>{if(busy||!settings.imageTemplates||!settings.imageGeneration)return;setBusy(true);setError('');try{await appendPrompt(`${t(`${template}Prompt`)}\n\n${brief.trim()}`,'template');close()}catch{setError(t('imageDraftFailed'))}finally{setBusy(false)}}
  return <>
    <SketchStudio open={mode==='sketch'} onClose={close} attachSketch={attachSketch} enabled={settings.imageSketch&&settings.imageEditing} t={t}/>
    {mode==='template'?<dialog ref={dialog} className="codexSketchDialog" aria-label={t('imageTemplate')} onCancel={event=>{event.preventDefault();if(!busy)close()}}>
      <h2>{t('imageTemplate')}</h2><div className="codexTemplateForm"><select aria-label={t('imageTemplate')} value={template} onChange={event=>setTemplate(event.target.value)}>{['templatePoster','templateProduct','templateIcon'].map(key=><option key={key} value={key}>{t(key)}</option>)}</select><textarea aria-label={t('templatePrompt')} value={brief} onChange={event=>setBrief(event.target.value)} placeholder={t('templatePrompt')}/></div>
      <p className="codexSketchHint">{error||t('imageDraftHint')}</p><footer><button type="button" disabled={busy} onClick={close}>{t('sketchCancel')}</button><button type="button" disabled={busy||!brief.trim()} onClick={()=>void confirm()}>{t('templateAdd')}</button></footer>
    </dialog>:null}
    {error&&mode===null?<span role="alert">{error}</span>:null}
  </>
}
