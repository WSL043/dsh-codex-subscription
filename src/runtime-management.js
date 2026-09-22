import { randomUUID } from 'node:crypto'
import { SUBAGENT_RUNTIME_PACKAGE, SUBAGENT_RUNTIME_VERSION } from './subagent-runtime.js'

// DSH owns package locking, installation, rollback and script approval. This
// adapter accepts no package names, commands or paths from the browser.
export function createRuntimeManagement({ manager, inspect, active, selectDsh }) {
  let operation
  let state = { phase: 'idle', restartRequired: false }
  const supported = value => ['listBundles', 'installBundle', 'removeBundle', 'cancelInstall'].every(key => typeof value?.[key] === 'function')
  const status = async () => {
    const host = manager()
    let bundle
    let available = supported(host)
    try { if (available) bundle = (await host.listBundles()).find(value => value.name === SUBAGENT_RUNTIME_PACKAGE) }
    catch { available = false }
    const runtime = inspect()
    return { ...state, available, installed: runtime.installed, present: runtime.installed || runtime.present === true || bundle?.installed === true, removable: available && bundle?.installed === true && !bundle.readOnlyReason, active: active() }
  }
  const start = async action => {
    if (!['install', 'remove'].includes(action)) throw Error('invalid-action')
    if (operation) throw Error('busy')
    if (state.restartRequired) throw Error('restart-required')
    if (active() > 0) throw Error('active-tasks')
    const host = manager()
    if (!supported(host)) throw Error('unavailable')
    const requestId = randomUUID()
    // Reserve synchronously before any await, including the removal checks.
    const current = { action, requestId, host }
    operation = current
    state = { phase: action === 'install' ? 'installing' : 'removing', restartRequired: false }
    current.done = (async () => {
      try {
        if (action === 'remove') {
          const bundle = (await host.listBundles()).find(value => value.name === SUBAGENT_RUNTIME_PACKAGE)
          if (!bundle?.installed || bundle.readOnlyReason) throw Error('not-removable')
          await selectDsh()
        }
        const result = action === 'install'
          ? await host.installBundle(`${SUBAGENT_RUNTIME_PACKAGE}@${SUBAGENT_RUNTIME_VERSION}`, { enabled: false, requestId })
          : await host.removeBundle(SUBAGENT_RUNTIME_PACKAGE)
        if (result.application === 'cancelled') state = { phase: 'cancelled', restartRequired: false }
        else if (['applied', 'restart-required'].includes(result.application)) state = { phase: 'done', restartRequired: true }
        else state = { phase: 'failed', restartRequired: false, error: result.packageResult?.kind ?? result.error?.code ?? 'operation-error' }
      } catch (error) {
        state = { phase: 'failed', restartRequired: false, error: error.message === 'not-removable' ? 'not-removable' : 'operation-error' }
      } finally { operation = undefined }
    })()
    return status()
  }
  return {
    status, start,
    blocked: () => operation !== undefined || state.restartRequired,
    progress(value) {
      if (operation?.action === 'install' && value.requestId === operation.requestId && value.phase === 'applying') state.phase = 'applying'
    },
    async cancel() {
      const current = operation
      if (current?.action !== 'install') return status()
      const result = await current.host.cancelInstall(current.requestId)
      if (result.status === 'cancelled') await current.done
      return status()
    },
  }
}
