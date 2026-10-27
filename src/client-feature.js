// Share a feature's arrival without retaining a failed load forever.
export function createClientFeature(importFeature) {
  let value, flight
  let snapshot = Object.freeze({ status: 'idle' })
  const listeners = new Set()
  const publish = next => { snapshot = Object.freeze(next); for (const listener of [...listeners]) listener() }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    load() {
      if (value) return Promise.resolve(value)
      if (flight) return flight
      const operation = Promise.resolve().then(importFeature).then(module => {
        value = module
        publish({ status: 'ready', module })
        return module
      }, error => { publish({ status: 'error', error }); throw error }).finally(() => {
        if (flight === operation) flight = undefined
      })
      flight = operation
      publish({ status: 'loading' })
      return operation
    },
  }
}

// Commands wait for the mounted editor's existing restoration and permission gate.
export function createFeatureReadiness() {
  let value, failure
  const waiting = new Set()
  return {
    set(next) {
      value = next
      failure = undefined
      if (value) { for (const waiter of [...waiting]) waiter.resolve(value) }
    },
    wait(timeoutMs = 15_000) {
      if (value) return Promise.resolve(value)
      if (failure) return Promise.reject(failure)
      return new Promise((resolve, reject) => {
        const finish = (callback, result) => { clearTimeout(timer); waiting.delete(waiter); callback(result) }
        const waiter = { resolve: result => finish(resolve, result), reject: error => finish(reject, error) }
        const timer = setTimeout(() => waiter.reject(Error('Sketch editor is not ready; reopen the board and retry')), timeoutMs)
        waiting.add(waiter)
      })
    },
    cancel(error) {
      value = undefined
      for (const waiter of [...waiting]) waiter.reject(error)
    },
    fail(error) {
      failure = error
      value = undefined
      for (const waiter of [...waiting]) waiter.reject(error)
    },
  }
}
