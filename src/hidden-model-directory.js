/**
 * Shares the subscription settings' hidden-model list with the host model
 * directory (what other pickers read through `llm.listModels`).
 *
 * `listModels` is also the host's send-time availability check, so a hidden
 * model stays listed while something still depends on it. Only the list is
 * filtered: `resolveModel`, `prepareCall` and `stream` keep resolving against
 * the unfiltered catalog, so an old session on a hidden model keeps working.
 */
const ids = models => models.map(model => model.id)
const same = (left, right) => left.length === right.length && left.every((id, index) => id === right[index])

/**
 * @param disabled - returns the user's hidden model ids (stale ids are harmless).
 * @param pinned - returns model ids that must stay listed: models of open
 *   sessions, the default model, and this plugin's own configured models.
 * @param fallback - returns the default model id, kept when everything is hidden.
 */
export function visibleModels(models, { disabled, pinned = () => [], fallback = () => undefined }) {
  const hidden = new Set(disabled())
  if (hidden.size === 0) return models
  const keep = new Set(pinned())
  const visible = models.filter(model => !hidden.has(model.id) || keep.has(model.id))
  if (visible.length > 0 || models.length === 0) return visible
  // The directory is never emptied by the hidden list.
  const preferred = fallback()
  return [models.find(model => model.id === preferred) ?? models[0]]
}

export function createHiddenModelDirectory({ provider, disabled, pinned, fallback, emit }) {
  const options = { disabled, pinned: () => { try { return pinned?.() ?? [] } catch { return [] } }, fallback }
  let catalog
  let emitted
  const filtered = models => visibleModels(models, options)
  const wrap = adapter => new Proxy(adapter, {
    get(target, property) {
      if (property === 'listModels') {
        return async (requested, ...rest) => {
          const models = await target.listModels(requested, ...rest)
          if (requested !== provider || !Array.isArray(models)) return models
          catalog = models
          const visible = filtered(models)
          emitted = ids(visible)
          return visible
        }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return {
    wrap,
    /** The hidden list changed: tell the host to reload its directory. */
    settingsChanged: (value, previous) => {
      if (same([...value ?? []].sort(), [...previous ?? []].sort())) return false
      emit()
      return true
    },
    /** Something a hidden model depends on may have changed; emit only if the listed set would differ. */
    dependenciesChanged: () => {
      if (catalog === undefined || emitted === undefined) return false
      if (same(ids(filtered(catalog)), emitted)) return false
      emit()
      return true
    },
  }
}
