// Acquire before React commits its busy state, including same-event re-entry.
export function createSketchOperationGate() {
  let running = false
  return {
    get running() {
      return running
    },
    async run(operation, { blocked = false, working, report }) {
      if (blocked || running) return false
      running = true
      try {
        working(true)
        report(null)
        await operation()
        return true
      } catch (error) {
        report(error)
        return false
      } finally {
        running = false
        working(false)
      }
    }
  }
}
