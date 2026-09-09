// Adapted from WSL043/dsh-image-viewer 0.1.0-beta.9 with 0.1.0 zoom and annotation fixes, MIT; see THIRD_PARTY_NOTICES.md.

import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore,
} from 'react'
import {
  IconChevronLeftOutline14, IconChevronRightOutline14, IconCloseOutline16,
  IconCopyOutline16, IconDownloadOutline16, IconEditOutline16, IconFullscreenOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { SUBSCRIPTION_IMAGE_VIEWER_CSS } from './subscription-image-viewer-styles.js'
import { useImageTransform } from './subscription-image-transform.js'

const fill = (value, variables) => Object.entries(variables).reduce(
  (text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement)),
  value,
)
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const bytesLabel = bytes => bytes === undefined ? undefined : bytes < 1024 * 1024
  ? `${Math.max(0.1, bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`
  : `${(bytes / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`
const downloadName = name => {
  const cleaned = String(name || 'image.png').replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-').replace(/[. ]+$/u, '').trim()
  return cleaned === '' ? 'image.png' : cleaned
}
const noteText = (annotations, t) => annotations.map((annotation, index) => {
  const label = fill(t('imageAnnotation'), { value: index + 1 })
  return `${label} (${Math.round(annotation.x * 100)}%, ${Math.round(annotation.y * 100)}%): ${annotation.note.trim()}`
}).filter(line => !line.endsWith(': ')).join('\n')

function ViewerAction({ action, annotations, item, service, revision, t }) {
  const [state, setState] = useState('idle')
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const invoke = async () => {
    if (state === 'pending') return
    setState('pending')
    try {
      await action.onInvoke({ annotations, item, src: item.src })
      if (!active.current || service.getSnapshot()?.revision !== revision) return
      setState('idle')
      if (action.closeOnSuccess) service.close()
    } catch { if (active.current) setState('failed') }
  }
  const label = state === 'pending' ? action.pendingLabel : state === 'failed' ? action.errorLabel : action.label
  return <button type="button" className="dcsiv-button dcsiv-edit-action" aria-label={label ?? t('imageEdit')} disabled={state === 'pending'} onClick={() => { void invoke() }}><IconEditOutline16 /><span className="dcsiv-label">{label ?? t('imageEdit')}</span><span className="dcsiv-edit-short">{state === 'idle' ? (action.id === 'sketch' ? t('imageToSketch') : t('imageEditShort')) : label}</span></button>
}

function ViewerDownload({ download, item, t }) {
  const [state, setState] = useState('idle')
  const [progress, setProgress] = useState(0)
  const active = useRef()
  useEffect(() => () => { active.current?.abort(); active.current = undefined }, [item.id, download])
  const invoke = async () => {
    if (active.current) { active.current.abort(); active.current = undefined; setState('idle'); return }
    const controller = new AbortController()
    active.current = controller
    setProgress(0)
    setState('pending')
    try {
      await download.onInvoke({ item, src: item.src, signal: controller.signal, onProgress: ({ loaded, total }) => { if (active.current === controller) setProgress(Math.floor(loaded / total * 100)) } })
      if (active.current === controller) setState('idle')
    } catch {
      if (active.current === controller) setState(controller.signal.aborted ? 'idle' : 'failed')
    } finally {
      if (active.current === controller) active.current = undefined
    }
  }
  const label = state === 'pending'
    ? download.pendingLabel ?? t('imageDownloadPreparing')
    : state === 'failed'
      ? download.errorLabel ?? t('imageDownloadFailed')
      : t('imageDownload')
  return <button type="button" className="dcsiv-download" onClick={() => { void invoke() }}><IconDownloadOutline16 /><span className="dcsiv-label">{state === 'pending' ? `${label} ${progress}% · ${t('cancel')}` : label}</span></button>
}

