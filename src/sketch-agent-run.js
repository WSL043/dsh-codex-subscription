// One run spans tool calls; closing the view is not a run event.
// Short run handles are scoped to the unique documentId, never authentication tokens.
export function createSketchAgentRun({ execute, open, changed, busy = () => false, previewEnabled = () => false, idleMs = 180_000 }) {
  let state = 'idle', generation = 0, runNumber = 0, pending = false, runId, timer, completed
  const update = next => { state = next; changed(next) }
  const clear = () => { clearTimeout(timer); timer = undefined }
  const expire = () => { clear(); generation++; if (state !== 'stopped') update('failed') }
  return {
    get state() { return state },
    get locked() { return state === 'drawing' },
    stop() { clear(); generation++; update('stopped') },
    resume() { clear(); generation++; update('idle') },
    fail: expire,
    dispose() { clear(); generation++; state = 'idle' },
    async execute(request) {
      if (!request || typeof request !== 'object') throw Error('Invalid sketch request')
      if (state === 'stopped') throw Error('Drawing stopped by the user. Do not retry until they enable drawing again.')
      if (pending || busy()) throw Error('Sketch is being edited; retry after it settles')
      if (request.action !== 'inspect' && request.runId !== runId) throw Error('Drawing run changed; inspect again')
      if (state === 'finished' && completed?.key === JSON.stringify(request)) return completed.value
      if (state !== 'drawing' && request.action !== 'inspect') throw Error('Start drawing with inspect')
      clear()
      const version = generation
      pending = true
      try {
        if (state !== 'drawing') {runId=`run-${++runNumber}`;completed=undefined;update('drawing');open()}
        const value = await execute(request.action === 'finish' ? {...request, action:'save'} : request)
        if (version !== generation) throw Error('Drawing interrupted')
        if (request.action !== 'finish') return {...value,runId}
        const result = previewEnabled() ? await execute({action:'preview',documentId:value.documentId}) : value
        if (version !== generation) throw Error('Drawing interrupted')
        completed={key:JSON.stringify(request),value:{...result,runId}}
        update('finished')
        return completed.value
      } catch (error) {
        if (version === generation) {
          update('failed')
          throw new Error(`${error.message} Call inspect to obtain the current runId and revision before retrying.`,{cause:error})
        }
        throw error
      } finally {
        pending = false
        if (state === 'drawing') {timer=setTimeout(expire,idleMs);timer.unref?.()}
      }
    },
  }
}
