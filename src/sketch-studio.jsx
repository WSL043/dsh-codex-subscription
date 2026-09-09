import { useEffect, useRef, useState } from 'react'
import { SKETCH_SIZE, MAX_SKETCH_STROKES, MAX_STROKE_POINTS, sketchPoint } from './sketch-document.js'
import { createSketchLayers, changeSketchLayer, strokeCount, strokeHit, MAX_SKETCH_LAYERS, SKETCH_RATIOS, resizeSketch } from './sketch-layers.js'
import { paintSketchLayers } from './sketch-layer-renderer.js'
import { WorkspaceIcon } from './workspace-icons.jsx'
const PALETTE = ['#18181b','#929398','#ff3936','#ff9500','#ffcc00','#34c759','#0088ff']
export function SketchStudio({ open, onClose, attachSketch, enabled, t }) {
  const dialog = useRef(null), canvas = useRef(null), doc = useRef(createSketchLayers()), cache = useRef(new Map())
  const undo = useRef([]), redo = useRef([]), active = useRef(null), frame = useRef(null)
  const [revision, redraw] = useState(0), [tool, setTool] = useState('pen'), [brush, setBrush] = useState('pen')
  const [eraser, setEraser] = useState('pixel'), [color, setColor] = useState('#0088ff'), [width, setWidth] = useState(12)
  const [layersOpen, setLayersOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const paint = () => { if (!canvas.current) return; const w = doc.current.width ?? SKETCH_SIZE, h = doc.current.height ?? SKETCH_SIZE; if (canvas.current.width !== w) canvas.current.width = w; if (canvas.current.height !== h) canvas.current.height = h; paintSketchLayers(canvas.current.getContext('2d'), doc.current, cache.current) }
  const schedule = () => { if (frame.current !== null) return; frame.current = requestAnimationFrame(() => { frame.current = null; paint(); redraw(value => value + 1) }) }
  const checkpoint = () => { undo.current.push(doc.current); if (undo.current.length > 30) undo.current.shift(); redo.current = [] }
  const change = (action, id, value) => { if (busy || active.current) return; const next = changeSketchLayer(doc.current, action, id, value); if (next === doc.current) return; if (action !== 'select') checkpoint(); doc.current = next; setError(''); schedule() }
  useEffect(() => { if (open) { dialog.current.showModal(); paint() } else dialog.current?.close() }, [open])
  useEffect(() => () => { cancelAnimationFrame(frame.current); cache.current.clear() }, [])
  const close = () => { if (busy) return; active.current = null; onClose() }
  const current = doc.current.layers.find(layer => layer.id === doc.current.active)
  const move = event => {
    const gesture = active.current
    if (!gesture || gesture.id !== event.pointerId || busy) return
    const rect = canvas.current.getBoundingClientRect()
    const native = event.nativeEvent ?? event
    const events = native.getCoalescedEvents?.() ?? []
    for (const sample of events.length ? [...events, native] : [native]) {
      const point = sketchPoint(sample.clientX, sample.clientY, rect); if (!point) continue
      const layer = doc.current.layers.find(layer => layer.id === gesture.layer)
      if (gesture.eraseStroke) {
        const previous = gesture.last ?? point
        const steps = Math.min(256, Math.max(1, Math.ceil(Math.hypot(point.x-previous.x,point.y-previous.y)*SKETCH_SIZE/Math.max(2,width/2))))
        layer.strokes = layer.strokes.filter(stroke => !Array.from({length:steps},(_,i)=>({x:previous.x+(point.x-previous.x)*(i+1)/steps,y:previous.y+(point.y-previous.y)*(i+1)/steps})).some(p=>strokeHit(stroke,p,width/2,doc.current.width,doc.current.height)))
      } else {
        const stroke = layer.strokes.at(-1)
        if (['rectangle','circle'].includes(stroke.shape)) stroke.points = [stroke.points[0], point]
        else {
          const last = stroke.points.at(-1)
          if (Math.hypot(last.x-point.x,last.y-point.y)<0.0001) continue
          if (stroke.points.length >= MAX_STROKE_POINTS) stroke.points = stroke.points.filter((_,i)=>i%2===0)
          stroke.points.push(point)
        }
      }
      gesture.last = point
    }
    schedule()
  }
  const end = (event, cancel = false) => {
    if (active.current?.id !== event.pointerId) return
    if (!cancel) move(event)
    active.current = null
    if (canvas.current.hasPointerCapture(event.pointerId)) canvas.current.releasePointerCapture(event.pointerId)
    if (cancel) { doc.current = undo.current.pop() ?? doc.current }
    schedule()
  }
  const history = direction => { if (busy || active.current) return; const source = direction === 'undo' ? undo : redo, target = direction === 'undo' ? redo : undo; if (!source.current.length) return; target.current.push(doc.current); doc.current = source.current.pop(); schedule() }
  const attach = async () => { if (!enabled || busy) return; setBusy(true);setError('');try { paint(); const blob = await new Promise((resolve,reject)=>canvas.current.toBlob(blob=>blob?resolve(blob):reject(Error('PNG')),'image/png')); await attachSketch(blob); onClose() } catch { setError(t('sketchFailed')) } finally { setBusy(false) } }
  return <dialog ref={dialog} className="codexSketchDialog codexSketchStudio codexLayerStudio" aria-label={t('sketchTitle')} onCancel={event=>{event.preventDefault();close()}}>
    <header className="codexSketchTop">
      <button className="codexSketchRound" type="button" aria-label={t('sketchCancel')} title={t('sketchCancel')} disabled={busy} onClick={close}><WorkspaceIcon name="close" /></button>
      <div className="codexSketchHeading"><strong>{t('sketchTitle')}</strong><span>Beta</span></div>
    <div className="codexSketchUtility">
      <div className="codexSketchHistory">{['undo','redo'].map(name=><button key={name} type="button" className="codexSketchRound" aria-label={t(name==='undo'?'sketchUndo':'sketchRedo')} title={t(name==='undo'?'sketchUndo':'sketchRedo')} disabled={busy||!(name==='undo'?undo:redo).current.length} onClick={()=>history(name)}><WorkspaceIcon name={name} size={20}/></button>)}</div>
      <select className="codexSketchRatio" aria-label={t('sketchRatio')} title={t('sketchRatioHint')} value={doc.current.ratio ?? '1:1'} disabled={busy} onChange={event=>{if(active.current)return;const next=resizeSketch(doc.current,event.target.value);if(next===doc.current)return;checkpoint();doc.current=next;schedule()}}>{Object.keys(SKETCH_RATIOS).map(ratio=><option key={ratio} value={ratio}>{ratio}</option>)}</select>
      <button type="button" className="codexSketchLayersToggle" aria-label={t('sketchLayers')} aria-expanded={layersOpen} onClick={()=>setLayersOpen(v=>!v)}><WorkspaceIcon name="layers" size={18}/>{t('sketchLayers')}<span>{doc.current.layers.length}</span></button>
    </div>
      <button type="button" className="codexSketchConfirm" aria-label={t('sketchAttach')} disabled={busy||!enabled||!doc.current.layers.some(l=>l.visible&&l.strokes.length)} onClick={()=>void attach()}><WorkspaceIcon name="check" size={18}/><span>{t('sketchAttach')}</span></button>
    </header>
    <div className={`codexLayerBody ${layersOpen?'withLayers':''}`}>
      <canvas style={{'--sketch-ratio':(doc.current.width ?? SKETCH_SIZE)/(doc.current.height ?? SKETCH_SIZE)}} ref={canvas} width={SKETCH_SIZE} height={SKETCH_SIZE} aria-label={t('sketchTitle')} onPointerDown={event=>{
        if (busy || !enabled || event.button!==0 || active.current) return
        if (!current.visible) {setError(t('sketchHiddenLayer'));return}
        if (!(tool==='eraser'&&eraser==='stroke') && strokeCount(doc.current)>=MAX_SKETCH_STROKES) {setError(t('sketchLimit'));return}
        const start=sketchPoint(event.clientX,event.clientY,canvas.current.getBoundingClientRect());if(!start)return
        checkpoint(); const layers=doc.current.layers.map(layer=>layer.id===doc.current.active?{...layer,strokes:layer.strokes.slice()}:layer);doc.current={...doc.current,layers}
        const layer=layers.find(layer=>layer.id===doc.current.active);const eraseStroke=tool==='eraser'&&eraser==='stroke'
        if(!eraseStroke)layer.strokes.push({color,shape:tool,width,brush:tool==='pen'?brush:'pen',pressure:event.pointerType==='pen'?Math.max(.2,event.pressure):1,points:[start]})
        active.current={id:event.pointerId,layer:layer.id,eraseStroke,last:start};canvas.current.setPointerCapture(event.pointerId);setError('');move(event);schedule()
      }} onPointerMove={move} onPointerUp={event=>end(event)} onPointerCancel={event=>end(event,true)} />
      {layersOpen?<aside className="codexSketchLayers" aria-label={t('sketchLayers')}>
        <header><strong>{t('sketchLayers')}</strong><button type="button" title={t('sketchLayerAdd')} aria-label={t('sketchLayerAdd')} disabled={busy||doc.current.layers.length>=MAX_SKETCH_LAYERS} onClick={()=>change('add')}>＋</button></header>
        <div className="codexLayerList">{doc.current.layers.slice().reverse().map(layer=><div key={layer.id} className="codexLayerRow" data-active={layer.id===doc.current.active}>
          <button type="button" aria-label={`${t('sketchLayerVisible')} ${layer.id}`} aria-pressed={layer.visible} onClick={()=>change('visible',layer.id)}><WorkspaceIcon name={layer.visible?'eye':'eyeOff'} size={18}/></button>
          <button type="button" aria-pressed={layer.id===doc.current.active} onClick={()=>change('select',layer.id)}>{layer.name||`${t('sketchLayer')} ${layer.id}`}</button>
        </div>)}</div>
        <label className="codexSketchLayerLabel">{t('sketchLayerName')}</label>
        <input key={current.id+'-'+current.name} aria-label={t('sketchLayerName')} defaultValue={current.name} placeholder={`${t('sketchLayer')} ${current.id}`} maxLength={40} onBlur={e=>{if(e.target.value!==current.name)change('rename',current.id,e.target.value)}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} />
        <div className="codexLayerActions">{['duplicate','up','down','delete'].map(action=><button type="button" key={action} title={t(`sketchLayer_${action}`)} aria-label={t(`sketchLayer_${action}`)} disabled={busy||(action==='delete'&&doc.current.layers.length===1)||(action==='duplicate'&&(doc.current.layers.length>=MAX_SKETCH_LAYERS||strokeCount(doc.current)+current.strokes.length>MAX_SKETCH_STROKES))||(action==='up'&&current===doc.current.layers.at(-1))||(action==='down'&&current===doc.current.layers[0])} onClick={()=>change(action)}><WorkspaceIcon name={action==='delete'?'clear':action} size={17}/><span>{t(`sketchLayer_${action}`)}</span></button>)}</div>
        <button type="button" className="codexSketchClearLayer" disabled={busy||!current.strokes.length} onClick={()=>change('clear')}><WorkspaceIcon name="clear" size={16}/>{t('sketchClearLayer')}</button>
      </aside>:null}
    </div>
    <div className="codexSketchControls">
      <div className="codexSketchPill" role="toolbar" aria-label={t('sketchTitle')}>
        {['pen','pencil','marker','eraser','rectangle','circle'].map(name=>{
          const drawing=['pen','pencil','marker'].includes(name)
          const label=t(drawing?`sketchBrush_${name}`:`sketchTool_${name}`)
          return <button type="button" key={name} aria-label={label} title={label} aria-pressed={drawing?tool==='pen'&&brush===name:tool===name} disabled={busy} onClick={()=>{setTool(drawing?'pen':name);if(drawing)setBrush(name)}}><WorkspaceIcon name={name} size={23}/><span>{label}</span></button>
        })}
      </div>
      <div className="codexLayerBrush">
        {tool==='eraser'?<div className="codexSketchSegment" role="group" aria-label={t('sketchEraserMode')}>{['pixel','stroke'].map(value=><button key={value} type="button" aria-pressed={eraser===value} disabled={busy} onClick={()=>setEraser(value)}>{t(`sketchErase_${value}`)}</button>)}</div>:null}
        <label className="codexSketchWidth"><span>{t('sketchWidth')}</span><input type="range" min={2} max={64} value={width} aria-label={t('sketchWidth')} onChange={e=>setWidth(Number(e.target.value))} disabled={busy}/><output>{width}</output></label>
      </div>
      <div className="codexSketchPalette" role="group" aria-label={t('sketchColor')}>
        {PALETTE.map(value=><button type="button" key={value} className="codexSketchSwatch" style={{'--swatch':value}} aria-label={`${t('sketchColor')} ${value}`} aria-pressed={color===value} disabled={busy} onClick={()=>setColor(value)}/>)}
        <label className="codexSketchCustom" title={t('sketchColor')}><span style={{background:color}}/><input type="color" aria-label={t('sketchColor')} value={color} disabled={busy} onChange={e=>setColor(e.target.value)}/></label>
      </div>
    </div>{error ? <p className="codexSketchHint" role="alert">{error}</p> : null}
  </dialog>
}
