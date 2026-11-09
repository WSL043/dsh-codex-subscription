const slot = 'conversation.input.model'

export function registerLegacyModelPicker(slots, preference, props, component) {
  return slots.inject(slot, () => {
    let dispose
    const sync = () => {
      const state = preference.getSnapshot()
      if (state.status === 'ready' && state.composerModelPicker === 'legacy') {
        // Native owns its label child. Lower-numbered third-party overrides keep priority.
        if (!dispose && !slots.entries(slot).some(entry => entry.options.priority === -1)) {
          dispose = slots.register({ name: slot, priority: -1, inject: props }, component)
        }
      } else {
        dispose?.()
        dispose = undefined
      }
    }
    sync()
    const unwatch = preference.subscribe(sync)
    return () => { unwatch(); dispose?.() }
  })
}
