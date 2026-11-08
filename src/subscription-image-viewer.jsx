// Adapted from WSL043/dsh-image-viewer 0.1.0-beta.9 with 0.1.0 zoom and annotation fixes, MIT; see THIRD_PARTY_NOTICES.md.

import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
} from 'react'
import {
  IconCheckOutline16, IconChevronLeftOutline14, IconChevronRightOutline14, IconCloseOutline16,
  IconCopyOutline16, IconDownloadOutline16, IconEditOutline16,
} from './client-primitives.jsx'
import { SUBSCRIPTION_IMAGE_VIEWER_CSS } from './subscription-image-viewer-styles.js'
import { useImageTransform } from './subscription-image-transform.js'
import { paintEraseMask, paintEraseStrokes } from './image-official-tools.js'
import { createPortal } from 'react-dom'
import { useImageSource } from './use-image-source.js'
import { ArrowsPointingOutIcon, ChatBubbleLeftEllipsisIcon, EllipsisHorizontalIcon, PaintBrushIcon, PencilIcon, ScissorsIcon } from '@heroicons/react/24/outline'

const TOOL_ICONS = { 'remove-background': ScissorsIcon, erase: PaintBrushIcon, resize: ArrowsPointingOutIcon, sketch: PencilIcon, annotate: ChatBubbleLeftEllipsisIcon }
const ToolIcon = ({ id }) => { const Icon = TOOL_ICONS[id]; return Icon ? <Icon className="dcsiv-tool-icon" aria-hidden="true" /> : null }

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

const compactQuery = '(max-width: 600px)'
const compactSnapshot = () => globalThis.matchMedia?.(compactQuery).matches ?? false
const subscribeCompact = listener => {
  const query = globalThis.matchMedia?.(compactQuery)
  query?.addEventListener('change', listener)
  return () => query?.removeEventListener('change', listener)
}

// Share positioning, keyboard ownership and focus restoration between both menus.
function ViewerMenu({ label, children, icon, role, disabled, state }) {
  const [menu, setMenu] = useState()
  const menuRef = useRef(null)
  const menuButtonRef = useRef(null)
  useEffect(() => {
    if (menu === undefined) return undefined
    menuRef.current?.querySelector('[role="menuitem"]')?.focus()
    const onKeyDown = event => {
      // A nested resize menu owns its own keys; Escape never closes the viewer.
      if (!menuRef.current?.contains(event.target) && event.target !== menuButtonRef.current) return
      const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? [])]
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); setMenu(undefined); menuButtonRef.current?.focus()
      } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length > 0) {
        event.preventDefault(); event.stopPropagation()
        const step = event.key === 'ArrowDown' ? 1 : -1
        items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus()
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault(); event.stopPropagation(); (event.key === 'Home' ? items[0] : items.at(-1))?.focus()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); event.stopPropagation()
      } else if (event.key === 'Tab') { setMenu(undefined); menuButtonRef.current?.focus() }
    }
    const onPointerDown = event => {
      // Keep the parent menu mounted while interacting with a portalled submenu.
      if (!menuRef.current?.contains(event.target) && !menuButtonRef.current?.contains(event.target) && !event.target.closest?.('.dcsiv-menu')) setMenu(undefined)
    }
    const onResize = () => setMenu(undefined)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('resize', onResize)
    }
  }, [menu])
  return <>
    <button ref={menuButtonRef} type="button" role={role} aria-haspopup="menu" aria-expanded={menu !== undefined} data-state={state} disabled={disabled} onClick={event => {
      const box = event.currentTarget.getBoundingClientRect()
      const host = event.currentTarget.closest('.dcsiv-root')
      setMenu(value => value === undefined && host ? { host, style: { right: Math.max(12, window.innerWidth - box.right), bottom: window.innerHeight - box.top + 8 } } : undefined)
    }} className="dcsiv-button dcsiv-icon-button" title={label} aria-label={label}>{icon}</button>
    {menu ? createPortal(<div ref={menuRef} className="dcsiv-menu" role="menu" aria-label={label} style={menu.style}>{typeof children === 'function' ? children(() => setMenu(undefined)) : children}</div>, menu.host) : null}
  </>
}

