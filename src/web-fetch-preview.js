const SLOT = 'tool.call.toolview'

export function webFetchPreview(block) {
  if (block?.kind !== 'tool-result' || block.isError || !Array.isArray(block.content)) return null
  let text = '', clipped = false
  for (const part of block.content) {
    if (part?.type !== 'text' || typeof part.text !== 'string' || !part.text) continue
    const room = 64000 - text.length
    if (part.text.length > room) clipped = true
    text += part.text.slice(0, room)
    if (clipped) break
  }
  text = text.replace(/^Fetched [^\r\n]*\r?\n\r?\nExternal web content follows\.[^\r\n]*\r?\n\r?\n/u, '')
  return text.trim() ? { text, partial: block.meta?.truncated === true || clipped } : null
}

/** Presentation only: keep model-facing output and source links untouched. */
export function readableWebFetchText(text) {
  const lines = text.split(/\r?\n/u)
  if (lines[1]?.includes('Source: open(') && lines[1].includes('[wordlim:')) {
    return lines.filter((_line, index) => index !== 1).map(line => line.replace(/^L\d+: ?/u, '')).join('\n')
  }
  return text
}

/** Wrap the public native entry; unloading always reveals the original row. */
export function installWebFetchPreview(ctx, component, locale) {
  const slots = ctx.slots
  if (typeof slots.entries !== 'function' || typeof slots.entriesOfSlot !== 'function' || typeof slots.subscribe !== 'function') return () => {}
  const registered = entry => slots.entries(SLOT).includes(entry)
  const findNative = () => slots.entriesOfSlot(SLOT).find(entry => entry.options.key === 'web_fetch'
    && entry.component !== component && (entry.options.priority ?? 0) >= 0
    && entry.locale === 'conversation' && !entry.inject && !entry.store && !entry.children
    && registered(entry))
  let native, dispose, syncing = false, stopped = false
  const nativeEntry = () => native && registered(native) ? native : undefined
  const sync = () => {
    if (stopped || syncing) return
    syncing = true
    try {
      if (native && !registered(native)) {
        native = undefined
        const release = dispose; dispose = undefined; release?.()
      }
      native ??= findNative()
      if (native && !dispose) dispose = slots.register({ name: SLOT, key: 'web_fetch', priority: -5,
        locale, inject: () => ({ nativeEntry, nativeT: ctx.locale.bind('conversation') }),
      }, component)
      else if (!native && dispose) { const release = dispose; dispose = undefined; release() }
    } finally { syncing = false }
  }
  const unsubscribe = slots.subscribe(SLOT, sync)
  sync()
  return () => { stopped = true; unsubscribe(); dispose?.() }
}
