// On-demand, local observations only. Never collect DOM text, URLs or account data.
import { PACKAGE_VERSION } from './version.js'
export function inspectElement(element) {
  if (!element?.isConnected) return 'missing'
  const view = element.ownerDocument.defaultView
  for (let node = element; node; node = node.parentElement) {
    const style = view.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return 'hidden'
  }
  const box = element.getBoundingClientRect()
  if (box.width <= 0 || box.height <= 0) return 'zero-size'
  if (box.bottom <= 0 || box.right <= 0 || box.top >= view.innerHeight || box.left >= view.innerWidth) return 'outside-viewport'
  // Settings and other legitimate overlays can cover the composer. This is an
  // observation, not evidence identifying a conflicting plugin.
  const x = Math.max(0, Math.min(view.innerWidth - 1, box.left + box.width / 2))
  const y = Math.max(0, Math.min(view.innerHeight - 1, box.top + box.height / 2))
  const top = element.ownerDocument.elementFromPoint(x, y)
  return top && !element.contains(top) ? 'covered-at-center' : 'visible'
}

export function createClientHealth() {
  const readers = new Map()
  const integrations = new Map()
  return {
    registerIntegration(read) { const key = Symbol(); integrations.set(key, read); return () => integrations.delete(key) },
    observe(read) { const key = Symbol(); readers.set(key, read); return () => readers.delete(key) },
    snapshot() {
      return { schemaVersion: 1, version: PACKAGE_VERSION, integrations: [...integrations.values()].slice(0, 8).map(read => {
        try { return read() } catch { return { state: 'inspection-unavailable' } }
      }), quota: [...readers.values()].slice(0, 8).map(read => {
        try { return read() } catch { return { state: 'inspection-unavailable' } }
      }), coverage: 'current-mounted-composers', attribution: 'not-determined' }
    },
  }
}

export function diagnosticFindings(report) {
  const findings = []
  if (report.version && report.client?.version && report.version !== report.client.version) findings.push('version-mismatch')
  if (report.configuration?.writable === false) findings.push('settings-readonly')
  if (Object.values(report.requests ?? {}).some(value => value.status === 'failed')) findings.push('request-failed')
  for (const entry of report.client?.integrations ?? []) {
    if (entry.stylesheet === false) findings.push('stylesheet-missing')
    if (entry.quota?.state === 'shadowed') findings.push('quota-shadowed')
    if (entry.modelSelector?.state === 'shadowed') findings.push('model-shadowed')
    if (entry.quota?.state === 'not-registered') findings.push('quota-unregistered')
  }
  return [...new Set(findings)]
}

export function inspectSlot(slots, name, component) {
  if (typeof slots?.entries !== 'function') return { state: 'unsupported' }
  const entries = slots.entries(name)
  const owned = entries.filter(entry => entry.component === component || entry.options?.component === component)
  if (!owned.length) return { state: 'not-registered', entries: entries.length }
  if (typeof slots.entriesOfSlot !== 'function') return { state: 'registered', entries: entries.length, selection: 'unknown' }
  const active = slots.entriesOfSlot(name)
  return { state: owned.some(entry => active.includes(entry)) ? 'selected' : 'shadowed', entries: entries.length }
}

export function quotaHealth({ preferencesReady, enabled, subscriptionModel, request, element }) {
  if (!preferencesReady) return { state: 'preferences-unavailable' }
  if (!enabled) return { state: 'disabled' }
  if (!subscriptionModel) return { state: 'other-provider' }
  if (request !== 'ready') return { state: request }
  return { state: 'ready', presentation: inspectElement(element) }
}