export function SubscriptionImageViewerOverlay({ service, t }) {
  const request = useSyncExternalStore(service.subscribe, service.getSnapshot)
  const [cursor, setCursor] = useState({ revision: 0, index: 0 })
  const index = cursor.revision === request?.revision ? cursor.index : request?.index ?? 0
  const setIndex = update => setCursor(current => ({
    revision: request.revision,
    index: typeof update === 'function' ? update(current.revision === request.revision ? current.index : request.index) : update,
  }))
  const [annotating, setAnnotating] = useState(false)
  const [annotationsByImage, setAnnotationsByImage] = useState(service.getAnnotationsSnapshot)
  const annotationsByImageRef = useRef(annotationsByImage)
  const [selected, setSelected] = useState()
  const [focusNote, setFocusNote] = useState()
  const [copied, setCopied] = useState(false)
  const rootRef = useRef(null)
  annotationsByImageRef.current = annotationsByImage

  useEffect(() => {
    if (request === undefined) return
    setAnnotating(false)
    setSelected(undefined)
    setCopied(false)
  }, [request?.revision])

  const item = request?.items[index]
  const { transform, transformRef, dragging, pixelScale, geometry, stageRef, surfaceRef, imageRef, fit, actual, measure, setZoomAt, resetGesture, pointerHandlers } = useImageTransform(`${request?.revision}:${item?.id}:${item?.src}`)
  const annotations = item === undefined ? [] : annotationsByImage[item.id] ?? []
  const setAnnotations = useCallback((update) => {
    if (item === undefined) return
    const previous = annotationsByImageRef.current[item.id] ?? []
    const next = typeof update === 'function' ? update(previous) : update
    const snapshot = { ...annotationsByImageRef.current, [item.id]: next }
    annotationsByImageRef.current = snapshot
    service.setAnnotations(item.id, next)
    setAnnotationsByImage(snapshot)
  }, [item?.id, service])

  useEffect(() => {
    if (request === undefined) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    rootRef.current?.focus()
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (event.target instanceof Element && event.target.closest('.dcsiv-inline-note') !== null) {
          setSelected(undefined)
          return
        }
        service.close()
        return
      }
      const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
      if (!editing && event.key === 'ArrowLeft' && request.items.length > 1) {
        event.preventDefault(); setIndex(value => (value - 1 + request.items.length) % request.items.length)
      } else if (!editing && event.key === 'ArrowRight' && request.items.length > 1) {
        event.preventDefault(); setIndex(value => (value + 1) % request.items.length)
      } else if (!editing && (event.key === '+' || event.key === '=')) {
        event.preventDefault(); const box = stageRef.current?.getBoundingClientRect(); if (box) setZoomAt(transformRef.current.zoom * 1.2, box.left + box.width / 2, box.top + box.height / 2)
      } else if (!editing && event.key === '-') {
        event.preventDefault(); const box = stageRef.current?.getBoundingClientRect(); if (box) setZoomAt(transformRef.current.zoom / 1.2, box.left + box.width / 2, box.top + box.height / 2)
      } else if (!editing && event.key.toLowerCase() === 'f') {
        event.preventDefault(); fit()
      } else if (event.key === 'Tab') {
        const controls = [...rootRef.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
        const first = controls[0]
        const last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [request, service, fit, setZoomAt])

  useEffect(() => {
    if (focusNote === undefined) return
    const field = rootRef.current?.querySelector(`[data-note-id="${CSS.escape(focusNote)}"] textarea`)
    field?.focus()
    setFocusNote(undefined)
  }, [focusNote, selected, annotations.length])

  useEffect(() => {
    setAnnotating(false)
    setSelected(undefined)
  }, [item?.id, item?.src, request?.revision])

  const addAnnotation = event => {
    if (!annotating || event.target.closest('.dcsiv-annotation')) return
    const bounds = surfaceRef.current?.getBoundingClientRect()
    if (bounds === undefined) return
    const annotation = {
      id: crypto.randomUUID(),
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
      note: '',
    }
    setAnnotations(current => [...current, annotation])
    setAnnotating(false)
    setSelected(annotation.id)
    setFocusNote(annotation.id)
  }
  const copyNotes = async () => {
    const text = noteText(annotations, t)
    if (text === '' || typeof navigator?.clipboard?.writeText !== 'function') return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1200)
    } catch {
      setCopied(false)
    }
  }

  if (request === undefined || item === undefined) return null
  const meta = [item.width && item.height ? `${item.width} × ${item.height}` : undefined, bytesLabel(item.bytes)].filter(Boolean).join(' · ')
  const showCounter = request.items.length > 1
  const annotationPosition = annotation => {
    // Only the image is scaled. Notes stay in screen coordinates so their text
    // is not rasterized inside a scaled compositor layer and then enlarged.
    const ratio = globalThis.devicePixelRatio || 1
    const align = value => Math.round(value * ratio) / ratio
    return {
      left: align(geometry.stageWidth / 2 + transform.x + (annotation.x - 0.5) * geometry.width * transform.zoom - 12),
      top: align(geometry.stageHeight / 2 + transform.y + (annotation.y - 0.5) * geometry.height * transform.zoom - 12),
      visibility: geometry.width > 0 ? 'visible' : 'hidden',
    }
  }
  return <div ref={rootRef} className="dcsiv-root" role="dialog" aria-modal="true" aria-label={t('imagePreview')} tabIndex={-1}>
    <div className="dcsiv-title dcsiv-sr-only"><strong>{item.name}</strong>{meta !== '' ? <small>{meta}</small> : null}</div>
    <header className="dcsiv-topbar" role="toolbar" aria-label={t('imagePreview')}>
      <div className="dcsiv-actions">
        {request.annotations ? <button type="button" className="dcsiv-button" data-active={annotating} aria-label={annotating ? t('imageAnnotateCancel') : t('imageAnnotate')} aria-pressed={annotating} onClick={() => { resetGesture(); setAnnotating(value => !value) }}><IconEditOutline16 /><span className="dcsiv-label">{annotating ? t('imageAnnotateCancel') : t('imageAnnotate')}</span></button> : null}
        {annotations.length > 0 ? <button type="button" className="dcsiv-button" data-active={selected !== undefined} onClick={() => { const first = annotations[0]; setSelected(current => current === undefined ? first.id : undefined); if (selected === undefined) setFocusNote(first.id) }}>{annotations.length} <span className="dcsiv-label">{t('imageRegions')}</span></button> : null}
        <button type="button" className="dcsiv-button" aria-label={t('imageFit')} onClick={fit}><IconFullscreenOutline16 /><span className="dcsiv-label">{t('imageFit')}</span></button>
        <button type="button" className="dcsiv-button" onClick={actual}>{t('imageActual')}</button>
        <span className="dcsiv-zoom">{Math.round(transform.zoom * pixelScale * 100)}%</span>
        {item.download === undefined
          ? <a className="dcsiv-download" href={item.src} download={downloadName(item.name)}><IconDownloadOutline16 /><span className="dcsiv-label">{t('imageDownload')}</span></a>
          : <ViewerDownload key={item.id} download={item.download} item={item} t={t} />}
        {item.actions.map(action => <ViewerAction action={action} annotations={annotations} item={item} service={service} revision={request.revision} t={t} key={`${request.revision}:${index}:${action.id}`} />)}
      </div>
    </header>
    <button type="button" className="dcsiv-close-floating" aria-label={t('imageClosePreview')} onClick={() => service.close()}><IconCloseOutline16 /></button>
    <div className="dcsiv-workspace">
      <main ref={stageRef} className="dcsiv-stage" data-dragging={dragging} data-annotating={annotating} onClick={event => { if (event.target === event.currentTarget && !annotating && transform.zoom === 1) service.close() }} {...(!annotating ? pointerHandlers : {})} onDoubleClick={() => { if (transform.zoom === 1) actual(); else fit() }}>
        <div ref={surfaceRef} className="dcsiv-surface" onClick={addAnnotation} style={{ transform: `translate3d(${transform.x}px,${transform.y}px,0) scale(${transform.zoom})` }}>
          <img key={`${request.revision}:${item.id}`} ref={imageRef} className="dcsiv-image" src={item.src} alt={item.name} draggable="false" onLoad={() => { measure() }} />
        </div>
        {annotations.map((annotation, position) => <div className="dcsiv-annotation" data-x={annotation.x < 0.38 ? 'right' : annotation.x > 0.62 ? 'left' : 'center'} data-y={annotation.y < 0.28 ? 'down' : 'up'} style={annotationPosition(annotation)} key={annotation.id}>
          <button type="button" className="dcsiv-pin" data-active={selected === annotation.id} aria-label={fill(t('imageAnnotation'), { value: position + 1 })} onClick={event => { event.stopPropagation(); const opening = selected !== annotation.id; setSelected(opening ? annotation.id : undefined); if (opening) setFocusNote(annotation.id) }}>{position + 1}</button>
          {selected === annotation.id ? <div className="dcsiv-inline-note" data-note-id={annotation.id} onClick={event => event.stopPropagation()}>
            <span className="dcsiv-inline-index">{position + 1}</span>
            <textarea value={annotation.note} rows={1} aria-label={fill(t('imageAnnotation'), { value: position + 1 })} placeholder={t('imageAnnotationPlaceholder')} onChange={event => { const note = event.target.value; setAnnotations(current => current.map(entry => entry.id === annotation.id ? { ...entry, note } : entry)) }} onKeyDown={event => {
              if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                event.nativeEvent?.stopImmediatePropagation?.()
                setSelected(undefined)
              }
            }} />
            <button type="button" className="dcsiv-note-remove" aria-label={t('imageRemoveAnnotation')} onClick={event => { event.stopPropagation(); setAnnotations(current => current.filter(entry => entry.id !== annotation.id)); setSelected(undefined) }}><IconCloseOutline16 /></button>
          </div> : null}
        </div>)}
        {showCounter ? <>
          <button type="button" className="dcsiv-button dcsiv-icon-only dcsiv-nav dcsiv-prev" aria-label={t('imagePrevious')} onClick={event => { event.stopPropagation(); setIndex(value => (value - 1 + request.items.length) % request.items.length) }}><IconChevronLeftOutline14 /></button>
          <button type="button" className="dcsiv-button dcsiv-icon-only dcsiv-nav dcsiv-next" aria-label={t('imageNext')} onClick={event => { event.stopPropagation(); setIndex(value => (value + 1) % request.items.length) }}><IconChevronRightOutline14 /></button>
          <span className="dcsiv-counter">{index + 1} / {request.items.length}</span>
        </> : annotating ? <span className="dcsiv-hint">{t('imageAnnotateHint')}</span> : transform.zoom === 1 ? <span className="dcsiv-hint">{t('imageZoomHint')}</span> : null}
      </main>
      {annotations.some(annotation => annotation.note.trim() !== '') ? <button type="button" className="dcsiv-copy-notes" onClick={() => { void copyNotes() }}><IconCopyOutline16 />{copied ? t('imageCopied') : t('imageCopyNotes')}</button> : null}
    </div>
  </div>
}

export { SUBSCRIPTION_IMAGE_VIEWER_CSS }
