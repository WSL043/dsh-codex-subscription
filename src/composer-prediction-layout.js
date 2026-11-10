const pixels = value => Number.parseFloat(value) || 0

/** Convert the mirror's border-box height to the editor's CSS min-height. */
export function predictionMinHeight(height, style) {
  if (!Number.isFinite(height)) return null
  const inset = style.boxSizing === 'border-box' ? 0
    : pixels(style.paddingTop) + pixels(style.paddingBottom) + pixels(style.borderTopWidth) + pixels(style.borderBottomWidth)
  return Math.max(0, pixels(style.minHeight), height - inset)
}

// A slot may use display:contents. Mount inside the editor's actual box tree,
// within the host scrollport, so the theme's opaque input background stays below
// the prediction and the native maximum height/scrolling still applies.
export function predictionAnchor(editor) {
  const scroll = editor.closest('[data-input-scroll]')
  if (!scroll) return null
  let anchor = editor.parentElement
  while (anchor && anchor !== scroll && getComputedStyle(anchor).display === 'contents') anchor = anchor.parentElement
  return anchor && scroll.contains(anchor) ? anchor : null
}

function ownStyle(element, property) {
  const read = () => ({ value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) })
  let previous = read()
  let applied = null
  const same = (a, b) => a?.value === b?.value && a?.priority === b?.priority
  return {
    set(value) {
      const current = read()
      if (applied && !same(current, applied)) previous = current
      element.style.setProperty(property, value)
      applied = read()
    },
    restore() {
      if (applied && same(read(), applied)) {
        if (previous.value) element.style.setProperty(property, previous.value, previous.priority)
        else element.style.removeProperty(property)
      }
      applied = null
      previous = read()
    },
  }
}

const textProperties = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
  'font-variant', 'font-feature-settings', 'font-variation-settings', 'font-kerning',
  'line-height', 'letter-spacing', 'word-spacing', 'text-indent', 'text-align',
  'text-transform', 'text-rendering', 'white-space', 'word-break', 'overflow-wrap',
  'tab-size', 'direction', 'writing-mode',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
]

/** Own only presentation and reversible height reservation; never edit the draft. */
export function attachPredictionLayout(editor, anchor, layer, onAnchorChange) {
  const height = ownStyle(editor, 'min-height')
  const position = ownStyle(anchor, 'position')
  let frame = 0
  let disposed = false
  let reanchoring = false
  const scroll = editor.closest('[data-input-scroll]')
  const initialScroll = scroll.scrollTop
  const card = editor.closest('[data-composer-card]')
  const placeholders = new Map()
  const resize = new ResizeObserver(schedule)
  const mutations = new MutationObserver(schedule)
  function restorePlaceholders() {
    for (const lease of placeholders.values()) lease.restore()
    placeholders.clear()
  }

  function layout() {
    frame = 0
    if (disposed) return
    if (!editor.isConnected || !layer.isConnected) { dispose(); return }
    const nextAnchor = predictionAnchor(editor)
    if (nextAnchor !== anchor) {
      // Class and stylesheet changes can replace the containing box without
      // replacing the editor. Rebind the portal without cancelling its draft.
      reanchoring = true
      layer.style.visibility = 'hidden'
      mutations.takeRecords()
      onAnchorChange(nextAnchor)
      return
    }
    const currentScroll = scroll.scrollTop
    // Measure the host's natural minimum, not our last reservation. These writes
    // and the replacement happen in one frame, before the browser paints.
    height.restore()
    position.restore()
    if (getComputedStyle(anchor).position === 'static') position.set('relative')
    const style = getComputedStyle(editor)
    if (!editor.offsetWidth || editor.offsetParent !== anchor) {
      layer.style.visibility = 'hidden'
      restorePlaceholders()
      mutations.takeRecords()
      return
    }
    for (const property of textProperties) layer.style.setProperty(property, style.getPropertyValue(property))
    layer.style.setProperty('--codex-prediction-ink', style.color)
    layer.style.left = `${editor.offsetLeft}px`
    layer.style.top = `${editor.offsetTop}px`
    layer.style.width = `${editor.offsetWidth}px`
    const minimum = predictionMinHeight(layer.offsetHeight, style)
    if (minimum !== null) height.set(`${Math.ceil(minimum)}px`)
    layer.style.visibility = 'visible'
    scroll.scrollTop = currentScroll
    for (const placeholder of card?.querySelectorAll('[data-composer-placeholder]') ?? []) {
      if (!placeholders.has(placeholder)) placeholders.set(placeholder, ownStyle(placeholder, 'visibility'))
      placeholders.get(placeholder).set('hidden')
    }
    // Our writes are already reflected in this layout; do not schedule ourselves
    // again through the ancestor style observer.
    mutations.takeRecords()
  }
  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(layout)
  }
  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    resize.disconnect()
    mutations.disconnect()
    window.removeEventListener('resize', schedule)
    document.fonts?.removeEventListener('loadingdone', schedule)
    editor.removeEventListener('input', dispose)
    editor.removeEventListener('compositionstart', dispose)
    layer.style.visibility = 'hidden'
    height.restore()
    position.restore()
    restorePlaceholders()
    // An empty draft may have been scrolled to read a long suggestion. Do not
    // carry that scroll position into the next draft or session.
    if (!reanchoring) scroll.scrollTop = initialScroll
  }

  resize.observe(layer)
  for (let element = editor; element; element = element.parentElement) {
    resize.observe(element)
    if (element === scroll) break
  }
  // Observe only this ancestry, not the conversation subtree. Theme changes can
  // arrive via body attributes, a stylesheet marker, or editor inline styles.
  for (let element = editor; element; element = element.parentElement) mutations.observe(element, { attributes: true })
  if (card) mutations.observe(card, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'style', 'contenteditable'] })
  window.addEventListener('resize', schedule)
  document.fonts?.addEventListener('loadingdone', schedule)
  editor.addEventListener('input', dispose)
  editor.addEventListener('compositionstart', dispose)
  layout()
  return dispose
}
