import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { SKETCH_SIZE, MAX_SKETCH_STROKES, MAX_STROKE_POINTS, sketchPoint, paintSketch } from './sketch-document.js'
import { WorkspaceIcon } from './workspace-icons.jsx'
export { SKETCH_CSS } from './sketch-styles.js'
const PALETTE = ['#18181b', '#929398', '#ff3936', '#ff9500', '#ffcc00', '#34c759', '#0088ff']

export function SketchWorkspace({ preference, attachSketch, appendPrompt, registerOpen, t }) {
  const settings = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const [mode, setMode] = useState(null)
  const dialog = useRef(null)
  const canvas = useRef(null)
  const strokes = useRef([])
  const redo = useRef([])
  const active = useRef(null)
  const [revision, redraw] = useState(0)
  const [color, setColor] = useState('#2563eb')
  const [width, setWidth] = useState(12)
  const [tool, setTool] = useState('pen')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [brief, setBrief] = useState('')
  const [template, setTemplate] = useState('templatePoster')
  const opener = useRef(null)
  useEffect(() => registerOpen((nextMode = 'sketch') => { opener.current = document.activeElement; setError(''); setMode(nextMode) }), [registerOpen])
  const allowed = mode === 'sketch' ? settings.imageSketch && settings.imageEditing : mode === 'image' ? settings.imageShortcut && (settings.imageGeneration || settings.imageEditing) : settings.imageTemplates && settings.imageGeneration
  const title = t(mode === 'sketch' ? 'sketchTitle' : mode === 'image' ? 'imageCreateTitle' : 'imageTemplate')
  useEffect(() => {
    if (mode && dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [mode])
  useEffect(() => {
    if (mode === 'sketch' && canvas.current) paintSketch(canvas.current.getContext('2d'), strokes.current)
  }, [mode, revision])
  const close = () => { if (busy) return; active.current = null; dialog.current?.close(); setMode(null); opener.current?.focus() }
  const open = (event, value) => { opener.current = event.currentTarget; setError(''); setMode(value) }
  const point = event => sketchPoint(event.clientX, event.clientY, canvas.current.getBoundingClientRect())
  const end = event => { if (active.current !== event.pointerId) return; active.current = null; if (canvas.current.hasPointerCapture(event.pointerId)) canvas.current.releasePointerCapture(event.pointerId) }
  const confirm = async () => {
    if (busy || !allowed) return
    setBusy(true); setError('')
    try {
      if (mode === 'sketch') {
        const blob = await new Promise((resolve, reject) => canvas.current.toBlob(value => value ? resolve(value) : reject(new Error('PNG export failed')), 'image/png'))
        await attachSketch(blob)
      } else await appendPrompt(`${t(mode === 'image' ? 'imageCreatePrompt' : `${template}Prompt`)}\n\n${brief.trim()}`, mode)
      dialog.current.close(); setMode(null); opener.current?.focus()
    } catch { setError(t(mode === 'sketch' ? 'sketchFailed' : 'imageDraftFailed')) } finally { setBusy(false) }
  }
  return <>
    {settings.imageSketch && settings.imageEditing ? <button type="button" className="codexWorkspaceLaunch" onClick={event => open(event, 'sketch')}>{t('sketch')}</button> : null}
    {settings.imageTemplates && settings.imageGeneration ? <button type="button" className="codexWorkspaceLaunch" onClick={event => open(event, 'template')}>{t('imageTemplate')}</button> : null}
    {mode ? <dialog ref={dialog} className={`codexSketchDialog ${mode === 'sketch' ? 'codexSketchStudio' : ''}`} aria-label={title} onCancel={event => { event.preventDefault(); close() }}>
      {mode !== 'sketch' ? <h2>{title}</h2> : null}
      {mode === 'sketch' ? <>
        <header className="codexSketchTop">
          <button type="button" className="codexSketchRound" aria-label={t('sketchCancel')} title={t('sketchCancel')} disabled={busy} onClick={close}><WorkspaceIcon name="close" /></button>
          <div className="codexSketchPill" role="toolbar" aria-label={t('sketchTitle')}>
            {['pen','rectangle','circle','eraser'].map(name => <button type="button" key={name} title={t(`sketchTool_${name}`)} aria-label={t(`sketchTool_${name}`)} aria-pressed={tool === name} disabled={busy} onClick={() => setTool(name)}><WorkspaceIcon name={name} /></button>)}
          </div>
          <div className="codexSketchHistory">
            <button type="button" className="codexSketchRound" title={t('sketchUndo')} aria-label={t('sketchUndo')} disabled={busy || !strokes.current.length} onClick={() => { redo.current.push(strokes.current.pop()); redraw(revision + 1) }}><WorkspaceIcon name="undo" /></button>
            <button type="button" className="codexSketchRound" title={t('sketchRedo')} aria-label={t('sketchRedo')} disabled={busy || !redo.current.length} onClick={() => { strokes.current.push(redo.current.pop()); redraw(revision + 1) }}><WorkspaceIcon name="redo" /></button>
          </div>
        </header>
        <div className="codexSketchBrush"><span style={{width:Math.max(4,width/2),height:Math.max(4,width/2),background:tool === 'eraser' ? '#929398' : color}} /><input aria-label={t('sketchWidth')} type="range" min="2" max="64" value={width} disabled={busy} onChange={event => setWidth(Number(event.target.value))} /><button type="button" aria-label={t('sketchClear')} title={t('sketchClear')} disabled={busy || !strokes.current.length} onClick={() => { strokes.current = []; redo.current = []; redraw(revision + 1) }}><WorkspaceIcon name="clear" size={19} /></button></div>
        <canvas ref={canvas} width={SKETCH_SIZE} height={SKETCH_SIZE} aria-label={t('sketchTitle')} onPointerDown={event => {
          if (busy || event.button !== 0 || active.current !== null || strokes.current.length >= MAX_SKETCH_STROKES) return
          const start = point(event); if (!start) return
          active.current = event.pointerId; canvas.current.setPointerCapture(event.pointerId)
          redo.current = []; strokes.current.push({ color: tool === 'eraser' ? '#ffffff' : color, shape: tool, width, points: [start] }); redraw(value => value + 1)
        }} onPointerMove={event => {
          if (active.current !== event.pointerId || busy) return
          const stroke = strokes.current.at(-1); if (stroke.points.length >= MAX_STROKE_POINTS) return
          const next = point(event); if (next) { if (['rectangle','circle'].includes(stroke.shape)) stroke.points = [stroke.points[0],next]; else stroke.points.push(next); redraw(value => value + 1) }
        }} onPointerUp={end} onPointerCancel={end} />
        <div className="codexSketchBottom">
          <div className="codexSketchPalette" role="group" aria-label={t('sketchColor')}>
            <label className="codexSketchCustom" title={t('sketchColor')}><span style={{background:color}} /><input aria-label={t('sketchColor')} type="color" value={color} disabled={busy} onChange={event => setColor(event.target.value)} /></label>
            {PALETTE.map(value => <button type="button" key={value} className="codexSketchSwatch" style={{'--swatch':value}} aria-label={`${t('sketchColor')} ${value}`} aria-pressed={color === value} disabled={busy} onClick={() => setColor(value)} />)}
          </div>
          <button type="button" className="codexSketchConfirm" title={t('sketchAttach')} aria-label={t('sketchAttach')} disabled={busy || !allowed || !strokes.current.length} onClick={() => {void confirm()}}><WorkspaceIcon name="check" size={30} /></button>
        </div>
      </> : <div className="codexTemplateForm">{mode === 'template' ? <select aria-label={t('imageTemplate')} value={template} onChange={event => setTemplate(event.target.value)}>{['templatePoster','templateProduct','templateIcon'].map(key => <option key={key} value={key}>{t(key)}</option>)}</select> : <p className="codexImageDefaults">{settings.imageModel} · {settings.imageQuality}</p>}<textarea aria-label={t('templatePrompt')} value={brief} onChange={event => setBrief(event.target.value)} placeholder={t('templatePrompt')} /></div>}
      <p className="codexSketchHint">{error || t(mode === 'sketch' ? 'sketchHint' : 'imageDraftHint')}</p>
      {mode !== 'sketch' ? <footer><button type="button" disabled={busy} onClick={close}>{t('sketchCancel')}</button><button type="button" disabled={busy || !allowed || !brief.trim()} onClick={() => { void confirm() }}>{t('templateAdd')}</button></footer> : null}
    </dialog> : null}
  </>
}
