import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useImageSource } from './use-image-source.js'
import { buildImageEditDraft } from './image-edit.js'
import { officialImageTools } from './image-official-tools.js'
import { nativeComposerProps } from './composer-attachment-native.js'

function openPreview(props, item, opener, sourceInDraft = false, group = [item]) {
  const { service, preference, t, attachForEdit } = props
  const settings = preference.getSnapshot()
  const items = group.map(item => {
  const referenceName = `annotated-${String(item.name).replace(/\.[a-z0-9]+$/iu, '')}.png`
  return { ...item, actions: settings.imageEditing ? [{
    id: 'edit', label: t('imageEdit'), pendingLabel: t('imageEditPreparing'),
    errorLabel: t('imageEditFailed'), closeOnSuccess: true,
    onInvoke: ({ annotations, signal }) => attachForEdit(item.src, item.name,
      buildImageEditDraft({ annotations, translate: t, sourceName: item.name, referenceName }),
      annotations, referenceName, sourceInDraft, undefined, { signal, sourceId: sourceInDraft ? item.id : undefined }),
  }, ...officialImageTools({ src: item.src, name: item.name, t, attachForEdit, sourceInDraft }), ...(settings.imageSketch && props.openSketchImage ? [{id:'sketch',label:t('imageToSketch'),pendingLabel:t('imageEditPreparing'),errorLabel:t('imageEditFailed'),onInvoke:()=>props.openSketchImage(item.src,item.name)}] : [])] : [] }
  })
  service.open({ items, index: Math.max(0, items.findIndex(candidate => candidate.id === item.id)), opener, scope: props.sessionId, source: sourceInDraft ? 'codex-draft' : 'codex-message',
  annotations: settings.imageAnnotations })
}

export function ComposerImagePreviews(props) {
  const { attachments, service, nativeAttachments, watchNativeAttachments, nativeTranslate } = props
  const entry = useSyncExternalStore(watchNativeAttachments, nativeAttachments)
  useEffect(() => {
    const current = service.getSnapshot()
    if (current?.source === 'codex-draft' && current.items.some(image => !attachments.some(item => item.id === image.id))) service.close()
  }, [attachments, service])
  useEffect(() => () => { if (service.getSnapshot()?.source === 'codex-draft') service.close() }, [service])
  const latest = useRef(props)
  const root = useRef(null)
  latest.current = props
  // A window capture listener runs before document-level capture listeners such as the image-viewer bundle's native-image
  // bridge, which would otherwise take the click first. It only acts on this composer's own draft thumbnails.
  useEffect(() => {
    const onWindowClick = event => {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('button'), image = button?.querySelector(':scope > img')
      if (!button || !root.current?.contains(button)) return
      const item = image && latest.current.attachments.find(candidate => candidate.previewUrl === image.src)
      if (!item || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()
      const group = latest.current.attachments.filter(item => item.previewUrl).map(item => ({ id: item.id, src: item.previewUrl, name: item.file.name, width: item.width, height: item.height, bytes: item.file.size }))
      openPreview(latest.current, group.find(image => image.id === item.id), button, true, group)
    }
    window.addEventListener('click', onWindowClick, true)
    return () => window.removeEventListener('click', onWindowClick, true)
  }, [])
  if (!entry) return null
  const NativeAttachments = entry.component
  return <div ref={root} style={{display:'contents'}}><NativeAttachments {...nativeComposerProps(entry, props, nativeTranslate)}/></div>
}

function MessageImagePreview({ image, onOpen, ...props }) {
  const { loadImage, t } = props
  const reload = useCallback(() => image.attachment ? loadImage(image.attachment) : image.preview?.url, [image, loadImage])
  const { src, failed, retry, fail, attempt, usable, loaded } = useImageSource(reload, image.attachment?.attachmentId ?? image.preview?.url ?? image, image.preview?.url)
  const item = { ...(image.attachment ?? image.preview), ...(image.label ? { name: image.label } : {}) }
  return <button type="button" className="codexImageThumb" aria-label={`${t('imagePreview')} ${item.name ?? ''}`} disabled={!src && !failed}
    onClick={event => {
      if (failed) { retry(); return }
      onOpen(image, { id: item.attachmentId ?? src, src, reload, name: item.name ?? 'image.png', width: item.width, height: item.height }, event.currentTarget)
    }}>
    {failed && !usable ? t('accountRetry') : src ? <><img key={attempt} src={src} onError={fail} onLoad={loaded} alt={item.name ?? 'image'} />{failed ? t('accountRetry') : null}</> : '…'}
  </button>
}

export function MessageImagePreviews({ images, align, compact, thumbnail, ...props }) {
  const opening = useRef(0)
  useEffect(() => () => { opening.current++ }, [images])
  const onOpen = async (selected, item, opener) => {
    const revision = ++opening.current
    const group = await Promise.all(images.map(async image => {
      if (image === selected) return item
      const ref = image.attachment ?? image.preview
      const reload = () => image.attachment ? props.loadImage(image.attachment) : image.preview?.url
      const src = image.preview?.url ?? await reload().catch(() => 'about:blank')
      return { id: ref.attachmentId ?? src, src, reload, name: ref.name ?? 'image.png', width: ref.width, height: ref.height }
    }))
    if (revision === opening.current) openPreview(props, item, opener, false, group)
  }
  return <div className="codexMessageImages" data-align={align} data-single={images.length === 1 && !compact && !thumbnail} data-thumbnail={thumbnail || undefined}>
    {images.map((image, index) => <MessageImagePreview key={image.attachment?.attachmentId ?? image.preview?.url ?? index} image={image} onOpen={onOpen} {...props} />)}
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
.codexMessageImages[data-thumbnail=true]{padding:0}.codexMessageImages[data-thumbnail=true] img{object-fit:contain}
`
