import { useEffect, useState, useSyncExternalStore } from 'react'
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
  }, ...(settings.imageSketch && props.openSketchImage ? [{id:'sketch',label:t('imageToSketch'),pendingLabel:t('imageEditPreparing'),errorLabel:t('imageEditFailed'),onInvoke:()=>props.openSketchImage(item.src,item.name)}] : [])] : [] }], opener, source: sourceInDraft ? 'codex-draft' : 'codex-message',
  annotations: settings.imageAnnotations })
}

export function ComposerImagePreviews(props) {
  const { attachments, service, nativeAttachments, watchNativeAttachments, nativeTranslate } = props
  const entry = useSyncExternalStore(watchNativeAttachments, nativeAttachments)
  useEffect(() => {
    const current = service.getSnapshot()
    if (current?.source === 'codex-draft' && !attachments.some(item => item.id === current.items[0]?.id)) service.close()
  }, [attachments, service])
  useEffect(() => () => { if (service.getSnapshot()?.source === 'codex-draft') service.close() }, [service])
  if (!entry) return null
  const NativeAttachments = entry.component
  return <div style={{display:'contents'}} onClickCapture={event=>{
    const button=event.target.closest('button'), image=button?.querySelector('img')
    const item=image && attachments.find(item=>item.previewUrl===image.src)
    if (!item || event.button!==0 || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault();event.stopPropagation()
    openPreview(props,{id:item.id,src:item.previewUrl,name:item.file.name,width:item.width,height:item.height,bytes:item.file.size},button,true)
  }}><NativeAttachments {...props} t={nativeTranslate}/></div>
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
.codexMessageImages{display:flex;gap:10px;max-width:100%;padding:8px 0;overflow-x:auto}
.codexImageThumb{display:grid;place-items:center;width:64px;height:64px;padding:0;border:1px solid var(--dsw-alias-border-l2-darkmode-thin);border-radius:14px;background:var(--dsw-alias-interactive-bg-hover);color:inherit;overflow:hidden;cursor:zoom-in;flex:none}
.codexImageThumb img{width:100%;height:100%;object-fit:cover}
.codexImageThumb:focus-visible{outline:2px solid #4598ed;outline-offset:2px}
.codexMessageImages{flex-wrap:wrap}.codexMessageImages[data-align=end]{justify-content:flex-end}
.codexMessageImages[data-single=true] .codexImageThumb{width:240px;height:auto;max-width:100%}
.codexMessageImages[data-single=true] img{height:auto;max-height:320px;object-fit:contain}
`
