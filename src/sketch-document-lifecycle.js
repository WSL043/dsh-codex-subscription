import { createSketchLayers, MAX_SKETCH_LAYERS } from './sketch-layers.js'
import { SKETCH_SIZE } from './sketch-document.js'
import { identifyObjects } from './sketch-objects.js'
import {
  sketchDrafts,
  decodeSketchImages,
  importSketchImage
} from './sketch-drafts.js'
import { decodeSketchDocument, importSketchPsd } from './sketch-formats.js'

// Document ownership is independent of the dialog and its render cycle.
export function createSketchDocumentLifecycle(
  state,
  {
    sessionId,
    t,
    schedule,
    checkpoint,
    cache,
    setSelection,
    setTextEdit,
    setRecovered,
    store = sketchDrafts,
    decodeImages = decodeSketchImages,
    readImage = importSketchImage
  }
) {
  const {
    doc,
    undo,
    redo,
    images,
    saved,
    dirty,
    documentId,
    documentRevision
  } = state
  const hasContent = () =>
    doc.current.layers.some((layer) => layer.image || layer.strokes.length)
  const save = async (name) => {
    const savingDocument = documentId.current,
      savingRevision = documentRevision.current
    const row = {
      id: saved.current?.id ?? crypto.randomUUID(),
      name:
        name?.trim() ||
        saved.current?.name ||
        `${t('sketchTitle')} ${new Date().toLocaleString()}`,
      updated: Date.now(),
      doc: structuredClone(doc.current)
    }
    try {
      await store('save', row, sessionId)
    } catch (error) {
      if (error.code === 'SKETCH_DRAFT_LIMIT')
        error.message = t('sketchDraftLimit')
      if (error.code === 'SKETCH_STORAGE_LIMIT')
        error.message = t('sketchStorageLimit')
      throw error
    }
    if (documentId.current === savingDocument) {
      saved.current = { id: row.id, name: row.name }
      if (documentRevision.current === savingRevision) {
        dirty.current = false
        setRecovered(false)
      }
    }
  }
  const saveChanges = async () => {
    if (!dirty.current) return
    if (hasContent() || saved.current) return save()
    const id = documentId.current,
      revision = documentRevision.current
    await store('clearRecovery', sessionId)
    // An edit made during the storage write still needs a checkpoint.
    if (documentId.current === id && documentRevision.current === revision) {
      dirty.current = false
      setRecovered(false)
    }
  }
  const replace = (next, decoded, identity) => {
    documentId.current = crypto.randomUUID()
    documentRevision.current++
    doc.current = identifyObjects(structuredClone(next))
    setSelection(null)
    setTextEdit(null)
    images.current = decoded
    cache.current.clear()
    undo.current = []
    redo.current = []
    saved.current = identity
    dirty.current = false
    schedule()
  }
  const fresh = async () => {
    await saveChanges()
    replace(createSketchLayers(), new Map(), null)
  }
  const load = async (row) => {
    if (row.id === saved.current?.id) return
    row = await store('get', row.id)
    if (!row) throw Error('Draft no longer exists')
    await saveChanges()
    const decoded = new Map()
    await decodeImages(row.doc, decoded)
    replace(row.doc, decoded, { id: row.id, name: row.name })
  }
  const importImage = async (file) => {
    if (
      file.name?.toLowerCase().endsWith('.psd') ||
      file.name?.toLowerCase().endsWith('.dsh-sketch.json')
    ) {
      if (file.size > 32 * 1024 * 1024) throw Error('File exceeds 32 MB')
      const next = file.name.toLowerCase().endsWith('.psd')
        ? await importSketchPsd(file)
        : decodeSketchDocument(await file.text())
      const decoded = new Map()
      await decodeImages(next, decoded)
      await saveChanges()
      replace(next, decoded, null)
      dirty.current = true
      return
    }
    if (doc.current.layers.length >= MAX_SKETCH_LAYERS)
      throw Error('Layer limit')
    const image = await readImage(file),
      w = doc.current.width ?? SKETCH_SIZE,
      h = doc.current.height ?? SKETCH_SIZE
    const scale = Math.min(w / image.width, h / image.height),
      width = (image.width * scale) / w,
      height = (image.height * scale) / h
    const layer = {
      id: doc.current.nextId,
      name: file.name?.slice(0, 40) || t('sketchImport'),
      visible: true,
      strokes: [],
      image: {
        src: image.src,
        x: (1 - width) / 2,
        y: (1 - height) / 2,
        width,
        height
      }
    }
    await decodeImages({ layers: [layer] }, images.current)
    checkpoint()
    doc.current = {
      ...doc.current,
      nextId: layer.id + 1,
      active: layer.id,
      layers: [...doc.current.layers, layer]
    }
    schedule()
  }
  const restore = async (isCurrent = () => true) => {
    if (dirty.current || hasContent()) return
    const id = documentId.current,
      revision = documentRevision.current
    const recovery = await store('recover', sessionId)
    const archived = state.restoreId.current
    const row = recovery ?? (archived ? await store('get', archived) : null)
    const decoded = new Map()
    if (row) await decodeImages(row.doc, decoded)
    if (
      !isCurrent() ||
      documentId.current !== id ||
      documentRevision.current !== revision ||
      dirty.current
    )
      return
    if (row) {
      replace(
        row.doc,
        decoded,
        recovery ? null : { id: row.id, name: row.name }
      )
      dirty.current = Boolean(recovery)
      setRecovered(Boolean(recovery))
    }
    state.restoreId.current = null
  }
  return {
    hasContent,
    save,
    saveChanges,
    replace,
    fresh,
    load,
    importImage,
    restore
  }
}