function ViewerAction({ action, finishDraft, item, service, revision, onStartMask, inMenu = false }) {
  const [state, setState] = useState('idle')
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const invoke = async (extra = {}) => {
    if (state === 'pending') return
    setState('pending')
    try {
      await service.invoke(action, { annotations: finishDraft(), item, src: item.src, ...extra }, revision)
      if (service.getSnapshot()?.revision !== revision) return
      if (active.current) setState('idle')
      if (action.closeOnSuccess) service.close()
    } catch (error) { if (active.current) setState(error?.name === 'AbortError' ? 'idle' : 'failed') }
  }
  const label = state === 'pending' ? action.pendingLabel : state === 'failed' ? action.errorLabel : action.label
  const role = inMenu ? 'menuitem' : undefined
  const tool = id => <><ToolIcon id={id} />{inMenu ? <span>{label}</span> : null}</>
  if (action.kind === 'mask') return <button type="button" role={role} className="dcsiv-button dcsiv-icon-button" title={action.label} aria-label={action.label} onClick={() => onStartMask(action)}>{tool(action.id)}</button>
  if (action.kind === 'tool') return <button type="button" role={role} className="dcsiv-button dcsiv-icon-button" title={label} aria-label={label} data-state={state} disabled={state === 'pending'} onClick={() => { void invoke() }}>{tool(action.id)}</button>
  if (action.id === 'sketch' && state === 'idle') return <button type="button" role={role} className="dcsiv-button dcsiv-icon-button" title={action.label} aria-label={action.label} onClick={() => { void invoke() }}>{tool('sketch')}</button>
  if (action.kind === 'choice') return <ViewerMenu label={label} role={role} state={state} disabled={state === 'pending'} icon={tool(action.id)}>{close => action.options.map(option => <button type="button" role="menuitem" key={option.value} onClick={() => { close(); void invoke({ option: option.value }) }}>{option.label}</button>)}</ViewerMenu>
  return <button type="button" role={role} className="dcsiv-button dcsiv-edit-action" title={label} aria-label={label} data-state={state} disabled={state === 'pending'} onClick={() => { void invoke() }}><IconEditOutline16 /><span className="dcsiv-edit-short">{label}</span></button>
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
  return <button type="button" className="dcsiv-download" data-compact={state === 'idle'} title={label} aria-label={label} onClick={() => { void invoke() }}><IconDownloadOutline16 />{state === 'idle' ? null : <span className="dcsiv-label">{state === 'pending' ? `${label} ${progress}% · ${t('cancel')}` : label}</span>}</button>
}

