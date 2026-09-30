import { CHANNEL, unwrap } from './rpc-contract.js'

const INITIAL = Object.freeze({
  status: 'loading',
  available: false,
  managed: false,
  provider: undefined,
  model: undefined,
  reasoningEffort: undefined,
  saving: false,
  error: false,
})

const adopt = value => ({
  status: 'ready',
  error: false,
  available: value?.available === true,
  managed: value?.managed === true,
  provider: value?.provider,
  model: value?.model,
  reasoningEffort: value?.reasoningEffort,
})

/**
 * Read and update the DSH default model behind one settings control. The Host
 * owns the value, so a load always replaces the local projection; a rejected
 * write keeps the last known value and only raises the error flag.
 */
export function createDefaultModelController(rpc) {
  let snapshot = INITIAL
  let disposed = false
  let generation = 0
  const listeners = new Set()
  const publish = next => {
    snapshot = Object.freeze({ ...snapshot, ...next })
    for (const listener of listeners) listener()
  }
  const load = async () => {
    const current = ++generation
    try {
      const value = unwrap(await rpc.call(CHANNEL, 'default-model/status', {}))
      if (disposed || current !== generation) return
      publish(adopt(value))
    } catch {
      if (disposed || current !== generation) return
      publish({ status: 'error', error: true })
    }
  }
  const select = async model => {
    if (disposed) return false
    const current = ++generation
    publish({ saving: true, error: false })
    try {
      const value = unwrap(await rpc.call(CHANNEL, 'default-model/select', { model }))
      if (disposed || current !== generation) return false
      publish({ ...adopt(value), saving: false })
      return true
    } catch {
      if (disposed || current !== generation) return false
      publish({ saving: false, error: true })
      return false
    }
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    load,
    select,
    dispose: () => {
      disposed = true
      generation += 1
      listeners.clear()
    },
  })
}
