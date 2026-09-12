// Acquire before React commits its busy state, including same-event re-entry.
export function createSketchOperationGate() {
  let running = false
  return {
    get running() {
      return running
    },
    async run(operation, { blocked = false, working, report, rethrow = false }) {
      if (blocked || running) return false
      running = true
      try {
        working(true)
        report(null)
        await operation()
        return true
      } catch (error) {
        report(error)
        if (rethrow) throw error
        return false
      } finally {
        running = false
        working(false)
      }
    }
  }
}
