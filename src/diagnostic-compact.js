const preferences = {
  connectionMode: ['sse', 'websocket'], compactionMode: ['dsh', 'cloud'],
  composerModelPicker: ['auto', 'dsh', 'legacy'], contextMode: ['standard', 'extended', 'custom'],
  searchProvider: ['auto', 'dsh', 'codex'],
  speedMode: ['standard', 'fast', 'ultrafast'], outputVerbosity: ['default', 'low', 'medium', 'high'],
}

function recentOperations(events, key, attemptAlias = () => undefined) {
  const latest = new Map(), failures = new Map()
  for (const event of events ?? []) {
    latest.set(key(event), event)
    if (event.status === 'failed') failures.set(key(event), event)
  }
  return [...new Set([...latest.values(), ...failures.values()])].sort((a, b) => a.observedAt - b.observedAt)
    .map(({ observedAt, sequence, attemptId, capability, ...event }) => {
      const attempt = attemptAlias(attemptId)
      return { at: new Date(observedAt).toISOString(), ...event, ...(attempt ? { attempt } : {}) }
    })
}

// The report that can be pasted into a public issue uses only structured observations.
export function compactDiagnostic(report) {
  const attempts = new Map()
  const network = recentOperations(report.requestHistory?.events, event => event.model ? `${event.area}:${event.model}` : event.area, id => {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/u.test(id)) return undefined
    if (!attempts.has(id)) attempts.set(id, `op${attempts.size + 1}`)
    return attempts.get(id)
  })
  const failureAttempt = attempts.get(report.streamFailure?.attemptId)
  const configuration = Object.fromEntries(Object.entries(preferences).flatMap(([key, allowed]) =>
    allowed.includes(report.configuration?.[key]) ? [[key, report.configuration[key]]] : []))
  const slots = (report.client?.topology ?? []).flatMap(({ scope, slots: items }) => {
    const observed = items.filter(item => item.declared && item.occupants.length > 0)
    return observed.length ? [{ scope, slots: observed.map(({ name, occupants }) => ({
      name, occupants: occupants.map(({ registrant, active }) => ({ registrant, active })),
    })) }] : []
  })
  const truncated = (report.requestHistory?.dropped ?? 0) > 0 || (report.operations?.dropped ?? 0) > 0 || report.client?.truncated === true
  const unavailable = [...(report.inspection?.checks ?? []), ...(report.client?.checks ?? [])]
    .filter(check => ['inspection-failed', 'inspection-timeout', 'host-inspection-unavailable'].includes(check.reason))
    .map(({ id, reason }) => ({ id, reason }))
  return {
    format: 'support-2',
    plugin: report.version ?? report.pluginVersion,
    dsh: report.runtime?.dsh,
    ...(report.client?.version && report.version && report.client.version !== report.version ? { pluginClient: report.client.version } : {}),
    ...(report.runtime ? { runtime: report.runtime } : {}),
    generatedAt: report.generatedAt,
    ...(report.serverDiagnostics === 'unavailable' ? { serverDiagnostics: 'unavailable', error: report.error } : {}),
    ...(!report.client?.topology?.length ? { clientDiagnostics: 'unavailable' } : {}),
    account: report.account?.status,
    catalog: report.catalog,
    configuration,
    ...(report.login?.phase !== undefined ? { login: report.login } : {}),
    ...(unavailable.length ? { unavailable } : {}),
    ...(truncated ? { historyTruncated: true } : {}),
    ...(slots.length ? { uiSlots: slots } : {}),
    ...(report.requestHistory ? { network } : {}),
    ...(failureAttempt ? { lastModelStreamFailure: { attempt: failureAttempt } } : {}),
    ...(report.operations ? { operations: recentOperations(report.operations.events, event => `${event.source}:${event.action}`) } : {}),
    ...(report.compaction?.requests ? { pluginCompaction: report.compaction } : {}),
  }
}
