// Adapted from WSL043/dsh-image-viewer 0.1.0-beta.9, MIT; see THIRD_PARTY_NOTICES.md.

const boundedNumber = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback

const downloadOf = value => typeof value?.onInvoke === 'function' ? {
  pendingLabel: typeof value.pendingLabel === 'string' && value.pendingLabel !== '' ? value.pendingLabel : undefined,
  errorLabel: typeof value.errorLabel === 'string' && value.errorLabel !== '' ? value.errorLabel : undefined,
  onInvoke: value.onInvoke,
} : undefined

const actionsOf = value => Array.isArray(value) ? value.flatMap((action, position) => {
  if (typeof action?.onInvoke !== 'function' || typeof action?.label !== 'string' || action.label.trim() === '') return []
  return [{
    id: typeof action.id === 'string' && action.id !== '' ? action.id : `action-${position + 1}`,
    label: action.label,
    pendingLabel: typeof action.pendingLabel === 'string' && action.pendingLabel !== '' ? action.pendingLabel : action.label,
    errorLabel: typeof action.errorLabel === 'string' && action.errorLabel !== '' ? action.errorLabel : action.label,
    closeOnSuccess: action.closeOnSuccess === true,
    onInvoke: action.onInvoke,
  }]
}) : []

export function normalizeSubscriptionViewerRequest(request) {
  const rawItems = Array.isArray(request?.items) ? request.items : []
  const items = rawItems.flatMap((item, position) => {
    if (typeof item?.src !== 'string' || item.src === '') return []
    return [{
      id: typeof item.id === 'string' && item.id !== '' ? item.id : `image-${position + 1}`,
      src: item.src,
      name: typeof item.name === 'string' && item.name !== '' ? item.name : `Image ${position + 1}`,
      width: boundedNumber(item.width, undefined),
      height: boundedNumber(item.height, undefined),
      bytes: boundedNumber(item.bytes, undefined),
      download: downloadOf(item.download),
      actions: actionsOf(item.actions),
    }]
  })
  if (items.length === 0) return undefined
  const requestedIndex = Number.isInteger(request?.index) ? request.index : 0
  return {
    items,
    index: Math.max(0, Math.min(items.length - 1, requestedIndex)),
    opener: typeof HTMLElement !== 'undefined' && request?.opener instanceof HTMLElement ? request.opener : undefined,
    source: typeof request?.source === 'string' ? request.source : 'dsh-codex-subscription',
    annotations: request?.annotations !== false,
  }
}

const copyAnnotations = annotations => annotations.map(annotation => ({ ...annotation }))

/**
 * Local image viewer state for subscription-generated images.
 *
 * This deliberately stays private to the subscription client. An installed
 * native image viewer can take the request first, while this service provides
 * the same baseline experience when that optional plugin is absent.
 */
export class SubscriptionImageViewerService {
  #listeners = new Set()
  #revision = 0
  #snapshot
  #annotationsByImage = new Map()

  constructor() {
    this.subscribe = listener => {
      this.#listeners.add(listener)
      return () => { this.#listeners.delete(listener) }
    }
    this.getSnapshot = () => this.#snapshot
    this.getAnnotationsSnapshot = () => Object.fromEntries(
      [...this.#annotationsByImage].map(([id, annotations]) => [id, copyAnnotations(annotations)]),
    )
  }

  setAnnotations(imageId, annotations) {
    if (typeof imageId !== 'string' || imageId === '' || !Array.isArray(annotations)) return
    if (annotations.length === 0) this.#annotationsByImage.delete(imageId)
    else this.#annotationsByImage.set(imageId, copyAnnotations(annotations))
  }

  open(request) {
    const normalized = normalizeSubscriptionViewerRequest(request)
    if (normalized === undefined) return false
    this.#revision += 1
    this.#snapshot = { ...normalized, revision: this.#revision }
    this.#emit()
    return true
  }

  close() {
    if (this.#snapshot === undefined) return
    const opener = this.#snapshot.opener
    this.#snapshot = undefined
    this.#emit()
    if (typeof window === 'undefined') opener?.focus()
    else {
      const focus = () => { opener?.focus() }
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(focus)
      else focus()
    }
  }

  #emit() {
    for (const listener of this.#listeners) listener()
  }
}
