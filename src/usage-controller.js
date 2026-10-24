import { highestUsed, quotaRefreshMs } from './quota-cadence.js'

/** One live quota snapshot and polling loop for every mounted view. */
export function createUsageController({ request, now = Date.now, schedule = setTimeout, cancel = clearTimeout, listen, visible = () => true, onUpdate }) {
  let snapshot = Object.freeze({ usage: undefined, busy: false, error: undefined, now: now() })
  let generation = 0, consumers = 0, flight, timer, unlisten
  const listeners = new Set()
  const publish = next => { snapshot = Object.freeze(next); for (const listener of [...listeners]) listener() }
  const stopTimer = () => { if (timer !== undefined) cancel(timer); timer = undefined }
  const queue = () => {
    stopTimer()
    if (consumers === 0 || !visible()) return
    const windows = snapshot.usage?.rateLimits?.flatMap(limit => limit.windows) ?? []
    timer = schedule(() => { timer = undefined; void refresh().catch(() => {}) }, quotaRefreshMs(highestUsed(windows)))
  }
  const refresh = (force = false) => {
    if (flight) {
      if (force && !flight.force) {
        const current = generation
        return flight.promise.catch(() => {}).then(() => current === generation ? refresh(true) : undefined)
      }
      return flight.promise
    }
    stopTimer()
    const current = generation
    const operation = { force }
    operation.promise = Promise.resolve().then(() => current === generation ? request(force) : undefined).then(usage => {
      if (current === generation) {
        publish({ usage, busy: false, error: undefined, now: now() })
        onUpdate?.({ force })
      }
      return usage
    }).catch(error => {
      if (current === generation) publish({ ...snapshot, busy: false, error: error?.message ?? 'Could not read quota', now: now() })
      throw error
    }).finally(() => {
      if (flight === operation) { flight = undefined; queue() }
    })
    flight = operation
    publish({ ...snapshot, busy: true, now: now() })
    return operation.promise
  }
  const invalidate = ({ preserveUsage = false } = {}) => {
    generation += 1
    flight = undefined
    stopTimer()
    const usage = preserveUsage && snapshot.usage ? { ...snapshot.usage, rateLimits: snapshot.usage.rateLimits.map(limit => ({ ...limit, windows: limit.windows.map(({ forecast, ...window }) => window) })) } : undefined
    publish({ usage, busy: false, error: undefined, now: now() })
    if (consumers > 0 && visible()) void refresh().catch(() => {})
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    refresh,
    invalidate,
    retain() {
      consumers += 1
      if (consumers === 1) {
        unlisten = listen?.({ invalidate, wake: () => { if (visible()) void refresh().catch(() => {}); else stopTimer() } })
        invalidate()
      }
      let released = false
      return () => {
        if (released) return
        released = true
        consumers -= 1
        if (consumers === 0) {
          generation += 1; flight = undefined; stopTimer(); unlisten?.(); unlisten = undefined
          publish({ usage: undefined, busy: false, error: undefined, now: now() })
        }
      }
    },
  })
}
