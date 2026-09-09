import { useEffect, useRef, useState } from 'react'
import { buildImageEditDraft } from './image-edit.js'

function openPreview(props, item, opener, sourceInDraft = false) {
  const { service, preference, t, attachForEdit } = props
  const settings = preference.getSnapshot()
  const referenceName = `annotated-${item.name}.png`
  service.open({ items: [{ ...item, actions: settings.imageEditing ? [{
    id: 'edit', label: t('imageEdit'), pendingLabel: t('imageEditPreparing'),
    errorLabel: t('imageEditFailed'), closeOnSuccess: true,
    onInvoke: ({ annotations }) => attachForEdit(item.src, item.name,
      buildImageEditDraft({ annotations, translate: t, sourceName: item.name, referenceName }),
      annotations, referenceName, sourceInDraft),
  }] : [] }], opener, source: sourceInDraft ? 'codex-draft' : 'codex-message',
  annotations: settings.imageAnnotations })
}

export function ComposerImagePreviews(props) {
  const { attachments, canAcceptDrop, onAddImages, onRemoveImage, service, t } = props
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  useEffect(() => {
    const files = event => event.dataTransfer?.types.includes('Files')
    const reset = () => { depth.current = 0; setDragging(false) }
    const enter = event => { if (files(event)) { event.preventDefault(); depth.current++; setDragging(true) } }
    const over = event => { if (files(event)) { event.preventDefault(); event.dataTransfer.dropEffect = canAcceptDrop ? 'copy' : 'none' } }
    const leave = event => { if (files(event) && (--depth.current <= 0 || !event.relatedTarget)) reset() }
    const drop = event => { if (files(event)) { event.preventDefault(); reset(); if (canAcceptDrop) onAddImages([...event.dataTransfer.files]) } }
    const handlers = { dragenter: enter, dragover: over, dragleave: leave, drop }
    for (const [name, handler] of Object.entries(handlers)) document.addEventListener(name, handler)
    window.addEventListener('dragend', reset)
    return () => {
      for (const [name, handler] of Object.entries(handlers)) document.removeEventListener(name, handler)
      window.removeEventListener('dragend', reset)
    }
  }, [canAcceptDrop, onAddImages])
  useEffect(() => {
    const current = service.getSnapshot()
    if (current?.source === 'codex-draft' && !attachments.some(item => item.id === current.items[0]?.id)) service.close()
  }, [attachments, service])
  useEffect(() => () => { if (service.getSnapshot()?.source === 'codex-draft') service.close() }, [service])
  return <>
    {dragging ? <div className="codexImageDrop" role="status">{t(canAcceptDrop ? 'imageDropHere' : 'imageDropUnavailable')}</div> : null}
    {attachments.length ? <div className="codexDraftImages">
      {attachments.map(item => <span className="codexDraftImage" key={item.id}>
        <button type="button" className="codexImageThumb" aria-label={`${t('imagePreview')} ${item.file.name}`}
          onClick={event => openPreview(props, { id: item.id, src: item.previewUrl,
            name: item.file.name, width: item.width, height: item.height, bytes: item.file.size }, event.currentTarget, true)}>
          <img src={item.previewUrl} alt={item.file.name} />
        </button>
        <button type="button" className="codexImageRemove" aria-label={`${t('imageRemoveDraft')} ${item.file.name}`}
          onClick={() => onRemoveImage(item.id)}>×</button>
      </span>)}
    </div> : null}
  </>
}

function MessageImagePreview({ image, ...props }) {
  const { loadImage, t } = props
  const [src, setSrc] = useState(image.preview?.url)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (image.preview) { setSrc(image.preview.url); return }
    let live = true
    setSrc(undefined); setFailed(false)
    Promise.resolve().then(() => loadImage(image.attachment)).then(value => { if (live) setSrc(value) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [image, loadImage, attempt])
  const item = image.attachment ?? image.preview
  return <button type="button" className="codexImageThumb" aria-label={`${t('imagePreview')} ${item.name ?? ''}`} disabled={!src && !failed}
    onClick={event => {
      if (failed) { setAttempt(value => value + 1); return }
      openPreview(props, { id: item.attachmentId ?? src, src, name: item.name ?? 'image.png', width: item.width, height: item.height }, event.currentTarget)
    }}>
    {src ? <img src={src} alt={item.name ?? 'image'} /> : failed ? t('accountRetry') : '…'}
  </button>
}

export function MessageImagePreviews({ images, align, ...props }) {
  return <div className="codexMessageImages" data-align={align} data-single={images.length === 1}>
    {images.map((image, index) => <MessageImagePreview key={image.attachment?.attachmentId ?? image.preview?.url ?? index} image={image} {...props} />)}
  </div>
}

export const IMAGE_PREVIEWS_CSS = `
.codexDraftImages,.codexMessageImages{display:flex;gap:10px;max-width:100%;padding:8px 0;overflow-x:auto}
.codexDraftImage{position:relative;flex:none;margin:4px}
.codexImageThumb{display:grid;place-items:center;width:64px;height:64px;padding:0;border:1px solid var(--dsw-alias-border-l2-darkmode-thin);border-radius:14px;background:var(--dsw-alias-interactive-bg-hover);color:inherit;overflow:hidden;cursor:zoom-in;flex:none}
.codexImageThumb img{width:100%;height:100%;object-fit:cover}
.codexImageThumb:focus-visible,.codexImageRemove:focus-visible{outline:2px solid #4598ed;outline-offset:2px}
.codexImageRemove{font:18px/1 system-ui;position:absolute;right:-6px;top:-6px;display:grid;place-items:center;width:24px;height:24px;padding:0;border:1px solid var(--dsw-alias-border-l2-darkmode-thin);border-radius:50%;background:var(--dsw-alias-interactive-bg-hover);color:inherit;cursor:pointer}
.codexMessageImages{flex-wrap:wrap}.codexMessageImages[data-align=end]{justify-content:flex-end}
.codexMessageImages[data-single=true] .codexImageThumb{width:240px;height:auto;max-width:100%}
.codexMessageImages[data-single=true] img{height:auto;max-height:320px;object-fit:contain}
.codexImageDrop{position:fixed;inset:12px;z-index:9999;display:grid;place-items:center;pointer-events:none;border:2px dashed #4598ed;border-radius:20px;background:#4598ed22;color:inherit}
`
