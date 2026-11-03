import { DEFAULT_REASONING_EFFORTS, normalizeDisabledModels } from './settings-contract.js'

const PROVIDER = 'openai-codex'
export const SUBAGENT_EFFORTS = Object.freeze(DEFAULT_REASONING_EFFORTS.filter(value => value !== 'ultra'))
export const normalizeSubagentModel = value => typeof value === 'string' && /^[a-z][a-z0-9._-]{0,79}$/u.test(value) ? value : ''
export const normalizeSubagentEffort = value => SUBAGENT_EFFORTS.includes(value) ? value : 'auto'
const permits = (routes, id) => Array.isArray(routes) && routes.some(route => route.provider === PROVIDER && route.model === id)

export function createSubagentDefaults({ readSettings, catalog, modelSelection, projections }) {
  function models(settings, selection) {
    if (!selection || typeof selection.enabled !== 'boolean') return []
    const disabled = normalizeDisabledModels(settings.disabledModels)
    return catalog.getModels().filter(model => !disabled.includes(model.id)
      && (!selection.enabled || permits(selection.allowedModels, model.id))).map(model => ({
      id: model.id,
      name: model.name,
      efforts: SUBAGENT_EFFORTS.filter(effort => catalog.metadata(model.id)?.thinkingLevelMap?.[effort] != null),
    }))
  }

  return {
    list() {
      try { return models(readSettings(), modelSelection()) }
      catch { return [] }
    },
    async ready(requested = {}, signal) {
      if (Object.keys(requested).length > 0 || catalog.getModels().length > 0) return
      const settings = readSettings()
      if (!normalizeSubagentModel(settings.subagentDefaultModel) && normalizeSubagentEffort(settings.subagentDefaultEffort) === 'auto') return
      try { await catalog.refresh({ signal }) }
      catch { signal?.throwIfAborted() }
    },
    resolve(parent, requested = {}) {
      if (Object.keys(requested).length > 0) return requested
      const settings = readSettings()
      const chosen = normalizeSubagentModel(settings.subagentDefaultModel)
      const effort = normalizeSubagentEffort(settings.subagentDefaultEffort)
      if (!chosen && effort === 'auto') return requested
      const parentRoute = parent.session.requestHeader?.()?.config ?? parent.options ?? {}
      const id = chosen || (parentRoute.provider === PROVIDER ? parentRoute.model : undefined)
      if (!id) return requested
      try {
        const model = models(settings, modelSelection()).find(candidate => candidate.id === id)
        const registry = projections()
        if (!model || typeof registry?.stateOf !== 'function') return requested
        const allowed = registry.stateOf(parent.session, 'subagentModelSelectionPolicy')
        if (allowed != null && !permits(allowed, id)) return requested
        if (!chosen && !model.efforts.includes(effort)) return requested
        return {
          ...(chosen ? { model: chosen } : {}),
          ...(model.efforts.includes(effort) ? { reasoningEffort: effort === 'off' ? 'none' : effort } : {}),
        }
      } catch { return requested }
    },
  }
}
