import { PhotoIcon, ArrowPathIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { buildImageEditDraft } from './image-edit.js'
import { decodeImagePresentation } from './image-original-contract.js'
import { readOriginalImage } from './original-image-download.js'

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

function CodexGeneratedImage({ attachment, original, rpc, sessionId, loadImage, openSketchImage, attachForEdit, getImageViewer, getInternalImageViewer, t, features }) {
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState(false)
  const [src, setSrc] = useState()
  const triggerRef = useRef(null)
  useEffect(() => {
    let live = true
    setError(false)
    setSrc(undefined)
    void Promise.resolve().then(() => loadImage(attachment))
      .then(value => { if (live) setSrc(value) })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [attachment, loadImage, attempt])
  const label = attachment.name ?? t('imageLabel')
  const downloadName = imageDownloadName(attachment)
  const downloadOriginal = async ({ signal, onProgress } = {}) => {
    if (original === undefined) return
    triggerBlobDownload(await readOriginalImage(rpc, sessionId, original, { signal, onProgress }), original.mediaType, original.name)
  }
  const openImage = () => {
    if (src === undefined) return
    const request = {
      items: [{
        id: attachment.attachmentId ?? downloadName,
        src,
        name: label,
        width: attachment.width,
        height: attachment.height,
        bytes: attachment.bytes,
        download: original === undefined ? undefined : {
          pendingLabel: t('imageDownloadPreparing'),
          errorLabel: t('imageDownloadFailed'),
          onInvoke: downloadOriginal,
        },
        actions: !features.imageEditing ? [] : [{
          id: 'continue-editing',
          label: t('imageEdit'),
          pendingLabel: t('imageEditPreparing'),
          errorLabel: t('imageEditFailed'),
          closeOnSuccess: true,
          onInvoke: ({ annotations = [] }) => {
            const imageKey = String(attachment.attachmentId ?? 'image').replace(/[^a-zA-Z0-9_-]/g, '_')
            const sourceName = annotations.length === 0 ? downloadName : `codex-edit-${imageKey}-source.png`
            const referenceName = `codex-edit-${imageKey}-annotations.png`
            return attachForEdit(src, sourceName, buildImageEditDraft({
              annotations, translate: t, width: attachment.width, height: attachment.height,
              sourceName, referenceName,
            }), annotations, referenceName)
          },
        }, ...(features.imageSketch && openSketchImage ? [{id:'sketch',label:t('imageToSketch'),pendingLabel:t('imageEditPreparing'),errorLabel:t('imageEditFailed'),onInvoke:()=>openSketchImage(src,downloadName)}] : [])],
      }],
      opener: triggerRef.current,
      source: 'codex-generated',
      annotations: features.imageViewer && features.imageAnnotations,
    }
    if (features.imageViewer && getInternalImageViewer?.()?.open?.(request) === true) return
    const viewer = getImageViewer?.()
    if (viewer?.open?.(request) === true) return
    if (features.imageViewer) getInternalImageViewer?.()?.open?.({ ...request, annotations: false })
    else window.open(src, '_blank', 'noopener,noreferrer')
  }
  if (error) {
    return <button type="button" className="codexGeneratedImageRetry" onClick={() => setAttempt(value => value + 1)}>{t('imageLoadFailed')}</button>
  }
  return <button ref={triggerRef} type="button" className="codexGeneratedImageFrame" title={t('imageOpen')} aria-label={t('imageOpenNamed').replace('{value}', String(label))} onClick={openImage}>
    {src === undefined ? <span>{t('imageLoading')}</span> : <img src={src} alt={label} />}
  </button>
}

export function CodexImageToolRow({ presentation = 'tool', block, sessionId, rpc, loadImage, openSketchImage, attachForEdit, getImageViewer, getInternalImageViewer, t, preference }) {
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
    {showOutput ? null : <div className="codexImageToolRow"><StateIcon className="codexImageToolIcon" aria-hidden="true" /><span className="codexImageToolTitle">{t('imageGenerate')}</span><span className="codexImageBeta">{t('imageBeta')}</span><span className="codexImageToolState">{status}</span></div>}
    {!showOutput || image === undefined ? null : <div className="codexImageToolGallery"><CodexGeneratedImage features={features} attachment={image.attachment} original={original} rpc={rpc} sessionId={sessionId} loadImage={loadImage} openSketchImage={openSketchImage} attachForEdit={attachForEdit} getImageViewer={getImageViewer} getInternalImageViewer={getInternalImageViewer} t={t} /></div>}
    {!showOutput && typeof block?.meta?.requestedModel === 'string' ? <details className="codexImageDetails"><summary>{t('imageDetails')}</summary><p>{t('imageRequestedModel')}: {block.meta.requestedModel.slice(0,100)}<br />{t('imageReportedModel')}: {typeof block.meta.reportedModel === 'string' ? block.meta.reportedModel.slice(0,100) : t('imageModelUnreported')}<br />{t('imageRequestedSize')}: {String(block.meta.requestedSize ?? 'auto').slice(0,40)} · {t('imageActualSize')}: {original?.width} × {original?.height}</p></details> : null}
    {error === undefined ? null : <p className="codexImageToolError">{error}</p>}
  </div>
}

export function CodexImageOutput({ node, ...props }) {
  return <div className="codexImageOutput">{node.data.blocks.map(block => <CodexImageToolRow key={block.toolCallId} block={block} {...props} presentation="output" />)}</div>
}
