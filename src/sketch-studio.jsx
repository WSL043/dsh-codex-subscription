import { SketchRunStatus } from './sketch-run-status.jsx'
import { switchSketchToolWidth, stepSketchWidth } from './sketch-tool-widths.js'
import { sketchShortcutAction } from './sketch-shortcuts.js'
import { createSketchSessionState } from './sketch-session-state.js'
import { useEffect, useRef, useState } from 'react'
import { SKETCH_SIZE, MAX_SKETCH_STROKES, MAX_STROKE_POINTS, sketchPoint } from './sketch-document.js'
import { createSketchLayers, changeSketchLayer, strokeCount, strokeHit, MAX_SKETCH_LAYERS, SKETCH_RATIOS, resizeSketch } from './sketch-layers.js'
import { paintSketchLayers } from './sketch-layer-renderer.js'
import { snapLine, smoothStrokePoints } from './sketch-input.js'
import { sketchDrafts, decodeSketchImages, importSketchImage } from './sketch-drafts.js'
import { useSketchView, SketchViewControls } from './sketch-view.jsx'
import { SketchFiles } from './sketch-files.jsx'
import { useSketchDismiss, useSketchCursor } from './sketch-interactions.js'
import { WorkspaceIcon } from './workspace-icons.jsx'
import { SketchSizeControl } from './sketch-size-control.jsx'
import { identifyObjects, objectId, objectBounds, transformObject, sketchObjectSummary } from './sketch-objects.js'
import { applySketchCommands, createSketchCommandSession, MAX_SKETCH_POINTS } from './sketch-commands.js'
import { createSketchAgentRun } from './sketch-agent-run.js'
import { connectSketchAgent } from './sketch-agent-client.js'
import { encodeSketchDocument, decodeSketchDocument, exportSketchPsd, importSketchPsd } from './sketch-formats.js'
const PALETTE = ['#18181b','#929398','#ff3936','#ff9500','#ffcc00','#34c759','#0088ff']
export function SketchStudio({ open, agentEnabled, agentPreview, onOpen, onClose, attachSketch, enabled, t, incoming, sessionId, rpc, sessionState }) {
  const localSession = useRef(null)
  localSession.current ??= sessionState ?? createSketchSessionState()
  const {doc,undo,redo,images,saved,dirty,documentId,documentRevision,agentAdapter,agentSession,agentRun} = localSession.current
  const dialog = useRef(null), canvas = useRef(null), cache = useRef(new Map())
  const active = useRef(null), frame = useRef(null), updateUi = useRef(false)
  const [agentState,setAgentState] = useState(agentRun.current?.state ?? 'idle')
  const agentLocked = agentState === 'drawing'
  const [noticeHidden,setNoticeHidden] = useState(false)
  const [stability, setStability] = useState(0), [flow,setFlow] = useState(100), [picturesOpen,setPicturesOpen] = useState(false)
  const pictureInput = useRef(null), received = useRef(null)
  const navigation = useSketchView(canvas, open)
  const toolWidths=useRef({})
  const [revision, redraw] = useState(0), [tool, setTool] = useState('pen'), [brush, setBrush] = useState('pen')
  const [eraser, setEraser] = useState('pixel'), [color, setColor] = useState('#0088ff'), [width, setWidth] = useState(12)
  const [selection,setSelection]=useState(null),[textEdit,setTextEdit]=useState(null),[shapesOpen,setShapesOpen]=useState(false)
  const sizeGesture=useRef(false)
  const [sizeMode,setSizeMode]=useState('size')
  const showOpacity=tool!=='eraser'
  const opacityMode=showOpacity && sizeMode==='opacity'
  const selectedLayer=doc.current.layers.find(l=>l.id===selection?.layer),selected=selectedLayer?.strokes.find((s,i)=>objectId(s,i)===selection?.id)
  const editObject=(patch,action='update')=>{if(agentRun.current?.locked||busy||!selected)return;try{const next=applySketchCommands(doc.current,[{op:'object',...selection,action,patch}]);if(!sizeGesture.current)checkpoint();doc.current=next;schedule();if(action==='delete')setSelection(null)}catch(e){setError(e.message)}}
  const pickColor=value=>{setColor(value);if(selected)editObject({color:value})}
  const chooseTool=(name,nextBrush=brush)=>{setWidth(switchSketchToolWidth(toolWidths.current,{tool,brush,width},{tool:name,brush:nextBrush}));setBrush(nextBrush);setTool(name);if(name!=='select')setSelection(null)}
  const chooseBrush=name=>chooseTool('pen',name)
  const [fillShape,setFillShape] = useState(false)
  const [hydrated,setHydrated]=useState(false),[recovered,setRecovered]=useState(false)
  const [restoreAttempt,retryRestore]=useState(0)
  const [layersOpen, setLayersOpen] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState('')
  const cursorRing=useRef(null)
  const cursor=useSketchCursor(canvas,cursorRing,width,tool==='pen'?brush:'pen',navigation.view.scale,!open||navigation.space||busy||agentLocked||tool==='select'||tool==='text')
  useSketchDismiss(shapesOpen,setShapesOpen,dialog,['.codexSketchShapeMenu','.codexSketchShapeToggle'])
  useSketchDismiss(layersOpen,setLayersOpen,dialog,['.codexSketchLayers','.codexSketchLayersToggle'])
  useSketchDismiss(picturesOpen,setPicturesOpen,dialog,['.codexSketchPictures','.codexSketchPicturesToggle'])
  const paint = () => { if (!canvas.current) return; const w = doc.current.width ?? SKETCH_SIZE, h = doc.current.height ?? SKETCH_SIZE; if (canvas.current.width !== w) canvas.current.width = w; if (canvas.current.height !== h) canvas.current.height = h; paintSketchLayers(canvas.current.getContext('2d'), doc.current, cache.current, w, h, active.current?.eraseStroke ? undefined : active.current?.layer, images.current) }
  const schedule = (ui = true) => { updateUi.current ||= ui; if (frame.current !== null) return; frame.current = requestAnimationFrame(() => { frame.current = null; paint(); if (updateUi.current) { updateUi.current = false; redraw(value => value + 1) } }) }
  const checkpoint = () => { documentRevision.current++; dirty.current = true; undo.current.push(doc.current); if (undo.current.length > 30) undo.current.shift(); redo.current = [] }
  const change = (action, id, value) => { if (busy || agentRun.current?.locked || active.current) return; const next = changeSketchLayer(doc.current, action, id, value); if (next === doc.current) return; if (action !== 'select') checkpoint(); else documentRevision.current++; doc.current = next; setError(''); schedule() }
  useEffect(() => { if (open) { dialog.current.showModal(); canvas.current.width = doc.current.width ?? SKETCH_SIZE; paint() } else dialog.current?.close() }, [open])
  useEffect(() => () => { cancelAnimationFrame(frame.current); cache.current.clear() }, [])
  const hasContent = () => doc.current.layers.some(layer => layer.image || layer.strokes.length)
  const save = async name => {
    const savingDocument=documentId.current,savingRevision=documentRevision.current
    const row = { id: saved.current?.id ?? crypto.randomUUID(), name: name?.trim() || saved.current?.name || `${t('sketchTitle')} ${new Date().toLocaleString()}`, updated: Date.now(), doc: structuredClone(doc.current) }
    try{await sketchDrafts('save', row, sessionId)}catch(error){if(error.code==='SKETCH_DRAFT_LIMIT')error.message=t('sketchDraftLimit');if(error.code==='SKETCH_STORAGE_LIMIT')error.message=t('sketchStorageLimit');throw error}
    if(documentId.current===savingDocument){saved.current = {id:row.id,name:row.name};if(documentRevision.current===savingRevision){dirty.current = false;setRecovered(false)}}
  }
  const saveChanges = async () => { if(!dirty.current)return;if(hasContent()||saved.current)await save();else{await sketchDrafts('clearRecovery',sessionId);dirty.current=false;setRecovered(false)} }
  const replace = (next, decoded, identity) => { documentId.current=crypto.randomUUID();documentRevision.current++;doc.current = identifyObjects(structuredClone(next));setSelection(null);setTextEdit(null); images.current = decoded; cache.current.clear(); undo.current = []; redo.current = []; saved.current = identity; dirty.current = false; schedule() }
  const fresh = async () => { await saveChanges(); replace(createSketchLayers(), new Map(), null) }
  const load = async row => { if(row.id===saved.current?.id)return; row=await sketchDrafts('get',row.id);if(!row)throw Error('Draft no longer exists');await saveChanges(); const decoded = new Map(); await decodeSketchImages(row.doc, decoded); replace(row.doc, decoded, {id:row.id,name:row.name}) }
  useEffect(()=>localSession.current.retain?.(),[])
  useEffect(()=>{
    let live=true
    setHydrated(false);setBusy(true);setError('')
    const restore=async()=>{
      if(!enabled)return
      if(!dirty.current&&!hasContent()){
        const recovery=await sketchDrafts('recover',sessionId)
        const archived=localSession.current.restoreId.current
        const row=recovery??(archived?await sketchDrafts('get',archived):null)
        if(row){const decoded=new Map();await decodeSketchImages(row.doc,decoded);if(!live)return;replace(row.doc,decoded,recovery?null:{id:row.id,name:row.name});dirty.current=Boolean(recovery);setRecovered(Boolean(recovery))}
        if(live)localSession.current.restoreId.current=null
      }
    }
    void restore().then(()=>{if(live){setHydrated(true);setBusy(false)}}).catch(error=>{if(live)setError(t(error.code==='SKETCH_STORAGE_BLOCKED'?'sketchStorageBlocked':'sketchStorageFailed'))})
    return ()=>{live=false}
  },[enabled,sessionId,restoreAttempt])
  useEffect(()=>{
    if(!hydrated||!enabled||!dirty.current||busy||agentLocked)return
    const timer=setTimeout(()=>{
      if(active.current||sizeGesture.current||!dirty.current)return
      const row={id:sessionId,updated:Date.now(),doc:structuredClone(doc.current)}
      void sketchDrafts('checkpoint',row).catch(()=>setError(t('sketchRecoveryFailed')))
    },1500)
    return ()=>clearTimeout(timer)
  },[revision,hydrated,enabled,busy,agentLocked,sessionId])
  const importImage = async file => {
    if(file.name?.toLowerCase().endsWith('.psd') || file.name?.toLowerCase().endsWith('.dsh-sketch.json')){
      if(file.size>32*1024*1024)throw Error('File exceeds 32 MB')
      const next=file.name.toLowerCase().endsWith('.psd')?await importSketchPsd(file):decodeSketchDocument(await file.text())
      const decoded=new Map();await decodeSketchImages(next,decoded);await saveChanges();replace(next,decoded,null);dirty.current=true;return
    }
    if (doc.current.layers.length >= MAX_SKETCH_LAYERS) throw Error('Layer limit')
    const image = await importSketchImage(file), w = doc.current.width ?? SKETCH_SIZE, h = doc.current.height ?? SKETCH_SIZE
    const scale = Math.min(w / image.width, h / image.height), width = image.width * scale / w, height = image.height * scale / h
    const layer = {id:doc.current.nextId,name:file.name?.slice(0,40) || t('sketchImport'),visible:true,strokes:[],image:{src:image.src,x:(1-width)/2,y:(1-height)/2,width,height}}
    await decodeSketchImages({layers:[layer]}, images.current)
    checkpoint();doc.current = {...doc.current,nextId:layer.id+1,active:layer.id,layers:[...doc.current.layers,layer]};schedule()
  }
  const close = async () => { if (!hydrated || agentRun.current?.locked) { onClose(); return } if (busy || active.current) return; setBusy(true); try { await saveChanges(); onClose() } catch(error) { setError(error.code?.startsWith('SKETCH_')?error.message:t('sketchStorageFailed')) } finally {setBusy(false)} }
  const runFile = async operation => { if (busy || agentRun.current?.locked || active.current) return;setBusy(true);setError('');try {await operation()} catch(error) {setError(error.code?.startsWith('SKETCH_')?error.message:t('sketchStorageFailed'))} finally {setBusy(false)} }
  useEffect(()=>{if(open && hydrated && !busy && !agentLocked && incoming && incoming!==received.current){received.current=incoming;void runFile(()=>importImage(incoming.file))}},[open,incoming,agentLocked,hydrated,busy])
  const keyDown = event => {
    if (event.target.closest('input,textarea,select,[contenteditable=true]') || event.isComposing || busy || active.current) return
    if(!navigation.shortcuts)return
    if(navigation.keyDown(event))return
    if(agentRun.current?.locked)return
    if(selection && ['Delete','Backspace'].includes(event.key)){event.preventDefault();editObject({},'delete');return}
    const key = event.key.toLowerCase(), command = event.ctrlKey || event.metaKey
    if (command && ['z','y','s'].includes(key)) { event.preventDefault();event.stopPropagation();if(key==='s')void runFile(()=>save());else history(key==='y'||event.shiftKey?'redo':'undo');return }
    if (command || event.altKey) return
    const action=sketchShortcutAction(navigation.keys,key)
    if (['pen','eraser','line','rectangle','circle','select','text'].includes(action)) {event.preventDefault();chooseTool(action)}
    if (key==='[' || key===']') {event.preventDefault();const value=stepSketchWidth(selected?.width??width,key===']'?1:-1);if(selected)editObject({width:value});else setWidth(value)}
  }
  const current = doc.current.layers.find(layer => layer.id === doc.current.active)
  const move = (event, bounds) => {
    if(navigation.move(event))return
    const gesture = active.current
    if (!gesture || gesture.id !== event.pointerId || busy) return
    const rect = bounds ?? canvas.current.getBoundingClientRect()
    if(gesture.object){
      const point=sketchPoint(event.clientX,event.clientY,rect);if(!point)return
      try{const box=objectBounds(gesture.object);const stroke=gesture.handle==='end'?{...gesture.object,points:[gesture.object.points[0],point]}:gesture.handle==='size'?transformObject(gesture.object,{scaleX:Math.max(.001,point.x-box.x)/Math.max(.001,box.width),scaleY:Math.max(.001,point.y-box.y)/Math.max(.001,box.height)}):transformObject(gesture.object,{dx:point.x-gesture.start.x,dy:point.y-gesture.start.y});doc.current={...doc.current,layers:doc.current.layers.map(l=>l.id===gesture.layer?{...l,strokes:l.strokes.map(s=>s.id===gesture.object.id?stroke:s)}:l)};schedule()}catch{}
      return
    }
    const native = event.nativeEvent ?? event
    const events = native.getCoalescedEvents?.() ?? []
    for (const sample of events.length ? [...events, native] : [native]) {
      let point = sketchPoint(sample.clientX, sample.clientY, rect); if (!point) continue
      const layer = doc.current.layers.find(layer => layer.id === gesture.layer)
      if (gesture.eraseStroke) {
        const previous = gesture.last ?? point
        const steps = Math.min(256, Math.max(1, Math.ceil(Math.hypot(point.x-previous.x,point.y-previous.y)*SKETCH_SIZE/Math.max(2,width/2))))
        layer.strokes = layer.strokes.filter(stroke => { for(let i=1;i<=steps;i++) {const p={x:previous.x+(point.x-previous.x)*i/steps,y:previous.y+(point.y-previous.y)*i/steps};if(strokeHit(stroke,p,width/2,doc.current.width,doc.current.height))return false}return true })
      } else {
        const stroke = layer.strokes.at(-1)
        if (['line','arrow','rectangle','circle'].includes(stroke.shape)) { if (stroke.shape==='line' && event.shiftKey) { const w=doc.current.width??SKETCH_SIZE,h=doc.current.height??SKETCH_SIZE,a=stroke.points[0];const snapped=snapLine({x:a.x*w,y:a.y*h},{x:point.x*w,y:point.y*h});point={x:snapped.x/w,y:snapped.y/h} } stroke.points = [stroke.points[0], point] }
        else {
          const last = stroke.points.at(-1)
          if (Math.hypot(last.x-point.x,last.y-point.y)<0.0001) continue
          if (stroke.points.length >= MAX_STROKE_POINTS) stroke.points = stroke.points.filter((_,i)=>i%2===0)
          stroke.points.push(point)
        }
      }
      gesture.last = point
    }
    schedule(false)
  }
  const end = (event, cancel = false) => {
    if(navigation.end(event))return
    if (active.current?.id !== event.pointerId) return
    if (!cancel) {
      move(event)
      const gesture=active.current,stroke=doc.current.layers.find(layer=>layer.id===gesture.layer)?.strokes.at(-1)
      if(gesture.smoothing && stroke)stroke.points=smoothStrokePoints(stroke.points,gesture.smoothing)
    }
    const drawn=active.current
    if(!cancel && !drawn.object && ['line','arrow','rectangle','circle'].includes(tool)){const stroke=doc.current.layers.find(l=>l.id===drawn.layer)?.strokes.at(-1);if(stroke){setSelection({layer:drawn.layer,id:stroke.id});chooseTool('select')}}
    active.current = null
    if (canvas.current.hasPointerCapture(event.pointerId)) canvas.current.releasePointerCapture(event.pointerId)
    if (cancel) { doc.current = undo.current.pop() ?? doc.current }
    schedule()
  }
  const history = direction => { if (busy || agentRun.current?.locked || active.current) return; const source = direction === 'undo' ? undo : redo, target = direction === 'undo' ? redo : undo; if (!source.current.length) return; documentRevision.current++;dirty.current = true; target.current.push(doc.current); doc.current = source.current.pop(); schedule() }
  Object.assign(agentAdapter.current,{
    changed:state=>{setAgentState(state);setNoticeHidden(false)},
    available:()=>enabled && agentEnabled,
    previewEnabled:()=>agentPreview,
    open:()=>onOpen(),
    busy:()=>busy || Boolean(active.current) || Boolean(textEdit) || sizeGesture.current,
    document:()=>doc.current,
    snapshot:()=>({documentId:documentId.current,revision:documentRevision.current,width:doc.current.width??SKETCH_SIZE,height:doc.current.height??SKETCH_SIZE,active:doc.current.active,layers:doc.current.layers.map(layer=>({id:layer.id,name:layer.name,visible:layer.visible,strokes:layer.strokes.length,image:Boolean(layer.image)})),strokeCount:strokeCount(doc.current)}),
    objects:()=>sketchObjectSummary(doc.current),
    object:(id,layer=doc.current.active)=>{const target=doc.current.layers.find(l=>l.id===layer)?.strokes.find((s,i)=>objectId(s,i)===id);if(!target)throw Error('Object not found');return {...target,id}},
    commit:next=>{checkpoint();doc.current=next;setError('');schedule()},
    preview:async()=>{paint();return canvas.current.toDataURL('image/png')},
    save:save,
  })
  agentSession.current??=createSketchCommandSession(agentAdapter.current)
  agentRun.current??=createSketchAgentRun({execute:request=>agentSession.current(request),open:()=>agentAdapter.current.open(),changed:state=>agentAdapter.current.changed?.(state),busy:()=>agentAdapter.current.busy(),previewEnabled:()=>agentAdapter.current.previewEnabled()})
  useEffect(()=>{
    if(!enabled||!agentEnabled||!hydrated)return
    const api=Object.freeze({version:2,sessionId,execute:request=>agentRun.current.execute(request),export:async format=>{
      if(agentAdapter.current.busy() || agentRun.current.locked)throw Error('Sketch is being edited')
      const {blob,extension}=await agentAdapter.current.export(format)
      const data=new Uint8Array(await blob.arrayBuffer());let raw='';for(let i=0;i<data.length;i+=8192)raw+=String.fromCharCode(...data.subarray(i,i+8192))
      return {extension,mediaType:blob.type,base64:btoa(raw)}
    }})
    window.dshSketchAgent=api
    return ()=>{if(window.dshSketchAgent===api)delete window.dshSketchAgent}
  },[enabled,agentEnabled,rpc,sessionId,hydrated])
  useEffect(()=>{
    if(!enabled || !agentEnabled){if(agentRun.current.locked)agentRun.current.stop();return}
    if(!rpc || !sessionId || !hydrated)return
    let live=true
    const disconnect=connectSketchAgent(rpc,sessionId,request=>{if(!live)throw Error('Sketch session disconnected');return agentRun.current.execute(request)},message=>{agentRun.current.fail();setError(message)},()=>agentRun.current.locked?350:2000)
    return ()=>{live=false;disconnect()}
  },[enabled,agentEnabled,rpc,sessionId,hydrated])
  const attach = async () => { if (!enabled || busy || agentRun.current?.locked) return; setBusy(true);setError('');try { paint(); const blob = await new Promise((resolve,reject)=>canvas.current.toBlob(blob=>blob?resolve(blob):reject(Error('PNG')),'image/png')); await saveChanges(); await attachSketch(blob); onClose() } catch(error) { setError(error.code?.startsWith('SKETCH_')?error.message:t('sketchFailed')) } finally { setBusy(false) } }
  const exportFile = async (format='png') => {
    paint()
    if(format==='draft')return {blob:new Blob([encodeSketchDocument(doc.current)],{type:'application/json'}),extension:'dsh-sketch.json'}
    if(format==='psd')return {blob:new Blob([await exportSketchPsd(doc.current,images.current,canvas.current)],{type:'image/vnd.adobe.photoshop'}),extension:'psd'}
    if(format!=='png')throw Error('Unsupported format')
    return {blob:await new Promise((resolve,reject)=>canvas.current.toBlob(blob=>blob?resolve(blob):reject(Error('PNG')),'image/png')),extension:'png'}
  }
  agentAdapter.current.export=exportFile
  const download = async format => {
    setError('')
    const {blob,extension}=await exportFile(format)
    const url=URL.createObjectURL(blob),link=document.createElement('a')
    link.href=url;link.download=`${(saved.current?.name||'sketch').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').slice(0,80)}.${extension}`
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10_000)
  }
  return <>
    {enabled && agentEnabled && !open && !noticeHidden?<SketchRunStatus state={agentState} floating t={t} onOpen={onOpen} onStop={()=>agentRun.current.stop()} onResume={()=>{setError('');agentRun.current.resume()}} onDismiss={()=>setNoticeHidden(true)}/>:null}
    <dialog ref={dialog} className="codexSketchDialog codexSketchStudio codexLayerStudio" aria-label={t('sketchTitle')} onKeyDown={keyDown} onKeyUp={navigation.keyUp} onPaste={event=>{if(agentRun.current?.locked){event.preventDefault();event.stopPropagation();return}if(event.target.closest('input,textarea'))return;const file=Array.from(event.clipboardData.items).find(item=>item.type.startsWith('image/'))?.getAsFile();if(file){event.preventDefault();event.stopPropagation();void runFile(()=>importImage(file))}}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();event.stopPropagation();const file=event.dataTransfer.files[0];if(file)void runFile(()=>importImage(file))}} onCancel={event=>{event.preventDefault();close()}}>
    <div ref={cursorRing} hidden className="codexSketchCursor" aria-hidden="true"/>
    <header className="codexSketchTop">
      <button className="codexSketchRound" type="button" aria-label={t('sketchCancel')} title={t('sketchCancel')} disabled={busy&&hydrated&&!agentLocked} onClick={close}><WorkspaceIcon name="close" /></button>
      <SketchFiles save={save} load={load} fresh={fresh} importImage={importImage} download={download} hasContent={doc.current.layers.some(l=>l.visible&&(l.image||l.strokes.length))} disabled={agentLocked||busy} t={t} report={setError} onWorking={setBusy} />
      <div className="codexSketchHeading"><strong>{t('sketchTitle')}</strong><span>Beta</span></div>
    <div className="codexSketchUtility">
      <div className="codexSketchHistory">{['undo','redo'].map(name=><button key={name} type="button" className="codexSketchRound" aria-label={t(name==='undo'?'sketchUndo':'sketchRedo')} title={t(name==='undo'?'sketchUndo':'sketchRedo')} disabled={agentLocked||busy||!(name==='undo'?undo:redo).current.length} onClick={()=>history(name)}><WorkspaceIcon name={name} size={20}/></button>)}</div>
      <select className="codexSketchRatio" aria-label={t('sketchRatio')} title={t('sketchRatioHint')} value={doc.current.ratio ?? '1:1'} disabled={agentLocked||busy} onChange={event=>{if(active.current||agentRun.current?.locked)return;const next=resizeSketch(doc.current,event.target.value);if(next===doc.current)return;checkpoint();doc.current=next;schedule()}}>{doc.current.ratio==='custom'?<option value="custom" disabled>{doc.current.width}×{doc.current.height}</option>:null}{Object.keys(SKETCH_RATIOS).map(ratio=><option key={ratio} value={ratio}>{ratio}</option>)}</select>
      <button type="button" className="codexSketchLayersToggle" aria-label={t('sketchLayers')} aria-expanded={layersOpen} onClick={()=>setLayersOpen(v=>!v)}><WorkspaceIcon name="layers" size={18}/>{t('sketchLayers')}<span>{doc.current.layers.length}</span></button>
    </div>
      <button type="button" className="codexSketchConfirm" aria-label={t('sketchAttach')} disabled={agentLocked||busy||!enabled||!doc.current.layers.some(l=>l.visible&&(l.strokes.length||l.image))} onClick={()=>void attach()}><WorkspaceIcon name="check" size={18}/><span>{t('sketchAttachShort')}</span></button>
    </header>
    {enabled && agentEnabled && !noticeHidden?<SketchRunStatus state={agentState} t={t} onStop={()=>agentRun.current.stop()} onResume={()=>{setError('');agentRun.current.resume()}} onDismiss={()=>setNoticeHidden(true)}/>:null}
    {recovered?<div className="codexSketchAgentStatus" role="status">{t('sketchRecovered')}<button type="button" onClick={()=>setRecovered(false)} aria-label={t('sketchDismissStatus')}><WorkspaceIcon name="close" size={14}/></button></div>:null}
    <div className={`codexLayerBody ${layersOpen?'withLayers':''}`}>
      <canvas tabIndex={0} style={{transform:`translate(${navigation.view.x}px,${navigation.view.y}px) scale(${navigation.view.scale})`,cursor:navigation.space?'grab':agentLocked?'default':tool==='select'?'default':tool==='text'?'text':'none','--sketch-ratio':(doc.current.width ?? SKETCH_SIZE)/(doc.current.height ?? SKETCH_SIZE)}} ref={canvas} width={SKETCH_SIZE} height={SKETCH_SIZE} aria-label={t('sketchTitle')} onPointerDown={event=>{
        if (busy || !enabled || active.current) return
        if(navigation.down(event))return
        if(agentRun.current?.locked)return
        if(event.button!==0)return
        const point=sketchPoint(event.clientX,event.clientY,canvas.current.getBoundingClientRect());if(!point)return
        if(tool==='text'){setTextEdit({point,value:''});return}
        if(tool==='select'){
          doc.current=identifyObjects(doc.current)
          if(selected){const b=objectBounds(selected),end=['line','arrow'].includes(selected.shape)?selected.points.at(-1):{x:b.x+b.width,y:b.y+b.height},rect=canvas.current.getBoundingClientRect();if(Math.hypot((end.x-point.x)*rect.width,(end.y-point.y)*rect.height)<12){checkpoint();active.current={id:event.pointerId,layer:selection.layer,object:{...selected,id:selection.id},start:point,handle:['line','arrow'].includes(selected.shape)?'end':'size'};canvas.current.setPointerCapture(event.pointerId);return}}
          let hit
          for(const l of doc.current.layers.slice().reverse()){if(!l.visible)continue;const stroke=l.strokes.slice().reverse().find(s=>s.shape!=='eraser'&&strokeHit(s,point,6,doc.current.width,doc.current.height));if(stroke){hit={layer:l.id,stroke};break}}
          setSelection(hit?{layer:hit.layer,id:hit.stroke.id}:null)
          if(hit){checkpoint();active.current={id:event.pointerId,layer:hit.layer,object:hit.stroke,start:point};canvas.current.setPointerCapture(event.pointerId)}
          return
        }
        setSelection(null)
        cursor.down(event)
        if (!current.visible) {setError(t('sketchHiddenLayer'));return}
        if (!(tool==='eraser'&&eraser==='stroke') && strokeCount(doc.current)>=MAX_SKETCH_STROKES) {setError(t('sketchLimit'));return}
        if(tool!=='eraser' && doc.current.layers.reduce((n,l)=>n+l.strokes.reduce((m,s)=>m+s.points.length,0),0)>=MAX_SKETCH_POINTS){setError(t('sketchLimit'));return}
        const start=sketchPoint(event.clientX,event.clientY,canvas.current.getBoundingClientRect());if(!start)return
        checkpoint(); const layers=doc.current.layers.map(layer=>layer.id===doc.current.active?{...layer,strokes:layer.strokes.slice()}:layer);doc.current={...doc.current,layers}
        const layer=layers.find(layer=>layer.id===doc.current.active);const eraseStroke=tool==='eraser'&&eraser==='stroke'
        if(!eraseStroke)layer.strokes.push({id:crypto.randomUUID(),color,opacity:flow/100,shape:tool,width,fill:fillShape&&['rectangle','circle'].includes(tool),brush:tool==='pen'?brush:'pen',...(tool==='pen'?{brushVersion:2}:{}),pressure:event.pointerType==='pen'?Math.max(.2,event.pressure):1,points:[start]})
        active.current={id:event.pointerId,layer:layer.id,eraseStroke,last:start,smoothing:tool==='pen'?stability:0};canvas.current.setPointerCapture(event.pointerId);setError('');move(event);schedule()
      }} onPointerMove={event=>{const rect=canvas.current.getBoundingClientRect();move(event,rect);cursor.move(event,rect)}} onPointerEnter={cursor.move} onPointerLeave={cursor.leave} onPointerUp={event=>end(event)} onPointerCancel={event=>end(event,true)} />
      {selected && tool==='select' && !agentLocked?<svg className="codexSketchSelection" viewBox="0 0 1 1" preserveAspectRatio="none" style={{'--sketch-ratio':(doc.current.width??1024)/(doc.current.height??1024),transform:`translate(${navigation.view.x}px,${navigation.view.y}px) scale(${navigation.view.scale})`}} aria-hidden="true"><rect {...objectBounds(selected)} fill="none" stroke="#0088ff" strokeWidth=".002" strokeDasharray=".008 .005"/><circle cx={['line','arrow'].includes(selected.shape)?selected.points.at(-1).x:objectBounds(selected).x+objectBounds(selected).width} cy={['line','arrow'].includes(selected.shape)?selected.points.at(-1).y:objectBounds(selected).y+objectBounds(selected).height} r=".007" fill="white" stroke="#0088ff" strokeWidth=".002"/></svg>:null}
      <SketchSizeControl label={t(opacityMode?'sketchFlow':selected?.shape==='text'||tool==='text'?'sketchTextSize':'sketchWidth')} mode={opacityMode?'opacity':'size'} modes={showOpacity?[{value:'size',label:t(selected?.shape==='text'||tool==='text'?'sketchTextSize':'sketchSizeShort')},{value:'opacity',label:t('sketchFlow')}]:undefined} onModeChange={setSizeMode} min={opacityMode?5:1} max={opacityMode?100:256} suffix={opacityMode?'%':''} value={opacityMode?(selected?.opacity??flow/100)*100:selected?.width??width} disabled={agentLocked||busy} onStart={()=>{if(selected){checkpoint();sizeGesture.current=true}}} onEnd={()=>{sizeGesture.current=false}} onChange={value=>{if(opacityMode){if(selected)editObject({opacity:value/100});else setFlow(value)}else{if(selected)editObject({width:value});else setWidth(value)}}}/>

      {textEdit?<form className="codexSketchTextEditor" onSubmit={event=>{event.preventDefault();if(!textEdit.value.trim()){setTextEdit(null);return}try{if(textEdit.selection){editObject({text:textEdit.value})}else{const a=textEdit.point,b={x:Math.min(1,a.x+.35),y:Math.min(1,a.y+.15)},id=crypto.randomUUID();const next=applySketchCommands(doc.current,[{op:'stroke',id,shape:'text',text:textEdit.value,color,width:Math.max(24,width),points:[a,b]}]);checkpoint();doc.current=next;setSelection({layer:doc.current.active,id});schedule()}setTextEdit(null);chooseTool('select')}catch(e){setError(e.message)}}}><textarea autoFocus aria-label={t('sketchText')} maxLength={500} value={textEdit.value} onChange={e=>setTextEdit({...textEdit,value:e.target.value})}/><button type="submit">{t('sketchTextDone')}</button><button type="button" onClick={()=>setTextEdit(null)}>{t('sketchCancel')}</button></form>:null}
      {picturesOpen?<aside className="codexSketchPictures"><header><strong>{t('sketchPictures')}</strong><button type="button" disabled={agentLocked||busy} onClick={()=>pictureInput.current.click()}>{t('sketchPictureAdd')}</button></header><input ref={pictureInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void runFile(()=>importImage(file))}}/>{doc.current.layers.filter(layer=>layer.image).map(layer=><div key={layer.id} data-active={layer.id===doc.current.active}><button type="button" disabled={agentLocked||busy} aria-label={`${t('sketchPictureSelect')} ${layer.name}`} onClick={()=>change('select',layer.id)}><img src={layer.image.src} alt={layer.name}/></button><button type="button" disabled={agentLocked||busy} aria-label={`${t('sketchDeleteDraft')} ${layer.name}`} onClick={()=>change(doc.current.layers.length===1?'clear':'delete',layer.id)}>×</button></div>)}{!doc.current.layers.some(layer=>layer.image)?<small>{t('sketchPicturesEmpty')}</small>:null}</aside>:null}
      {layersOpen?<aside className="codexSketchLayers" aria-label={t('sketchLayers')}>
        <header><strong>{t('sketchLayers')}</strong><button type="button" title={t('sketchLayerAdd')} aria-label={t('sketchLayerAdd')} disabled={agentLocked||busy||doc.current.layers.length>=MAX_SKETCH_LAYERS} onClick={()=>change('add')}>＋</button></header>
        <div className="codexLayerList">{doc.current.layers.slice().reverse().map(layer=><div key={layer.id} className="codexLayerRow" data-active={layer.id===doc.current.active}>
          <button type="button" disabled={agentLocked||busy} aria-label={`${t('sketchLayerVisible')} ${layer.id}`} aria-pressed={layer.visible} onClick={()=>change('visible',layer.id)}><WorkspaceIcon name={layer.visible?'eye':'eyeOff'} size={18}/></button>
          <button type="button" disabled={agentLocked||busy} aria-pressed={layer.id===doc.current.active} onClick={()=>change('select',layer.id)}>{layer.name||`${t('sketchLayer')} ${layer.id}`}</button>
        </div>)}</div>
        <label className="codexSketchLayerLabel">{t('sketchLayerName')}</label>
        <input key={current.id+'-'+current.name} disabled={agentLocked||busy} aria-label={t('sketchLayerName')} defaultValue={current.name} placeholder={`${t('sketchLayer')} ${current.id}`} maxLength={40} onBlur={e=>{if(e.target.value!==current.name)change('rename',current.id,e.target.value)}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} />
        <div className="codexLayerActions">{['duplicate','up','down','delete'].map(action=><button type="button" key={action} title={t(`sketchLayer_${action}`)} aria-label={t(`sketchLayer_${action}`)} disabled={agentLocked||busy||(action==='delete'&&doc.current.layers.length===1)||(action==='duplicate'&&(doc.current.layers.length>=MAX_SKETCH_LAYERS||strokeCount(doc.current)+current.strokes.length>MAX_SKETCH_STROKES))||(action==='up'&&current===doc.current.layers.at(-1))||(action==='down'&&current===doc.current.layers[0])} onClick={()=>change(action)}><WorkspaceIcon name={action==='delete'?'clear':action} size={17}/><span>{t(`sketchLayer_${action}`)}</span></button>)}</div>
        <button type="button" className="codexSketchClearLayer" disabled={agentLocked||busy||(!current.strokes.length&&!current.image)} onClick={()=>change('clear')}><WorkspaceIcon name="clear" size={16}/>{t('sketchClearLayer')}</button>
      </aside>:null}
    </div>
    <div className="codexSketchControls">
      <button type="button" className="codexSketchPicturesToggle" aria-expanded={picturesOpen} onClick={()=>setPicturesOpen(v=>!v)}>{t('sketchPictures')}</button>
      <SketchViewControls navigation={navigation} t={t}/>
      <div className="codexSketchPill" role="toolbar" aria-label={t('sketchTitle')} title={t('sketchShortcuts')}>
        {['select','pen','pencil','marker','text','eraser'].map(name=>{
          const drawing=['pen','pencil','marker'].includes(name)
          const label=t(drawing?`sketchBrush_${name}`:`sketchTool_${name}`)
          return <button type="button" key={name} aria-label={label} title={drawing?`${label} · ${t(`sketchBrushHint_${name}`)}`:label} aria-pressed={drawing?tool==='pen'&&brush===name:tool===name} disabled={agentLocked||busy} onClick={()=>{if(drawing)chooseBrush(name);else chooseTool(name)}}><WorkspaceIcon name={name} size={23}/><span>{label}</span></button>
        })}
        <button className="codexSketchShapeToggle" type="button" aria-label={t('sketchShapes')} aria-expanded={shapesOpen} aria-pressed={['line','arrow','rectangle','circle'].includes(tool)} disabled={agentLocked||busy} onClick={()=>setShapesOpen(v=>!v)}><WorkspaceIcon name={['line','arrow','rectangle','circle'].includes(tool)?tool:'rectangle'} size={23}/><span>{t(['line','arrow','rectangle','circle'].includes(tool)?`sketchTool_${tool}`:'sketchShapes')}</span></button>
        {shapesOpen?<div className="codexSketchShapeMenu">{['line','arrow','rectangle','circle'].map(name=><button key={name} type="button" aria-pressed={tool===name} onClick={()=>{chooseTool(name);setShapesOpen(false)}}>{t(`sketchTool_${name}`)}</button>)}</div>:null}
      </div>
      <div className="codexLayerBrush">
        {['rectangle','circle'].includes(tool)?<label><input type="checkbox" disabled={agentLocked||busy} checked={fillShape} onChange={e=>setFillShape(e.target.checked)}/>{t('sketchFill')}</label>:null}
        {selected?<div className="codexSketchObjectActions"><button disabled={agentLocked||busy} onClick={()=>editObject({},'duplicate')}>{t('sketchObjectDuplicate')}</button><button disabled={agentLocked||busy} onClick={()=>editObject({},'delete')}>{t('sketchObjectDelete')}</button>{selected.shape==='text'?<button disabled={agentLocked||busy} onClick={()=>setTextEdit({selection,value:selected.text})}>{t('sketchText')}</button>:null}</div>:null}
        {tool==='pen'?<label className="codexSketchStability">{t('sketchStability')}<select aria-label={t('sketchStability')} value={stability} disabled={agentLocked||busy} onChange={e=>setStability(Number(e.target.value))}>{[0,25,50,75].map(value=><option key={value} value={value}>{t(`sketchStability${value}`)}</option>)}</select></label>:null}
        {tool==='eraser'?<div className="codexSketchSegment" role="group" aria-label={t('sketchEraserMode')}>{['pixel','stroke'].map(value=><button key={value} type="button" aria-pressed={eraser===value} disabled={agentLocked||busy} onClick={()=>setEraser(value)}>{t(`sketchErase_${value}`)}</button>)}</div>:null}

      </div>
      <div className="codexSketchPalette" role="group" aria-label={t('sketchColor')}>
        {PALETTE.map(value=><button type="button" key={value} className="codexSketchSwatch" style={{'--swatch':value}} aria-label={`${t('sketchColor')} ${value}`} aria-pressed={(selected?.color??color)===value} disabled={agentLocked||busy} onClick={()=>pickColor(value)}/>)}
        <label className="codexSketchCustom" title={t('sketchColor')}><span style={{background:color}}/><input type="color" aria-label={t('sketchColor')} value={color} disabled={agentLocked||busy} onChange={e=>pickColor(e.target.value)}/></label>
      </div>
    </div>{error ? <p className="codexSketchHint" role="alert">{error}{!hydrated?<button type="button" onClick={()=>retryRestore(value=>value+1)}>{t('accountRetry')}</button>:null}</p> : null}
  </dialog></>
}
