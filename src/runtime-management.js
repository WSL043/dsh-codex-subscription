import { matchingSubagentRuntimeVersion } from './subagent-runtime.js'
import { SUBAGENT_CODEX_VERSION } from './subagent-cli.js'

/** DSH's Plugins page owns the official bundle. Only the subscription CLI alias is managed here. */
export function createRuntimeManagement({ inspect, active, selectDsh, cli, componentVersion = matchingSubagentRuntimeVersion }) {
  let operation
  let state = { phase: 'idle', restartRequired: false }
  const status = () => {
    const runtime = inspect()
    const cliState = cli.inspect()
    return {
      ...state,
      available: cliState.available,
      adapterInstalled: runtime.adapterInstalled === true,
      componentVersion: componentVersion(),
      codexVersion: SUBAGENT_CODEX_VERSION,
      installed: runtime.installed,
      installable: runtime.adapterInstalled === true && !runtime.installed && cliState.available,
      removable: cliState.owned,
      active: active(),
    }
  }

  const start = async action => {
    if (!['install', 'remove'].includes(action)) throw Error('invalid-action')
    if (operation) throw Error('busy')
    if (state.restartRequired) throw Error('restart-required')
    if (active() > 0) throw Error('active-tasks')
    const currentStatus = status()
    if (!currentStatus.available || !(action === 'install' ? currentStatus.installable : currentStatus.removable)) throw Error('unavailable')

    const current = { action, controller: new AbortController() }
    operation = current
    state = { phase: action === 'install' ? 'installing' : 'removing', restartRequired: false }
    current.done = (async () => {
      try {
        if (action === 'remove') await selectDsh()
        await cli.change(action, current.controller.signal)
        state = { phase: 'done', restartRequired: true }
      } catch {
        state = current.controller.signal.aborted
          ? { phase: 'cancelled', restartRequired: inspect().installed }
          : { phase: 'failed', restartRequired: false }
      } finally {
        operation = undefined
      }
    })()
    return status()
  }

  return {
    status, start,
    blocked: () => operation !== undefined || state.restartRequired,
    async cancel() {
      if (operation?.action === 'install') {
        const current = operation
        current.controller.abort()
        await current.done
      }
      return status()
    },
  }
}
