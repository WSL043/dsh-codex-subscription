import { PhotoIcon, ArrowPathIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { officialImageTools } from './image-official-tools.js'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ImageLightbox } from './client-primitives.jsx'
import { useImageSource } from './use-image-source.js'
import { buildImageEditDraft } from './image-edit.js'
import { decodeImagePresentation } from './image-original-contract.js'
import { readOriginalImage, imageEditSource } from './original-image-download.js'

const imageDownloadName = attachment => {
  const fallback = 'codex-generated-image.png'
  if (typeof attachment?.name !== 'string') return fallback
  const cleaned = attachment.name.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-').replace(/[. ]+$/u, '').trim()
  if (cleaned === '') return fallback
  return cleaned.toLowerCase().endsWith('.png') ? cleaned : `${cleaned}.png`
}

function triggerBlobDownload(data, mediaType, filename) {
  const url = URL.createObjectURL(new Blob([data], { type: mediaType }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  try { anchor.click() } finally { anchor.remove(); URL.revokeObjectURL(url) }
}

function CodexGeneratedImage({ attachment, original, gallery, rpc, sessionId, loadImage, openSketchImage, attachForEdit, getImageViewer, getInternalImageViewer, t, features }) {
  const reload = useCallback(() => loadImage(attachment), [attachment, loadImage])
  const { src, failed: error, fail, retry, attempt, usable, loaded } = useImageSource(reload, attachment.attachmentId ?? attachment)
  const [nativePreview, setNativePreview] = useState()
  const triggerRef = useRef(null)
  const opening = useRef(0)
  useEffect(() => () => { opening.current++ }, [attachment])
  const label = attachment.name ?? t('imageLabel')
  const makeItem = (attachment, original, src) => {
    const downloadName = imageDownloadName(attachment)
    const editSource = imageEditSource(rpc, sessionId, original, src)
    return {
        id: attachment.attachmentId ?? downloadName,
        src,
        reload: () => loadImage(attachment),
        name: attachment.name ?? t('imageLabel'),
        width: original?.width ?? attachment.width,
        height: original?.height ?? attachment.height,
        bytes: original?.bytes ?? attachment.bytes,
        download: original === undefined ? undefined : {
          pendingLabel: t('imageDownloadPreparing'), errorLabel: t('imageDownloadFailed'),
          onInvoke: async ({ signal, onProgress } = {}) => triggerBlobDownload(await readOriginalImage(rpc, sessionId, original, { signal, onProgress }), original.mediaType, original.name),
        },
        actions: !features.imageEditing ? [] : [{
          id: 'continue-editing', label: t('imageEdit'), pendingLabel: t('imageEditPreparing'), errorLabel: t('imageEditFailed'), closeOnSuccess: true,
          onInvoke: ({ annotations = [], src: preview, signal }) => {
            const imageKey = String(attachment.attachmentId ?? 'image').replace(/^sha256:/u, '').slice(0, 12).replace(/[^a-zA-Z0-9_-]/gu, '_')
            const sourceName = annotations.length === 0 ? downloadName : `edit-${imageKey}.png`
            const referenceName = `pins-${imageKey}.png`
            return attachForEdit(editSource ?? preview, sourceName, buildImageEditDraft({ annotations, translate: t,
              sourceName, referenceName,
            }), annotations, referenceName, false, undefined, { signal })
          },
        }, ...officialImageTools({ src: editSource, name: downloadName, t, attachForEdit }), ...(features.imageSketch && openSketchImage ? [{id:'sketch',label:t('imageToSketch'),pendingLabel:t('imageEditPreparing'),errorLabel:t('imageEditFailed'),onInvoke:({ src: preview = src })=>openSketchImage(preview,downloadName)}] : [])],
    }
  }
  const openImage = async () => {
    if (src === undefined) return
    const revision = ++opening.current
    const selectedIndex = gallery?.findIndex(image => image.attachment === attachment || (attachment.attachmentId && image.attachment.attachmentId === attachment.attachmentId)) ?? -1
    const group = selectedIndex < 0 ? [...(gallery ?? []), { attachment, original }] : gallery
    const index = selectedIndex < 0 ? group.length - 1 : selectedIndex
    const items = group.map((image, position) => makeItem(image.attachment, image.original, position === index ? src : undefined))
    const request = {
      items,
      index,
      opener: triggerRef.current,
      source: 'codex-generated',
      scope: sessionId,
      annotations: features.imageViewer && features.imageAnnotations,
    }
    const internalViewer = features.imageViewer ? getInternalImageViewer?.() : undefined
    if (internalViewer?.open?.(request) === true) return
    const viewer = getImageViewer?.()
    if (typeof viewer?.open === 'function') {
      // Older external viewers require a URL for every image.
      const resolved = await Promise.all(group.map(async (image, position) => position === index ? items[index] :
        makeItem(image.attachment, image.original, await loadImage(image.attachment).catch(() => 'about:blank'))))
      if (revision !== opening.current || viewer.open({ ...request, items: resolved }) === true) return
    }
    if (features.imageViewer) internalViewer?.open?.({ ...request, annotations: false })
    else setNativePreview({ attachment, src })
  }
  if (error && !usable) {
    return <button type="button" className="codexGeneratedImageRetry" onClick={retry}>{t('imageLoadFailed')}</button>
  }
  return <>
    <button ref={triggerRef} type="button" className="codexGeneratedImageFrame" title={error ? t('imageLoadFailed') : t('imageOpen')} aria-label={t('imageOpenNamed').replace('{value}', String(label))} onClick={error ? retry : openImage}>
      {src === undefined ? <span>{t('imageLoading')}</span> : <img key={attempt} src={src} onError={fail} onLoad={loaded} alt={label} />}
      {error ? <span>{t('imageLoadFailed')}</span> : null}
    </button>
    {nativePreview?.attachment === attachment && !features.imageViewer ? <ImageLightbox
      src={nativePreview.src} alt={label} labels={{ dialog: t('imagePreview'), close: t('imageClosePreview') }}
      onClose={() => setNativePreview(undefined)} /> : null}
  </>
}

export function CodexImageToolRow({ presentation = 'tool', block, gallery, sessionId, rpc, loadImage, openSketchImage, attachForEdit, getImageViewer, getInternalImageViewer, t, preference }) {
  const features = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const settled = block?.kind === 'tool-result'
  const image = settled
    ? block.content.find(item => item?.type === 'image' && item.attachment !== undefined)
    : undefined
  const failed = settled && block.isError === true
  const state = !settled ? 'running' : failed ? 'error' : 'done'
  const status = !settled ? t('imageGenerating') : failed ? t('imageFailed') : t('imageGenerated')
  const error = failed
    ? block.content.find(item => item?.type === 'text' && typeof item.text === 'string')?.text
    : undefined
  const original = decodeImagePresentation(block?.meta)?.original
  const showOutput = presentation === 'output'
  const StateIcon = !settled ? ArrowPathIcon : failed ? ExclamationCircleIcon : PhotoIcon
  return <div className="codexImageTool" data-state={state}>
    {showOutput ? null : <div className="codexImageToolRow"><StateIcon className="codexImageToolIcon" aria-hidden="true" /><span className="codexImageToolTitle">{t('imageGenerate')}</span><span className="codexImageToolState">{status}</span></div>}
    {/* Retain the tool preview for inspection while the completed output renders independently. */}
    {(!showOutput && !settled) || image === undefined ? null : <div className="codexImageToolGallery"><CodexGeneratedImage features={features} attachment={image.attachment} original={original} gallery={gallery} rpc={rpc} sessionId={sessionId} loadImage={loadImage} openSketchImage={openSketchImage} attachForEdit={attachForEdit} getImageViewer={getImageViewer} getInternalImageViewer={getInternalImageViewer} t={t} /></div>}
    {!showOutput && typeof block?.meta?.requestedModel === 'string' ? <details className="codexImageDetails"><summary>{t('imageDetails')}</summary><p>{t('imageRequestedModel')}: {block.meta.requestedModel.slice(0,100)}<br />{t('imageReportedModel')}: {typeof block.meta.reportedModel === 'string' ? block.meta.reportedModel.slice(0,100) : t('imageModelUnreported')}<br />{t('imageRequestedSize')}: {String(block.meta.requestedSize ?? 'auto').slice(0,40)} · {t('imageActualSize')}: {original?.width} × {original?.height}</p></details> : null}
    {error === undefined ? null : <p className="codexImageToolError">{error}</p>}
  </div>
}

export function CodexImageOutput({ node, ...props }) {
  const gallery = node.data.blocks.flatMap(block => block.content.filter(item => item?.type === 'image' && item.attachment).map(item => ({ attachment: item.attachment, original: decodeImagePresentation(block?.meta)?.original })))
  return <div className="codexImageOutput">{node.data.blocks.map(block => <CodexImageToolRow key={block.toolCallId} block={block} gallery={gallery} {...props} presentation="output" />)}</div>
}