export function SubscriptionImageViewerOverlay({ service, t }) {
  const request = useSyncExternalStore(service.subscribe, service.getSnapshot)
  const compact = useSyncExternalStore(subscribeCompact, compactSnapshot, () => false)
  const [cursor, setCursor] = useState({ revision: 0, index: 0 })
  const index = cursor.revision === request?.revision ? cursor.index : request?.index ?? 0
  const move = offset => {
    finishDraft()
    setCursor(current => {
      const activeIndex = current.revision === request.revision ? current.index : request.index
      return { revision: request.revision, index: (activeIndex + offset + request.items.length) % request.items.length }
    })
  }
  const [annotating, setAnnotating] = useState(false)
  const [annotationsByImage, setAnnotationsByImage] = useState(service.getAnnotationsSnapshot)
  const annotationsByImageRef = useRef(annotationsByImage)
  const [selected, setSelected] = useState()
  const [draft, setDraft] = useState()
  const draftRef = useRef()
  draftRef.current = draft
  const [focusNote, setFocusNote] = useState()
  const [copied, setCopied] = useState(false)
  const [erasing, setErasing] = useState()
  const [strokes, setStrokes] = useState([])
  const [brush, setBrush] = useState(0.05)
  const [sending, setSending] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)
  const maskOperation = useRef(0)
  const [brushCursor, setBrushCursor] = useState()
  const eraseRef = useRef({ erasing: undefined, sending: false })
  eraseRef.current = { erasing, sending }
  const drawingRef = useRef(false)
  const maskRef = useRef(null)
  const rootRef = useRef(null)
  const openerRef = useRef()
  if (request) openerRef.current = request.opener
  annotationsByImageRef.current = annotationsByImage

  useEffect(() => {
    if (request === undefined) return
    setAnnotating(false)
    setSelected(undefined)
    setCopied(false)
    const saved = service.getAnnotationsSnapshot()
    annotationsByImageRef.current = saved
    setAnnotationsByImage(saved)
  }, [request?.revision])

  const item = request?.items[index]
  const reloadImage = useCallback(() => item?.reload ? item.reload() : item?.src, [item])
  const imageSource = useImageSource(reloadImage, `${request?.revision}:${item?.id}`, item?.src)
  const resolvedItem = imageSource.src === item?.src ? item : { ...item, src: imageSource.src }
  useEffect(() => () => service.cancelPending(), [service, request?.revision, item?.id])
  const { transform, transformRef, dragging, pixelScale, geometry, stageRef, surfaceRef, imageRef, fit, actual, measure, setZoomAt, resetGesture, pointerHandlers } = useImageTransform(`${request?.revision}:${item?.id}:${item?.src}`)
  const annotations = item === undefined ? [] : annotationsByImage[item.id] ?? []
  const setAnnotations = useCallback((update) => {
    if (item === undefined || service.getSnapshot()?.revision !== request?.revision) return []
    const previous = annotationsByImageRef.current[item.id] ?? []
    const next = typeof update === 'function' ? update(previous) : update
    const snapshot = { ...annotationsByImageRef.current, [item.id]: next }
    annotationsByImageRef.current = snapshot
    service.setAnnotations(item.id, next)
    setAnnotationsByImage(snapshot)
    return next
  }, [item?.id, request?.revision, service])

  const finishDraft = useCallback(() => {
    const pending = draftRef.current
    const note = pending?.note.trim()
    if (pending) {
      draftRef.current = undefined
      setDraft(undefined)
    }
    return note
      ? setAnnotations(current => [...current, { ...pending, note }])
      : annotationsByImageRef.current[item?.id] ?? []
  }, [item?.id, setAnnotations])
  const closeViewer = () => { finishDraft(); service.close() }

  const open = request !== undefined
  useLayoutEffect(() => {
    if (!open) return
    const dialog = rootRef.current
    dialog.showModal()
    return () => {
      dialog.close()
      const document = dialog.ownerDocument
      const selector = 'dialog:modal, [role="dialog"][aria-modal="true"]'
      if (document.activeElement?.closest(selector)) return
      // A DSH dialog opened behind us may have tried to take focus while the
      // browser still made it inert. Give it focus once our layer is removed.
      const other = Array.from(document.querySelectorAll(selector)).reverse()
        .find(element => element !== dialog && element.getClientRects().length > 0 && !element.closest('[inert]'))
      const opener = openerRef.current
      const target = other && !other.contains(opener)
        ? other.querySelector('[data-modal-autofocus]') ?? other
        : opener
      if (target?.isConnected) target.focus({ preventScroll: true })
    }
  }, [open])

  const consumeKey = event => {
    event.preventDefault()
    event.stopPropagation()
  }
  const dismiss = event => {
    consumeKey(event)
    if (event.repeat) return
    if (eraseRef.current.erasing !== undefined) {
      if (!eraseRef.current.sending) { setErasing(undefined); setStrokes([]) }
      return
    }
    if (rootRef.current.contains(event.target) && event.target.closest?.('.dcsiv-inline-note')) {
      draftRef.current = undefined
      setSelected(undefined)
      setDraft(undefined)
      return
    }
    if (annotating) {
      finishDraft()
      setAnnotating(false)
      return
    }
    closeViewer()
  }
  const onKeyDown = event => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return
    if (event.key === 'Escape') { dismiss(event); return }
    // The browser traps focus inside the modal. Prevent DSH's document-level
    // Tab handler for a dialog behind us from taking that key.
    if (event.key === 'Tab') { event.stopPropagation(); return }
    if (eraseRef.current.erasing !== undefined) {
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        consumeKey(event)
        if (!eraseRef.current.sending) setStrokes(current => current.slice(0, -1))
        return
      }
      if (event.key === '[' || event.key === ']') {
        consumeKey(event)
        setBrush(value => Math.round(clamp(value + (event.key === ']' ? 0.01 : -0.01), 0.01, 0.15) * 100) / 100)
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') return
    }
    const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
    if (!editing && event.key === 'ArrowLeft' && request.items.length > 1) {
      consumeKey(event)
      move(-1)
    } else if (!editing && event.key === 'ArrowRight' && request.items.length > 1) {
      consumeKey(event)
      move(1)
    } else if (!editing && (event.key === '+' || event.key === '=')) {
      consumeKey(event)
      const box = stageRef.current?.getBoundingClientRect()
      if (box) setZoomAt(transformRef.current.zoom * 1.2, box.left + box.width / 2, box.top + box.height / 2)
    } else if (!editing && event.key === '-') {
      consumeKey(event)
      const box = stageRef.current?.getBoundingClientRect()
      if (box) setZoomAt(transformRef.current.zoom / 1.2, box.left + box.width / 2, box.top + box.height / 2)
    } else if (!editing && event.key.toLowerCase() === 'f') {
      consumeKey(event)
      fit()
    }
  }

  useEffect(() => {
    if (focusNote === undefined) return
    const field = rootRef.current?.querySelector(`[data-note-id="${CSS.escape(focusNote)}"] textarea`)
    field?.focus()
    setFocusNote(undefined)
  }, [focusNote])

  useEffect(() => {
    setAnnotating(false)
    setSelected(undefined)
    setDraft(undefined)
    setErasing(undefined)
    setStrokes([])
    maskOperation.current++
    setSending(false)
    setSendFailed(false)
    return () => { maskOperation.current++ }
  }, [item?.id, item?.src, request?.revision])

  useEffect(() => {
    const canvas = maskRef.current
    if (!erasing || canvas === null) return
    const context = canvas.getContext('2d')
    context.clearRect(0, 0, canvas.width, canvas.height)
    paintEraseStrokes(context, strokes, canvas.width, canvas.height, 'rgba(255,59,48,.5)')
  }, [erasing, strokes])

  const strokePoint = event => {
    const bounds = maskRef.current?.getBoundingClientRect()
    if (bounds === undefined) return undefined
    return { x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1), y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1) }
  }
  const maskHandlers = {
    onPointerDown: event => {
      const point = strokePoint(event)
      if (point === undefined) return
      event.stopPropagation()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      drawingRef.current = true
      setStrokes(current => [...current, { size: brush / transformRef.current.zoom, points: [point] }])
    },
    onPointerMove: event => {
      const bounds = maskRef.current?.getBoundingClientRect()
      if (bounds !== undefined) setBrushCursor({ left: event.clientX, top: event.clientY, span: Math.min(bounds.width, bounds.height) / transformRef.current.zoom })
      if (!drawingRef.current) return
      const point = strokePoint(event)
      if (point === undefined) return
      setStrokes(current => current.length === 0 ? current : [...current.slice(0, -1), { ...current.at(-1), points: [...current.at(-1).points, point] }])
    },
    onPointerUp: () => { drawingRef.current = false },
    onPointerCancel: () => { drawingRef.current = false },
    onPointerLeave: () => { setBrushCursor(undefined) },
  }
  const startMask = action => { finishDraft(); resetGesture(); setAnnotating(false); setStrokes([]); setSendFailed(false); setBrushCursor(undefined); setErasing(action) }
  const sendMask = async () => {
    const image = imageRef.current
    if (!erasing || strokes.length === 0 || image === null || sending) return
    setSending(true)
    const operation = ++maskOperation.current
    setSendFailed(false)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = item.width ?? image.naturalWidth
      canvas.height = item.height ?? image.naturalHeight
      paintEraseMask(canvas.getContext('2d'), strokes, canvas.width, canvas.height)
      const mask = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Mask')), 'image/png'))
      await service.invoke(erasing, { mask, item: resolvedItem, src: resolvedItem.src, annotations: [] }, request.revision)
      if (operation !== maskOperation.current) return
      setErasing(undefined)
      setStrokes([])
      if (erasing.closeOnSuccess) service.close()
    } catch {
      // Keep the strokes so the user can retry.
      if (operation === maskOperation.current) setSendFailed(true)
    } finally { if (operation === maskOperation.current) setSending(false) }
  }

  const addAnnotation = event => {
    if (!annotating || !imageRef.current?.naturalWidth || event.target !== imageRef.current) return
    const bounds = surfaceRef.current?.getBoundingClientRect()
    if (bounds === undefined) return
    const annotation = {
      id: crypto.randomUUID(),
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
      note: '',
    }
    finishDraft()
    setDraft(annotation)
    setSelected(undefined)
    setFocusNote(annotation.id)
  }
  const saveDraft = () => {
    if (!draft?.note.trim()) return
    finishDraft()
    rootRef.current?.focus()
  }
  const copyNotes = async () => {
    const text = noteText(finishDraft(), t)
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
  const actions = imageSource.usable ? item.actions : []
  const secondaryActions = actions.filter(action => action.kind === 'tool' || action.kind === 'mask' || action.kind === 'choice' || action.id === 'sketch')
  const primaryActions = actions.filter(action => !secondaryActions.includes(action))
  const hasNotes = Boolean(draft?.note.trim()) || annotations.some(annotation => annotation.note.trim() !== '')
  const showMore = (compact && imageSource.usable) || secondaryActions.length > 0 || hasNotes
  const renderAction = (action, inMenu = false, closeMenu) => <ViewerAction action={action} finishDraft={finishDraft} item={resolvedItem} service={service} revision={request.revision} onStartMask={action => { closeMenu?.(); startMask(action) }} inMenu={inMenu} key={`${request.revision}:${index}:${action.id}`} />
  const zoomLabel = t(transform.zoom === 1 ? 'imageActual' : 'imageFit')
  const zoomControl = closeMenu => <button type="button" role={closeMenu ? 'menuitem' : undefined} className="dcsiv-button dcsiv-zoom" title={zoomLabel} aria-label={zoomLabel} aria-description={t('imageZoomHint')} onClick={() => { closeMenu?.(); if (transform.zoom === 1) actual(); else fit() }}>{Math.round(transform.zoom * pixelScale * 100)}%{closeMenu ? <span>{zoomLabel}</span> : null}</button>
  const annotationPosition = annotation => {
    // Only the image is scaled. Notes stay in screen coordinates so their text
    // is not rasterized inside a scaled compositor layer and then enlarged.
    const ratio = globalThis.devicePixelRatio || 1
    const align = value => Math.round(value * ratio) / ratio
    const x = align(geometry.stageWidth / 2 + transform.x + (annotation.x - 0.5) * geometry.width * transform.zoom)
    const y = align(geometry.stageHeight / 2 + transform.y + (annotation.y - 0.5) * geometry.height * transform.zoom)
    const width = Math.max(0, Math.min(300, geometry.stageWidth - 16))
    const left = clamp(x - width / 2, 8, geometry.stageWidth - width - 8)
    return {
      left: x - 12,
      top: y - 12,
      '--note-width': `${width}px`,
      '--note-left': `${left - x + 12}px`,
      '--note-arrow': `${clamp(x - left - 4, 12, width - 20)}px`,
      '--note-top': y < 100 ? '34px' : 'auto',
      '--note-bottom': y < 100 ? 'auto' : '34px',
      '--note-arrow-y': y < 100 ? '-5px' : 'auto',
      '--note-arrow-bottom': y < 100 ? 'auto' : '-5px',
      visibility: geometry.width > 0 ? 'visible' : 'hidden',
    }
  }
  return <dialog ref={rootRef} className="dcsiv-root" role="dialog" aria-modal="true" aria-label={t('imagePreview')} onKeyDown={onKeyDown} onCancel={dismiss}>
    <div className="dcsiv-title dcsiv-sr-only"><strong>{item.name}</strong>{meta !== '' ? <small>{meta}</small> : null}</div>
    <header className="dcsiv-topbar" role="toolbar" aria-label={t('imagePreview')}>
      <div className="dcsiv-actions">
        {showCounter ? <div className="dcsiv-gallery">
          <button type="button" className="dcsiv-button dcsiv-nav dcsiv-prev" disabled={erasing !== undefined} title={t('imagePrevious')} aria-label={t('imagePrevious')} onClick={() => move(-1)}><IconChevronLeftOutline14 /></button>
          <span className="dcsiv-counter" role="status" aria-live="polite" aria-atomic="true">{index + 1} / {request.items.length}</span>
          <button type="button" className="dcsiv-button dcsiv-nav dcsiv-next" disabled={erasing !== undefined} title={t('imageNext')} aria-label={t('imageNext')} onClick={() => move(1)}><IconChevronRightOutline14 /></button>
        </div> : null}
        {!compact && imageSource.usable ? zoomControl() : null}
        {item.download === undefined
          ? imageSource.usable && <a className="dcsiv-download" data-compact="true" href={imageSource.src} download={downloadName(item.name)} title={t('imageDownload')} aria-label={t('imageDownload')}><IconDownloadOutline16 /></a>
          : <ViewerDownload key={item.id} download={item.download} item={resolvedItem} t={t} />}
        {imageSource.usable && (request.annotations || actions.length > 0) ? <span className="dcsiv-divider" aria-hidden="true" /> : null}
        {request.annotations && imageSource.usable ? <button type="button" className="dcsiv-button dcsiv-icon-button" data-active={annotating} title={annotating ? t('imageAnnotateCancel') : t('imageAnnotate')} aria-label={annotating ? t('imageAnnotateCancel') : t('imageAnnotate')} aria-description={t('imageAnnotateHint')} aria-pressed={annotating} onClick={() => { resetGesture(); finishDraft(); setSelected(undefined); setAnnotating(value => !value) }}><ToolIcon id="annotate" /></button> : null}
        {primaryActions.map(action => renderAction(action))}
        {showMore ? <ViewerMenu key={`${request.revision}:${index}:more`} label={t('imageMore')} icon={<EllipsisHorizontalIcon className="dcsiv-tool-icon" aria-hidden="true" />}>{close => <>
          {compact && imageSource.usable ? zoomControl(close) : null}
          {secondaryActions.map(action => renderAction(action, true, close))}
          {hasNotes ? <button type="button" role="menuitem" onClick={() => { void copyNotes() }}><IconCopyOutline16 />{t(copied ? 'imageCopied' : 'imageCopyNotes')}</button> : null}
        </>}</ViewerMenu> : null}
      </div>
    </header>
    <button type="button" className="dcsiv-close-floating" title={t('imageClosePreview')} aria-label={t('imageClosePreview')} onClick={closeViewer}><IconCloseOutline16 /></button>
    <div className="dcsiv-workspace">
      <main ref={stageRef} className="dcsiv-stage" data-dragging={dragging} data-annotating={annotating || erasing !== undefined} onClick={event => { if (event.target === event.currentTarget && !annotating && !erasing && transform.zoom === 1) closeViewer() }} {...(!annotating && !erasing ? pointerHandlers : {})} onDoubleClick={() => { if (transform.zoom === 1) actual(); else fit() }}>
        <div ref={surfaceRef} className="dcsiv-surface" onClick={addAnnotation} style={{ transform: `translate3d(${transform.x}px,${transform.y}px,0) scale(${transform.zoom})` }}>
          {imageSource.src && (!imageSource.failed || imageSource.usable) ? <img key={`${request.revision}:${item.id}:${imageSource.attempt}`} ref={imageRef} className="dcsiv-image" src={imageSource.src} alt={item.name} draggable="false" onError={imageSource.fail} onLoad={() => { imageSource.loaded(); measure() }} /> : null}
          {!imageSource.src && !imageSource.failed ? <span role="status">{t('imageLoading')}</span> : null}
          {imageSource.failed ? <button type="button" className="dcsiv-button" onClick={imageSource.retry}>{t('imageLoadFailed')}</button> : null}
          {erasing ? <canvas ref={maskRef} className="dcsiv-mask" width={imageRef.current?.naturalWidth || 1} height={imageRef.current?.naturalHeight || 1} aria-label={t('imageEraseHint')} {...maskHandlers} /> : null}
        </div>
        {(draft ? [...annotations, draft] : annotations).map((annotation, position) => <div className="dcsiv-annotation" style={annotationPosition(annotation)} key={annotation.id}>
          <button type="button" className="dcsiv-pin" data-active={draft === annotation || selected === annotation.id} aria-label={fill(t('imageAnnotation'), { value: position + 1 })} onClick={() => { if (draft === annotation) { setFocusNote(annotation.id); return } const opening = selected !== annotation.id; finishDraft(); setSelected(opening ? annotation.id : undefined); if (opening) setFocusNote(annotation.id) }}>{position + 1}</button>
          {draft === annotation || selected === annotation.id ? <div className="dcsiv-inline-note" data-note-id={annotation.id} data-draft={draft === annotation} onClick={event => event.stopPropagation()}>
            <span className="dcsiv-inline-index">{position + 1}</span>
            <textarea value={annotation.note} rows={1} aria-label={fill(t('imageAnnotation'), { value: position + 1 })} placeholder={t('imageAnnotationPlaceholder')} onChange={event => {
              const note = event.target.value
              if (draft === annotation) setDraft({ ...draft, note })
              else setAnnotations(current => current.map(entry => entry.id === annotation.id ? { ...entry, note } : entry))
            }} onKeyDown={event => {
              if (!event.nativeEvent.isComposing && ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape')) {
                event.preventDefault()
                event.stopPropagation()
                event.nativeEvent?.stopImmediatePropagation?.()
                if (draft === annotation && event.key === 'Enter') saveDraft()
                else { setDraft(undefined); setSelected(undefined); rootRef.current?.focus() }
              }
            }} />
            {draft === annotation ? <button type="button" className="dcsiv-note-remove" aria-label={t('sketchTextDone')} title={t('sketchTextDone')} disabled={!draft.note.trim()} onClick={saveDraft}><IconCheckOutline16 /></button> : null}
            <button type="button" className="dcsiv-note-remove" aria-label={t(draft === annotation ? 'cancel' : 'imageRemoveAnnotation')} onClick={() => {
              if (draft === annotation) setDraft(undefined)
              else setAnnotations(current => current.filter(entry => entry.id !== annotation.id))
              setSelected(undefined)
              rootRef.current?.focus()
            }}><IconCloseOutline16 /></button>
          </div> : null}
        </div>)}
      </main>
      {erasing ? <div className="dcsiv-erase-bar" role="toolbar" aria-label={t('imageErase')}>
        <span>{t('imageEraseHint')}</span>
        <label>{t('imageBrushSize')}<input type="range" min="0.01" max="0.15" step="0.01" value={brush} onChange={event => setBrush(Number(event.target.value))} /></label>
        <button type="button" className="dcsiv-button" disabled={strokes.length === 0 || sending} onClick={() => setStrokes(current => current.slice(0, -1))}>{t('imageUndo')}</button>
        <button type="button" className="dcsiv-button" disabled={sending} onClick={() => { setErasing(undefined); setStrokes([]) }}>{t('cancel')}</button>
        <button type="button" className="dcsiv-button dcsiv-primary" data-state={sendFailed ? 'failed' : undefined} disabled={strokes.length === 0 || sending} onClick={() => { void sendMask() }}>{sending ? t('imageEditPreparing') : sendFailed ? t('imageEditFailed') : t('imageSend')}</button>
      </div> : null}
      {erasing && brushCursor ? <span className="dcsiv-brush-cursor" aria-hidden="true" style={{ left: brushCursor.left, top: brushCursor.top, width: brush * brushCursor.span, height: brush * brushCursor.span }} /> : null}
    </div>
  </dialog>
}

export { SUBSCRIPTION_IMAGE_VIEWER_CSS }
