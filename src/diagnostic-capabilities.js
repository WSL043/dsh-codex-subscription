import { diagnosticCapabilities } from './diagnostic-checks.js'

// A satisfied precondition is not an end-to-end test result.
export function capabilityCoverage({ account, preference, runtime, catalog, tools, storage, checks, operations, now = Date.now() }) {
  const disabled = {
    images: preference.imageGeneration === false && preference.imageEditing === false,
    sketch: preference.imageSketch === false || preference.imageEditing === false,
    search: preference.searchMode === 'disabled',
    compaction: preference.compactionMode === 'dsh',
    subagents: preference.subagentBackend === 'dsh',
  }
  return diagnosticCapabilities.map(id => {
    let readiness = 'unknown', reason = 'not-instrumented', blockedBy
    if (disabled[id]) { readiness = 'not-applicable'; reason = 'disabled-or-host-owned' }
    else if (['models', 'quota', 'search', 'images', 'compaction'].includes(id) && account.status === 'signed-out') {
      readiness = 'warn'; reason = 'sign-in-required'; blockedBy = 'account'
    } else if (id === 'account') {
      readiness = account.status === 'signed-in' ? 'pass' : 'unknown'; reason = account.status === 'signed-in' ? 'local-sign-in-present' : 'sign-in-unverified'
    } else if (id === 'settings' && typeof preference.writable === 'boolean') {
      readiness = preference.writable ? 'pass' : 'warn'; reason = preference.writable ? 'settings-writable' : 'settings-readonly'
    } else if (id === 'subagents' && runtime) {
      readiness = runtime.installed && !runtime.restartRequired ? 'pass' : 'warn'; reason = runtime.restartRequired ? 'restart-required' : runtime.installed ? 'runtime-present' : 'runtime-missing'
    } else if (id === 'models' && catalog) {
      readiness = catalog.source === 'online' ? 'pass' : 'warn'; reason = catalog.source === 'online' ? 'catalog-online' : 'catalog-fallback'
    } else if (id === 'storage' && storage?.readable) {
      readiness = 'pass'; reason = 'storage-readable'
    } else if (tools && (id === 'images' || (id === 'sketch' && preference.imageSketchAgent === true))) {
      readiness = tools[id] ? 'pass' : 'warn'; reason = tools[id] ? 'tool-registered' : 'tool-missing'
    }
    const recent = (operations?.events ?? []).filter(event => event.capability === id && now >= event.observedAt && now - event.observedAt <= 15 * 60_000).at(-1)
    return { id, readiness, reason, ...(blockedBy ? { blockedBy } : {}),
      checks: checks.filter(check => check.capability === id).map(check => check.id),
      execution: recent ? 'observed' : 'not-verified',
      ...(recent ? { latest: { action: recent.action, source: recent.source, status: recent.status, observedAt: recent.observedAt } } : {}),
    }
  })
}
