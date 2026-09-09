import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

function LibraryImage({ item, loadImage, selected, onSelect }) {
  const node = useRef(null)
  const [src, setSrc] = useState()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      void loadImage(item.attachment).then(value => { if (live) setSrc(value) }, () => { if (live) setFailed(true) })
    })
    observer.observe(node.current)
    return () => { live = false; observer.disconnect() }
  }, [item, loadImage])
  return <button ref={node} type="button" className="codexLibraryItem" aria-pressed={selected} onClick={onSelect} aria-label={item.attachment.name}>
    {src ? <img src={src} alt={item.attachment.name} /> : <span>{failed ? '⚠' : '…'}</span>}
    <small>{item.original.width} × {item.original.height}{selected ? ' ✓' : ''}</small>
  </button>
}

export function ImageLibrary({ preference, loadGallery, loadImage, attachSelected, t }) {
  const features = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState([])
  const [compare, setCompare] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const dialog = useRef(null)
  const opener = useRef(null)
  const operation = useRef(null)
  useEffect(() => () => operation.current?.abort(), [])
  useEffect(() => {
    if (!open) return
    if (!dialog.current.open) dialog.current.showModal()
    let live = true; setBusy(true); setError(false)
    void loadGallery().then(value => { if (live) {setItems(value); setSelected([]); setCompare(false)} }, () => { if (live) setError(true) }).finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [open, loadGallery, attempt])
  const close = () => { operation.current?.abort(); dialog.current?.close(); setOpen(false); opener.current?.focus() }
  const attach = async () => {
    setBusy(true); setError(false)
    const controller = new AbortController(); operation.current = controller
    try { await attachSelected(selected.map(id => items.find(item => item.attachment.attachmentId === id)), controller.signal); if (!controller.signal.aborted) {dialog.current.close(); setOpen(false); opener.current?.focus()} }
    catch { if (!controller.signal.aborted) setError(true) } finally { if(operation.current === controller) {operation.current = null;setBusy(false)} }
  }
  return <>
    {features.imageGallery ? <button type="button" className="codexWorkspaceLaunch" onClick={event => { opener.current = event.currentTarget; setOpen(true) }}>{t('imageGallery')}</button> : null}
    {open ? <dialog ref={dialog} className="codexSketchDialog" aria-label={t('imageGallery')} onCancel={event => {event.preventDefault();close()}}>
      <h2>{t('imageGallery')}</h2><p>{t('imageGalleryHint')}</p>
      <div className={compare && features.imageCompare ? 'codexLibraryGrid codexLibraryCompare' : 'codexLibraryGrid'}>
        {items.filter(item => !compare || !features.imageCompare || selected.includes(item.attachment.attachmentId)).map(item => <LibraryImage key={item.attachment.attachmentId} item={item} loadImage={loadImage} selected={selected.includes(item.attachment.attachmentId)} onSelect={() => {
          if (busy || compare) return
          const id = item.attachment.attachmentId
          setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 5 ? [...current,id] : current)
        }} />)}
      </div>
      {error ? <p role="alert">{t('imageGalleryFailed')} <button type="button" disabled={busy} onClick={() => setAttempt(value => value + 1)}>{t('preferenceRetry')}</button></p> : null}
      <footer><button type="button" onClick={close}>{t('sketchCancel')}</button>
        {features.imageCompare ? <button type="button" disabled={selected.length !== 2 || busy} aria-pressed={compare} onClick={() => setCompare(!compare)}>{t('imageCompareAction')}</button> : null}
        {features.imageEditing ? <button type="button" disabled={busy || !selected.length || !features.imageGallery} onClick={() => { void attach() }}>{t('imageSelectedEdit')} ({selected.length})</button> : null}
      </footer>
    </dialog> : null}
  </>
}

export const LIBRARY_CSS = `.codexLibraryGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;max-height:55vh;overflow:auto;margin:12px 0}.codexLibraryItem{display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:100px;overflow:hidden}.codexLibraryItem[aria-pressed=true]{outline:2px solid #2563eb}.codexLibraryItem img{width:100%;height:150px;object-fit:contain}.codexLibraryCompare{grid-template-columns:repeat(2,minmax(0,1fr))}.codexLibraryCompare img{height:auto;max-height:50vh}.codexLibraryItem small{padding:4px}@media(max-width:500px){.codexLibraryGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}`
