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
    kind: ['tool', 'mask', 'choice'].includes(action.kind) ? action.kind : 'edit',
    options: Array.isArray(action.options) ? action.options.filter(option => typeof option?.value === 'string' && typeof option?.label === 'string') : [],
    onInvoke: action.onInvoke,
  }]
}) : []

export function normalizeSubscriptionViewerRequest(request) {
  const rawItems = Array.isArray(request?.items) ? request.items : []
  const items = rawItems.flatMap((item, position) => {
    if (typeof item?.src !== 'string' || item.src === '') return []
    return [{
      id: typeof item.id === 'string' && item.id !== '' ? item.id : item.src,
      src: item.src,
      name: typeof item.name === 'string' && item.name !== '' ? item.name : `Image ${position + 1}`,
      width: boundedNumber(item.width, undefined),
      height: boundedNumber(item.height, undefined),
      bytes: boundedNumber(item.bytes, undefined),
      download: downloadOf(item.download),
      reload: typeof item.reload === 'function' ? item.reload : undefined,
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
    scope: typeof request?.scope === 'string' ? request.scope : '',
    annotations: request?.annotations !== false,
  }
}

const copyAnnotations = annotations => annotations.map(annotation => ({ ...annotation }))

/**
 * Local image viewer state for subscription-generated images.
 *
 * This stays private to subscription image cards, which need annotation and
 * edit actions that a host's generic native viewer may not implement.
 */
export class SubscriptionImageViewerService {
  #listeners = new Set()
  #revision = 0
  #snapshot
  #annotationsByImage = new Map()
  #operations = new Set()

  async invoke(action, context = {}, revision = this.#snapshot?.revision) {
    if (!this.#snapshot || this.#snapshot.revision !== revision) throw new Error('Image preview changed')
    this.#cancelOperations()
    const controller = new AbortController()
    this.#operations.add(controller)
    try {
      const value = await action.onInvoke({ ...context, signal: controller.signal })
      controller.signal.throwIfAborted()
      return value
    } finally { this.#operations.delete(controller) }
  }

  #cancelOperations() {
    for (const controller of this.#operations) controller.abort()
    this.#operations.clear()
  }

  cancelPending() { this.#cancelOperations() }

  constructor() {
    this.subscribe = listener => {
      this.#listeners.add(listener)
      return () => { this.#listeners.delete(listener) }
    }
    this.getSnapshot = () => this.#snapshot
    this.getAnnotationsSnapshot = () => {
      const prefix = `${this.#snapshot?.scope ?? ''}\0`
      return Object.fromEntries([...this.#annotationsByImage].filter(([id]) => id.startsWith(prefix))
        .map(([id, annotations]) => [id.slice(prefix.length), copyAnnotations(annotations)]))
    }
  }

  setAnnotations(imageId, annotations) {
    if (typeof imageId !== 'string' || imageId === '' || !Array.isArray(annotations)) return
    imageId = `${this.#snapshot?.scope ?? ''}\0${imageId}`
    if (annotations.length === 0) this.#annotationsByImage.delete(imageId)
    else {
      this.#annotationsByImage.delete(imageId)
      this.#annotationsByImage.set(imageId, copyAnnotations(annotations))
      while (this.#annotationsByImage.size > 128) this.#annotationsByImage.delete(this.#annotationsByImage.keys().next().value)
    }
  }

  open(request) {
    const normalized = normalizeSubscriptionViewerRequest(request)
    if (normalized === undefined) return false
    this.#cancelOperations()
    this.#revision += 1
    this.#snapshot = { ...normalized, revision: this.#revision }
    this.#emit()
    return true
  }

  close() {
    if (this.#snapshot === undefined) return
    this.#cancelOperations()
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
