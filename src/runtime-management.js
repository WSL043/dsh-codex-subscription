import { randomUUID } from 'node:crypto'
import { SUBAGENT_RUNTIME_PACKAGE, matchingSubagentRuntimeVersion } from './subagent-runtime.js'
import { SUBAGENT_CODEX_VERSION } from './subagent-cli.js'

// DSH owns package locking, installation, rollback and script approval. This
// adapter accepts no package names, commands or paths from the browser.
export function createRuntimeManagement({ manager, inspect, active, selectDsh, cli, componentVersion = matchingSubagentRuntimeVersion }) {
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
    const cliState = cli?.inspect()
    const version = componentVersion()
    return { ...state, available, installable: available && version !== undefined && (!cli || cliState?.available === true), componentVersion: version,
      ...(cli ? { codexVersion: SUBAGENT_CODEX_VERSION, cliUpdateRequired: runtime.adapterInstalled === true && !runtime.installed } : {}), installed: runtime.installed,
      present: runtime.installed || runtime.present === true || bundle?.installed === true || cliState?.owned === true,
      removable: available && ((bundle?.installed === true && !bundle.readOnlyReason) || cliState?.owned === true), active: active() }
  }
  const start = async action => {
    if (!['install', 'remove'].includes(action)) throw Error('invalid-action')
    if (operation) throw Error('busy')
    if (state.restartRequired) throw Error('restart-required')
    if (active() > 0) throw Error('active-tasks')
    const host = manager()
    if (!supported(host)) throw Error('unavailable')
    const version = componentVersion()
    if (action === 'install' && (version === undefined || (cli && !cli.inspect().available))) throw Error('unavailable')
    const requestId = randomUUID()
    // Reserve synchronously before any await, including the removal checks.
    const current = { action, requestId, host, controller: new AbortController(), changed: false }
    operation = current
    state = { phase: action === 'install' ? 'installing' : 'removing', restartRequired: false }
    current.done = (async () => {
      try {
        let bundle
        if (action === 'remove') {
          bundle = (await host.listBundles()).find(value => value.name === SUBAGENT_RUNTIME_PACKAGE)
          if ((!bundle?.installed || bundle.readOnlyReason) && !cli?.inspect().owned) throw Error('not-removable')
          await selectDsh()
        }
        if ((action === 'install' && !inspect().adapterInstalled) || (action === 'remove' && bundle?.installed && !bundle.readOnlyReason)) {
          const result = action === 'install'
            ? await host.installBundle(`${SUBAGENT_RUNTIME_PACKAGE}@${version}`, { enabled: false, requestId })
            : await host.removeBundle(SUBAGENT_RUNTIME_PACKAGE)
          if (result.application === 'cancelled') { state = { phase: 'cancelled', restartRequired: false }; return }
          if (!['applied', 'restart-required'].includes(result.application)) throw Error(result.packageResult?.kind ?? result.error?.code ?? 'operation-error')
          current.changed = true
        }
        current.controller.signal.throwIfAborted()
        if (cli) {
          current.cli = true
          state.phase = action === 'install' ? 'installing' : 'removing'
          await cli.change(action, current.controller.signal)
          current.changed = true
        }
        state = { phase: 'done', restartRequired: true }
      } catch (error) {
        state = current.controller.signal.aborted ? { phase: 'cancelled', restartRequired: current.changed }
          : { phase: 'failed', restartRequired: current.changed, error: ['not-removable', 'build-blocked', 'network'].includes(error.message) ? error.message : 'operation-error' }
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
      if (current.cli) { current.controller.abort(); await current.done; return status() }
      const result = await current.host.cancelInstall(current.requestId)
      if (result.status === 'cancelled') await current.done
      return status()
    },
  }
}
