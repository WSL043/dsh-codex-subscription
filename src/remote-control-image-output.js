// Presentation metadata belongs to a projected item only, never DSH's stored message.
const images = new WeakMap()
const renderedSources = new WeakMap()
const metadata = message => {
  for (const block of message.content ?? []) if (block.type === 'text') {
    try { const value = JSON.parse(block.text); if (value && typeof value === 'object') return value } catch { /* ordinary tool text */ }
  }
  return undefined
}
export function rememberRemoteImage(item, message, assets) {
  const image = (message.content ?? []).find(block => block.type === 'image' && assets.has(block.attachment?.attachmentId))
  images.set(item, { asset: image ? assets.get(image.attachment.attachmentId) : undefined, state: metadata(message) })
}
const pathKey = value => typeof value === 'string' ? value.replaceAll('\\', '/').replace(/^\.\//u, '') : ''
const filename = value => pathKey(value).split('/').at(-1)
const matchesPresentedPath = (path, ref) => {
  const normal = value => /^[A-Za-z]:\//u.test(pathKey(path)) ? pathKey(value).toLowerCase() : pathKey(value)
  return normal(path) === normal(ref) || !/[\\/]/u.test(ref) && normal(filename(path)) === normal(filename(ref))
}
const fullPreview = item => item.arguments?.action === 'preview' && !item.arguments?.box && (!item.arguments?.mode || item.arguments.mode === 'full')

/** A native image or the exact full preview of a successfully finished sketch. */
export function withRemoteImageOutput(turn) {
  const previews = new Map(), outputs = [], sketchOutputs = new Set()
  let lastOutput = -1
  for (const [index, item] of turn.items.entries()) {
    const record = images.get(item)
    if (item.status !== 'completed' || !record) continue
    let asset
    if (item.type === 'imageGeneration') asset = record.asset
    else if (item.type === 'dynamicToolCall' && item.tool === 'codex_sketch' && item.success) {
      const state = record.state
      const key = typeof state?.documentId === 'string' && Number.isSafeInteger(state.revision) ? `${state.documentId}:${state.revision}` : null
      if (key && fullPreview(item) && record.asset) previews.set(key, record.asset)
      if (item.arguments?.action === 'finish') {
        asset = record.asset ?? (key ? previews.get(key) : undefined)
        if (asset) sketchOutputs.add(asset.fileId)
      }
    }
    if (asset) { if (!outputs.some(output => output.fileId === asset.fileId)) outputs.push(asset); lastOutput = index }
  }
  if (outputs.length === 0) return turn
  const answer = turn.items.findLastIndex((item, index) => index > lastOutput && item.type === 'agentMessage')
  if (answer < 0) return turn
  const item = turn.items[answer]
  let text = item.text
  for (const [fileId, previousUrl] of renderedSources.get(item) ?? []) {
    const current = outputs.find(output => output.fileId === fileId)
    if (current && current.downloadUrl !== previousUrl) text = text.replaceAll(previousUrl, current.downloadUrl)
  }
  // A single finished output can replace the explicit preview file the same turn
  // asked `present` to show. The path is only an identity; it is never opened.
  const presented = turn.items.filter(item => item.type === 'dynamicToolCall' && item.tool === 'present').flatMap(item => item.arguments?.files ?? []).map(file => file.path).filter(path => typeof path === 'string')
  if (outputs.length === 1 && sketchOutputs.has(outputs[0].fileId)) text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/gu, (whole, alt, source) => {
    const ref = source.trim().replace(/^<|>$/gu, '')
    return presented.some(path => matchesPresentedPath(path, ref)) ? `![${alt}](${outputs[0].downloadUrl})` : whole
  })
  for (const asset of outputs) if (!text.includes(asset.downloadUrl)) text += `\n\n![Image](${asset.downloadUrl})`
  const sources = new Map(outputs.map(asset => [asset.fileId, asset.downloadUrl]))
  renderedSources.set(item, sources)
  if (text === item.text) return turn
  const rendered = { ...item, text }
  renderedSources.set(rendered, sources)
  return { ...turn, items: turn.items.map((entry, index) => index === answer ? rendered : entry) }
}
