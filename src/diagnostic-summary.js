import { diagnosticEvidence, unresolvedFailures } from './diagnostic-evidence.js'

// Derive findings from bounded report evidence, never from labels or UI guesses.
export function diagnosticSummary(report, now = Date.now()) {
  const findings = []
  const checks = [...(report.inspection?.checks ?? []), ...(report.client?.checks ?? [])]
  if (report.version && report.client?.version && report.version !== report.client.version)
    findings.push({ code: 'version-mismatch', severity: 'warning', next: 'restart', evidence: ['version', 'client.version'] })
  if (!report.inspection || report.client?.status === 'unknown' || checks.some(check => ['inspection-failed', 'inspection-timeout'].includes(check.reason)))
    findings.push({ code: 'collection-incomplete', severity: 'warning', next: 'regenerate', evidence: checks.filter(c => c.status === 'unknown').map(c => c.id) })
  if (report.catalog?.unsupported?.length) findings.push({ code: 'catalog-gap', severity: 'info', next: 'supported-options', evidence: ['catalog.unsupported'] })
  // Server timestamps use the server report's clock, not the browser's clock.
  const capturedAt = Date.parse(report.generatedAt)
  const failures = unresolvedFailures(diagnosticEvidence({ operations: report.operations, history: report.requestHistory }, Number.isFinite(capturedAt) ? capturedAt : now))
  if (failures.length) findings.push({ code: 'recent-failure', severity: 'warning', next: 'reproduce', evidence: failures })
  if ((report.requestHistory?.dropped ?? 0) + (report.operations?.dropped ?? 0) > 0 || report.client?.truncated)
    findings.push({ code: 'evidence-truncated', severity: 'info', next: 'regenerate', evidence: ['requestHistory.dropped', 'operations.dropped', 'client.truncated'] })
  return { scope: 'recorded-evidence-only', findings,
    unverified: (report.inspection?.capabilities ?? []).filter(c => c.execution === 'not-verified' && c.readiness !== 'not-applicable').length }
}
