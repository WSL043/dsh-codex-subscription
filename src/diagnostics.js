import { PACKAGE_VERSION } from './version.js'

const requestAreas = new Set(['login', 'model', 'catalog', 'quota', 'quota-reset', 'search', 'image'])
const statuses = new Set(['ok', 'failed'])
const stages = new Set(['transport', 'http'])
const codes = new Set(['timeout', 'dns', 'tls', 'connection', 'network', 'http-error'])
const routes = new Set(['direct', 'environment', 'system', 'bypass'])
const elapsedBuckets = new Set(['under-1s', '1-5s', '5-15s', 'over-15s'])

function safeRequests(network) {
  const raw = network?.snapshot?.() ?? {}
  const result = {}
  for (const [area, value] of Object.entries(raw)) {
    if (!requestAreas.has(area) || value === null || typeof value !== 'object') continue
    if (!statuses.has(value.status) || !routes.has(value.route) || !elapsedBuckets.has(value.elapsed)) continue
    result[area] = {
      status: value.status,
      ...(stages.has(value.stage) ? { stage: value.stage } : {}),
      ...(codes.has(value.code) ? { code: value.code } : {}),
      ...(Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599 ? { httpStatus: value.httpStatus } : {}),
      route: value.route,
      elapsed: value.elapsed,
    }
  }
  return result
}

/** Build a support report that deliberately excludes OAuth and account metadata. */
export async function createSubscriptionDiagnostics({ auth, preferences, login = { phase: 'idle' }, network, modelCatalog }) {
  let account = { status: 'unknown' }
  const issues = []
  try {
    const status = await auth.status()
    account = { status: status.authenticated === true ? 'signed-in' : 'signed-out' }
  } catch {
    issues.push({ code: 'account-status-unavailable' })
  }

  const preference = preferences.status()
  const catalog = modelCatalog?.status?.()
  // Report only bounded capability identifiers, never the raw server catalog.
  const gaps = (modelCatalog?.capabilityGaps?.() ?? []).slice(0, 20).flatMap(value => {
    if (!value || typeof value.model !== 'string' || !/^[a-z][a-z0-9._-]{0,79}$/u.test(value.model)) return []
    const fields = Object.fromEntries(['reasoning', 'inputs', 'speeds'].flatMap(key => {
      const names = [...new Set((Array.isArray(value[key]) ? value[key] : [])
        .filter(name => typeof name === 'string' && /^[a-z][a-z0-9_-]{0,31}$/u.test(name)))].slice(0, 16)
      return names.length ? [[key, names]] : []
    }))
    return Object.keys(fields).length ? [{ model: value.model, ...fields }] : []
  })
  if (gaps.length) issues.push({ code: 'catalog-capabilities-not-adapted' })
  return {
    schemaVersion: 3,
    package: 'dsh-codex-subscription',
    version: PACKAGE_VERSION,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    account,
    login,
    requests: safeRequests(network),
    ...(catalog && ['fallback', 'online'].includes(catalog.source)
      && ['idle', 'refreshing', 'ok', 'failed'].includes(catalog.refresh)
      ? { catalog: { source: catalog.source, refresh: catalog.refresh, ...(gaps.length ? { unsupported: gaps } : {}) } } : {}),
    configuration: {
      contextMode: preference.contextMode,
      quickQuotaMode: preference.quickQuotaMode,
      ...(typeof preference.outputVerbosity === 'string' ? { outputVerbosity: preference.outputVerbosity } : {}),
      searchProvider: preference.searchProvider,
      speedMode: preference.speedMode,
      writable: preference.writable === true,
    },
    issues,
  }
}
