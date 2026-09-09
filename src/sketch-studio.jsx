import { useEffect, useRef, useState } from 'react'
import { SKETCH_SIZE, MAX_SKETCH_STROKES, MAX_STROKE_POINTS, sketchPoint } from './sketch-document.js'
import { createSketchLayers, changeSketchLayer, strokeCount, strokeHit, MAX_SKETCH_LAYERS } from './sketch-layers.js'
import { paintSketchLayers } from './sketch-layer-renderer.js'
import { WorkspaceIcon } from './workspace-icons.jsx'
const PALETTE = ['#18181b','#929398','#ff3936','#ff9500','#ffcc00','#34c759','#0088ff']
export function SketchStudio({ open, onClose, attachSketch, enabled, t }) {
  const dialog = useRef(null), canvas = useRef(null), doc = useRef(createSketchLayers()), cache = useRef(new Map())
  const undo = useRef([]), redo = useRef([]), active = useRef(null), frame = useRef(null)
  const [revision, redraw] = useState(0), [tool, setTool] = useState('pen'), [brush, setBrush] = useState('pen')
  const [eraser, setEraser] = useState('pixel'), [color, setColor] = useState('#0088ff'), [width, setWidth] = useState(12)
  const [layersOpen, setLayersOpen] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const paint = () => { if (canvas.current) paintSketchLayers(canvas.current.getContext('2d'), doc.current, cache.current) }
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
        layer.strokes = layer.strokes.filter(stroke => !Array.from({length:steps},(_,i)=>({x:previous.x+(point.x-previous.x)*(i+1)/steps,y:previous.y+(point.y-previous.y)*(i+1)/steps})).some(p=>strokeHit(stroke,p,width/2)))
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
      <button className="codexSketchRound" type="button" aria-label={t('sketchCancel')} disabled={busy} onClick={close}><WorkspaceIcon name="close" /></button>
      <div className="codexSketchPill" role="toolbar" aria-label={t('sketchTitle')}>{['pen','rectangle','circle','eraser'].map(name=><button type="button" key={name} aria-label={t(`sketchTool_${name}`)} title={t(`sketchTool_${name}`)} aria-pressed={tool===name} disabled={busy} onClick={()=>setTool(name)}><WorkspaceIcon name={name} /></button>)}</div>
      <div className="codexSketchHistory">{['undo','redo'].map(name=><button key={name} type="button" className="codexSketchRound" aria-label={t(name==='undo'?'sketchUndo':'sketchRedo')} disabled={busy||!(name==='undo'?undo:redo).current.length} onClick={()=>history(name)}><WorkspaceIcon name={name} /></button>)}</div>
    </header>
    <div className="codexLayerBrush">
      {tool==='pen'?<select aria-label={t('sketchBrushType')} value={brush} onChange={e=>setBrush(e.target.value)} disabled={busy}>{['pen','pencil','marker'].map(v=><option key={v} value={v}>{t(`sketchBrush_${v}`)}</option>)}</select>:tool==='eraser'?<select aria-label={t('sketchEraserMode')} value={eraser} onChange={e=>setEraser(e.target.value)} disabled={busy}>{['pixel','stroke'].map(v=><option key={v} value={v}>{t(`sketchErase_${v}`)}</option>)}</select>:<span>{t(`sketchTool_${tool}`)}</span>}
      <input type="range" min={2} max={64} value={width} aria-label={t('sketchWidth')} onChange={e=>setWidth(Number(e.target.value))} disabled={busy} />
      <button type="button" aria-pressed={layersOpen} onClick={()=>setLayersOpen(v=>!v)}>{t('sketchLayers')}</button>
      <button type="button" disabled={busy||!current.strokes.length} aria-label={t('sketchClearLayer')} onClick={()=>change('clear')}><WorkspaceIcon name="clear" size={18}/></button>
    </div>
    <div className={`codexLayerBody ${layersOpen?'withLayers':''}`}>
      <canvas ref={canvas} width={SKETCH_SIZE} height={SKETCH_SIZE} aria-label={t('sketchTitle')} onPointerDown={event=>{
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
        <header><strong>{t('sketchLayers')}</strong><button type="button" aria-label={t('sketchLayerAdd')} disabled={busy||doc.current.layers.length>=MAX_SKETCH_LAYERS} onClick={()=>change('add')}>＋</button></header>
        <div className="codexLayerList">{doc.current.layers.slice().reverse().map(layer=><div key={layer.id} className="codexLayerRow" data-active={layer.id===doc.current.active}>
          <button type="button" aria-label={`${t('sketchLayerVisible')} ${layer.id}`} aria-pressed={layer.visible} onClick={()=>change('visible',layer.id)}>{layer.visible?'◉':'○'}</button>
          <button type="button" aria-pressed={layer.id===doc.current.active} onClick={()=>change('select',layer.id)}>{layer.name||`${t('sketchLayer')} ${layer.id}`}</button>
        </div>)}</div>
        <input key={current.id+'-'+current.name} aria-label={t('sketchLayerName')} defaultValue={current.name} placeholder={`${t('sketchLayer')} ${current.id}`} maxLength={40} onBlur={e=>{if(e.target.value!==current.name)change('rename',current.id,e.target.value)}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} />
        <div className="codexLayerActions">{['duplicate','up','down','delete'].map(action=><button type="button" key={action} title={t(`sketchLayer_${action}`)} aria-label={t(`sketchLayer_${action}`)} disabled={busy||(action==='delete'&&doc.current.layers.length===1)||(action==='duplicate'&&(doc.current.layers.length>=MAX_SKETCH_LAYERS||strokeCount(doc.current)+current.strokes.length>MAX_SKETCH_STROKES))||(action==='up'&&current===doc.current.layers.at(-1))||(action==='down'&&current===doc.current.layers[0])} onClick={()=>change(action)}>{({duplicate:'⧉',up:'↑',down:'↓',delete:'×'})[action]}</button>)}</div>
      </aside>:null}
    </div>
    <div className="codexSketchBottom"><div className="codexSketchPalette" role="group" aria-label={t('sketchColor')}>
      <label className="codexSketchCustom"><span style={{background:color}}/><input type="color" aria-label={t('sketchColor')} value={color} onChange={e=>setColor(e.target.value)}/></label>
      {PALETTE.map(value=><button type="button" key={value} className="codexSketchSwatch" style={{'--swatch':value}} aria-label={`${t('sketchColor')} ${value}`} aria-pressed={color===value} onClick={()=>setColor(value)}/>)}</div>
      <button type="button" className="codexSketchConfirm" aria-label={t('sketchAttach')} disabled={busy||!enabled||!doc.current.layers.some(l=>l.visible&&l.strokes.length)} onClick={()=>void attach()}><WorkspaceIcon name="check" size={28}/></button>
    </div><p className="codexSketchHint" role={error?'alert':undefined}>{error||t('sketchLayerHint')}</p>
  </dialog>
}
