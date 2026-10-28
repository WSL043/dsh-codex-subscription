/**
 * DSH owns the model a freshly created agent starts on. This module is the
 * subscription plugin's read/write surface over that service: the settings
 * surface edits the single live selection instead of keeping a second copy, so
 * what the user sees is exactly what the next conversation will use.
 */
export const DEFAULT_MODEL_PROVIDER = 'openai-codex'
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u
const EFFORT_ID = /^[a-z][a-z0-9_-]{0,31}$/u

/** A rejected default-model request carrying its stable public reason. */
export class DefaultModelError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'DefaultModelError'
    this.code = code
  }
}

export const validDefaultModelId = value => typeof value === 'string' && MODEL_ID.test(value)

/** Project a live selection onto the settings-safe shape; unknown values drop out. */
export function normalizeDefaultSelection(value) {
  return {
    provider: typeof value?.provider === 'string' && value.provider.length > 0 && value.provider.length <= 128 ? value.provider : undefined,
    model: validDefaultModelId(value?.model) ? value.model : undefined,
    reasoningEffort: typeof value?.reasoningEffort === 'string' && EFFORT_ID.test(value.reasoningEffort) ? value.reasoningEffort : undefined,
  }
}

/**
 * Sample the default-model service per call: the service can mount after this
 * plugin. A write verifies its own read-back, because a deployment without a
 * configuration editor ignores `saveSelection`; the user must see that instead
 * of a selection that will never apply.
 * @param resolveService - reads the optional DSH `agentDefaultModel` service.
 * @param listModels - optional account catalog used to reject unknown models.
 */
export function createDefaultModelController({ resolveService, resolveEditor, listModels } = {}) {
  let writes = Promise.resolve()
  const enqueue = operation => {
    const result = writes.then(operation)
    writes = result.catch(() => {})
    return result
  }
  const service = () => {
    try { return resolveService?.() } catch { return undefined }
  }
  const read = () => {
    const current = service()
    if (current === undefined || typeof current.currentSelection !== 'function') return undefined
    try { return normalizeDefaultSelection(current.currentSelection()) } catch { return undefined }
  }
  const resetTarget = () => {
    try {
      const editor = resolveEditor?.()
      if (typeof editor?.entries !== 'function' || typeof editor.edit !== 'function' || typeof editor.configuration !== 'function') return undefined
      const entries = editor.entries().filter(entry => entry.options?.name === '@deepseek-ai/dsh-agent-default-model')
      return entries.length === 1 ? { editor, entry: entries[0] } : undefined
    } catch { return undefined }
  }
  const status = () => {
    const selection = read()
    return {
      available: selection !== undefined,
      managed: selection?.provider === DEFAULT_MODEL_PROVIDER && selection.model !== undefined,
      ...(selection !== undefined && resetTarget() ? { resetAvailable: true } : {}),
      ...selection,
    }
  }
  const select = async request => {
    const model = request?.model
    if (!validDefaultModelId(model)) throw new DefaultModelError('invalid-model', 'Invalid default model')
    const catalog = typeof listModels === 'function' ? listModels() : undefined
    if (Array.isArray(catalog) && catalog.length > 0 && !catalog.includes(model)) {
      throw new DefaultModelError('invalid-model', 'Invalid default model')
    }
    return enqueue(async () => {
      const current = service()
      if (current === undefined || typeof current.saveSelection !== 'function') {
        throw new DefaultModelError('unavailable', 'This DSH deployment cannot save a default model')
      }
      const previous = read()
      // Re-picking the same model keeps the effort the user chose for it; a
      // different model starts from that model's own default effort.
      const reasoningEffort = previous?.provider === DEFAULT_MODEL_PROVIDER && previous.model === model
        ? previous.reasoningEffort
        : undefined
      await current.saveSelection({
        provider: DEFAULT_MODEL_PROVIDER,
        model,
        ...reasoningEffort === undefined ? {} : { reasoningEffort },
      })
      const applied = read()
      if (applied?.provider !== DEFAULT_MODEL_PROVIDER || applied.model !== model) {
        throw new DefaultModelError('unavailable', 'The default model could not be saved')
      }
      return status()
    })
  }
  const reset = () => enqueue(async () => {
    const target = resetTarget()
    if (!target || read() === undefined) throw new DefaultModelError('unavailable', 'This DSH deployment cannot restore its default model')
    // Returning the inherited raw configuration lets DSH remove the profile
    // override, preserving expressions, parent settings and unrelated entries.
    await target.editor.edit(target.entry, (_current, inherited) => inherited)
    const active = resetTarget()
    const row = active?.editor.configuration().find(item => item.entry === active.entry)
    if (!row || Object.keys(row.override).length !== 0 || read() === undefined) {
      throw new DefaultModelError('unavailable', 'The DSH default model could not be restored')
    }
    return status()
  })
  return Object.freeze({ status, select, reset })
}
