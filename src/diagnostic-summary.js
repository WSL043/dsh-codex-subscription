// Derive findings from bounded report evidence, never from labels or UI guesses.
export function diagnosticSummary(report, now = Date.now()) {
  const findings = []
  const checks = [...(report.inspection?.checks ?? []), ...(report.client?.checks ?? [])]
  if (report.version && report.client?.version && report.version !== report.client.version)
    findings.push({ code: 'version-mismatch' })
  if (!report.inspection || report.client?.status === 'unknown' || checks.some(check => ['inspection-failed', 'inspection-timeout'].includes(check.reason)))
    findings.push({ code: 'collection-incomplete' })
  if (report.catalog?.unsupported?.length) findings.push({ code: 'catalog-gap' })
  const current = new Map()
  for (const event of [...(report.requestHistory?.events ?? []).map(e => ({ ...e, source: 'network', action: e.area })), ...(report.operations?.events ?? [])]
    .filter(e => now >= e.observedAt && now - e.observedAt <= 15 * 60_000).sort((a, b) => a.observedAt - b.observedAt))
    current.set(`${event.source}:${event.action}`, event)
  if ([...current.values()].some(event => event.status === 'failed')) findings.push({ code: 'recent-failure' })
  return { scope: 'recorded-evidence-only', findings,
    unverified: (report.inspection?.capabilities ?? []).filter(c => c.execution === 'not-verified' && c.readiness !== 'not-applicable').length }
}
