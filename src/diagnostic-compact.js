// The copied report is what a person pastes into an issue, so it carries the
// conclusions and the facts needed to act on them, not every counter. The full
// JSON stays available in the settings page's details section.
export function compactDiagnostic(report) {
  const summary = report.summary ?? { findings: [] }
  return {
    format: 'compact-1',
    plugin: report.version,
    dsh: report.client?.version,
    generatedAt: report.generatedAt,
    account: report.account?.status,
    catalog: report.catalog ? { source: report.catalog.source, refresh: report.catalog.refresh } : undefined,
    configuration: report.configuration,
    findings: summary.findings.map(item => ({
      code: item.code,
      severity: item.severity,
      ...(item.code === 'recent-failure' ? { failures: item.evidence.map(event => ({ action: event.action, source: event.source, at: new Date(event.observedAt).toISOString() })) } : {}),
    })),
    capabilities: (report.inspection?.capabilities ?? [])
      .filter(item => item.readiness !== 'not-applicable')
      .map(item => ({
        id: item.id,
        reason: item.reason,
        ...(item.latest ? { latest: `${item.latest.action} ${item.latest.status}` } : { latest: 'not-verified' }),
      })),
    ...(report.client?.status === 'unknown' ? { hostCollected: false } : {}),
  }
}
