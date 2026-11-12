import { unwrap } from './rpc-contract.js'

const slot = 'conversation.input.model'
const nativeLabel = 'conversation.input.model.label'
const nativeOptions = 'conversation.input.model.options'
const priority = -1
const priorityOf = entry => entry.options.priority ?? 0

// The standard picker declares the host's model-label extension point.
// Priority zero alone also matches third-party replacements.
const native = entry => priorityOf(entry) === 0 && entry.children?.[nativeLabel]?.kind === 'single'

export function watchComposerModelPickerConflict(manager, remote, update, onReset) {
  if (typeof manager?.listPlugins !== 'function') return
  let generation = 0
  let disposed = false
  const refresh = async () => {
    const current = ++generation
    try {
      const entries = unwrap(await manager.listPlugins())
      if (disposed || current !== generation) return
      // Claude Style customizes the standard picker without taking a slot entry.
      update(entries.some(entry => entry.moduleName === 'dsh-claude-style' && entry.enabled === true))
    } catch {
      if (!disposed && current === generation) update(true)
    }
  }
  update(true)
  const unwatch = remote?.$on?.('plugin-manager/changed', refresh)
  const unwatchReset = onReset?.(refresh)
  void refresh()
  return () => {
    disposed = true
    unwatch?.()
    unwatchReset?.()
    update(false)
  }
}

export function registerLegacyModelPicker(slots, preference, props, component, optionsComponent, labelComponent, watchLegacyConflict) {
  return slots.inject(slot, () => {
    let dispose
    let disposeOptions
    let disposeLabel
    let unwatchConflict
    let disposed = false
    let syncing = false
    const sync = () => {
      if (disposed || syncing) return
      syncing = true
      try {
        const others = slots.entries(slot).filter(entry => entry.component !== component)
        const owner = others[0]
        const supportsOptions = owner?.children?.[nativeOptions]?.kind === 'list'
        // Modern owners expose a shared additive contract. Plugin identities
        // matter only to the legacy replacement path, which lacks that contract.
        if (!supportsOptions && others.every(native)) unwatchConflict ??= watchLegacyConflict?.()
        else { unwatchConflict?.(); unwatchConflict = undefined }
        const state = preference.getSnapshot()
        const custom = others.every(native) && (state.composerModelPicker === 'legacy' || (
          state.composerModelPicker === 'auto' && !state.composerModelPickerConflict
        ))
        const enabled = state.status === 'ready' && custom
        if (enabled && !supportsOptions && !others.some(entry => priorityOf(entry) === priority)) {
          dispose ??= slots.register({ name: slot, priority, inject: props }, component)
        } else {
          dispose?.()
          dispose = undefined
        }
        // The native picker owns this child slot. Keep it mounted so Team and
        // future host options remain available alongside the subscription rows.
        const nativeOptionsEnabled = state.status === 'ready' && state.composerModelPicker !== 'dsh'
        if (nativeOptionsEnabled && supportsOptions && optionsComponent) {
          disposeOptions ??= slots.register({ name: nativeOptions, id: 'codex-subscription', inject: props }, optionsComponent)
        } else {
          disposeOptions?.()
          disposeOptions = undefined
        }
        // The label is non-interactive; never replace another contributor's label.
        const otherLabels = slots.entries(nativeLabel).filter(entry => entry.component !== labelComponent)
        if (disposeOptions && labelComponent && state.speedMode !== 'standard'
          && owner.children?.[nativeLabel]?.kind === 'single' && otherLabels.length === 0) {
          disposeLabel ??= slots.register({ name: nativeLabel, priority: 100, inject: props }, labelComponent)
        } else { disposeLabel?.(); disposeLabel = undefined }
        preference.setComposerModelPickerActive(Boolean(disposeOptions || dispose))
      } catch (error) {
        // A queued slot notification can run while Cordis is tearing down its owner.
        if (error?.code !== 'INACTIVE_EFFECT') throw error
      } finally { syncing = false }
    }
    const unwatch = preference.subscribe(sync)
    const unwatchSlot = slots.subscribe(slot, sync)
    const unwatchLabel = slots.subscribe(nativeLabel, sync)
    sync()
    return () => {
      disposed = true
      unwatch()
      unwatchSlot()
      unwatchLabel()
      unwatchConflict?.()
      dispose?.()
      disposeOptions?.()
      disposeLabel?.()
      preference.setComposerModelPickerActive(false)
    }
  })
}
