import { PhotoIcon, ArrowPathIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { officialImageTools } from './image-official-tools.js'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
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
          onInvoke: ({ annotations = [], signal }) => {
            const imageKey = String(attachment.attachmentId ?? 'image').replace(/[^a-zA-Z0-9_-]/g, '_')
            const sourceName = annotations.length === 0 ? downloadName : `codex-edit-${imageKey}-source.png`
            const referenceName = `codex-edit-${imageKey}-annotations.png`
            return attachForEdit(editSource, sourceName, buildImageEditDraft({ annotations, translate: t,
              width: original?.width ?? attachment.width, height: original?.height ?? attachment.height, sourceName, referenceName,
            }), annotations, referenceName, false, undefined, { signal })
          },
        }, ...officialImageTools({ src: editSource, name: downloadName, t, attachForEdit }), ...(features.imageSketch && openSketchImage ? [{id:'sketch',label:t('imageToSketch'),pendingLabel:t('imageEditPreparing'),errorLabel:t('imageEditFailed'),onInvoke:()=>openSketchImage(src,downloadName)}] : [])],
    }
  }
  const openImage = async () => {
    if (src === undefined) return
    const revision = ++opening.current
    const items = await Promise.all((gallery ?? [{ attachment, original }]).map(async image => makeItem(image.attachment, image.original,
      image.attachment === attachment ? src : await loadImage(image.attachment).catch(() => 'about:blank'))))
    if (revision !== opening.current) return
    const request = {
      items,
      index: Math.max(0, items.findIndex(item => item.id === attachment.attachmentId)),
      opener: triggerRef.current,
      source: 'codex-generated',
      scope: sessionId,
      annotations: features.imageViewer && features.imageAnnotations,
    }
    if (features.imageViewer && getInternalImageViewer?.()?.open?.(request) === true) return
    const viewer = getImageViewer?.()
    if (viewer?.open?.(request) === true) return
    if (features.imageViewer) getInternalImageViewer?.()?.open?.({ ...request, annotations: false })
    else window.open(src, '_blank', 'noopener,noreferrer')
  }
  if (error && !usable) {
    return <button type="button" className="codexGeneratedImageRetry" onClick={retry}>{t('imageLoadFailed')}</button>
  }
  return <button ref={triggerRef} type="button" className="codexGeneratedImageFrame" title={error ? t('imageLoadFailed') : t('imageOpen')} aria-label={t('imageOpenNamed').replace('{value}', String(label))} onClick={error ? retry : openImage}>
    {src === undefined ? <span>{t('imageLoading')}</span> : <img key={attempt} src={src} onError={fail} onLoad={loaded} alt={label} />}
    {error ? <span>{t('imageLoadFailed')}</span> : null}
  </button>
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
