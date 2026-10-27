/** Share one fetch per key while each caller owns only its own wait. */
export function createSharedRequests() {
  const flights = new Map()
  const cancelled = () => new DOMException('Shared request cancelled', 'AbortError')
  return {
    has: key => flights.has(key),
    clear(reason = cancelled()) {
      const previous = [...flights.values()]
      flights.clear()
      for (const flight of previous) flight.controller.abort(reason)
    },
    run(key, work, signal) {
      signal?.throwIfAborted()
      let flight = flights.get(key)
      if (!flight) {
        const controller = new AbortController()
        flight = { controller, waiters: 0, settled: false }
        flight.promise = Promise.resolve().then(() => {
          controller.signal.throwIfAborted()
          return work(controller.signal)
        }).then(value => {
          controller.signal.throwIfAborted()
          return value
        }).finally(() => {
          flight.settled = true
          if (flights.get(key) === flight) flights.delete(key)
        })
        flights.set(key, flight)
      }
      flight.waiters++
      return new Promise((resolve, reject) => {
        let done = false
        const finish = (callback, value) => {
          if (done) return
          done = true
          signal?.removeEventListener('abort', abort)
          flight.controller.signal.removeEventListener('abort', abort)
          if (--flight.waiters === 0 && !flight.settled) {
            if (flights.get(key) === flight) flights.delete(key)
            flight.controller.abort(cancelled())
          }
          callback(value)
        }
        const abort = () => finish(reject, signal?.aborted ? signal.reason : flight.controller.signal.reason)
        signal?.addEventListener('abort', abort, { once: true })
        flight.controller.signal.addEventListener('abort', abort, { once: true })
        flight.promise.then(value => finish(resolve, value), error => finish(reject, error))
        if (signal?.aborted || flight.controller.signal.aborted) abort()
      })
    },
  }
}
