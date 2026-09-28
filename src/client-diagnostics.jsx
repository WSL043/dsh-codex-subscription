import { useState } from 'react'
import { Button } from './client-primitives.js'
import { SUPPORT_ISSUE_URL } from './client-shared.js'
import { recoveryCall, clientDiagnostic } from './client-recovery.js'
import { diagnosticSummary } from './diagnostic-summary.js'
export function DiagnosticsCard({ rpc, t, diagnostics }) {
  const [report, setReport] = useState()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const load = () => {
    setBusy(true); setError(false); setCopied(false); setCopyError(false)
    void Promise.allSettled([recoveryCall(rpc, 'diagnostics'), Promise.resolve().then(() => diagnostics?.collect())]).then(([server, client]) => {
      setError(server.status === 'rejected')
      const combined = { ...(server.status === 'fulfilled' ? server.value : clientDiagnostic(server.reason)),
        client: client.status === 'fulfilled' && client.value ? client.value : { status: 'unknown' } }
      setReport({ ...combined, summary: diagnosticSummary(combined) })
    }).finally(() => setBusy(false))
  }
  const copy = () => {
    if (report === undefined) return
    setCopyError(false)
    void Promise.resolve().then(() => navigator.clipboard.writeText(JSON.stringify(report, null, 2))).then(() => setCopied(true)).catch(() => setCopyError(true))
  }
  return <div className="codexSubscriptionCard codexSubscriptionDiagnostics">
    <div className="codexSubscriptionSectionHead">
      <div className="codexSubscriptionSectionTitle"><h3>{t('diagnostics')}</h3><p className="codexSubscriptionHelp">{t('diagnosticsHint')}</p></div>
      <div className="codexSubscriptionActions"><Button type="button" variant="outline" disabled={busy} onClick={load}>{busy ? t('diagnosticsLoading') : t('diagnosticsLoad')}</Button>{report === undefined ? null : <Button type="button" variant="outline" onClick={copy}>{copied ? t('diagnosticsCopied') : t('diagnosticsCopy')}</Button>}<a className="codexSubscriptionLink" href={SUPPORT_ISSUE_URL} target="_blank" rel="noreferrer">{t('feedbackOpen')}</a></div>
    </div>
    {report === undefined ? null : <>
      <p className="codexSubscriptionHelp">{t('diagnosticsCoverageHint')}</p>
      {report.generatedAt ? <p className="codexSubscriptionHelp">{t('diagnosticsSnapshotTime')} {new Date(report.generatedAt).toLocaleString()}</p> : null}
      <div role="status">{report.summary?.findings.length ? <ul>{report.summary.findings.map(item => <li key={item.code}>
        <strong>{t(`diagnosticSeverity_${item.severity}`)}</strong> · {t(`diagnosticFinding_${item.code}`)}
        <p className="codexSubscriptionHelp">{t(`diagnosticNext_${item.next}`)}</p>
        {item.code === 'recent-failure' ? <ul>{item.evidence.map(event => <li key={`${event.source}:${event.action}`}>{event.action} · {t(`diagnosticSource_${event.source}`)} · {new Date(event.observedAt).toLocaleTimeString()}</li>)}</ul> : null}
      </li>)}</ul> : <p>{t('diagnosticsNoRecordedFailure')}</p>}</div>
      <table style={{ width: '100%', fontSize: 12, textAlign: 'left', borderSpacing: '0 8px' }}>
        <thead><tr><th>{t('diagnosticsCapability')}</th><th>{t('diagnosticsReadiness')}</th><th>{t('diagnosticsEvidence')}</th></tr></thead>
        <tbody>{(report.inspection?.capabilities ?? []).map(item => <tr key={item.id}>
          <td>{t(`diagnosticCapability_${item.id}`)}</td>
          <td>{t(`diagnosticReason_${item.reason}`)}{item.blockedBy ? ` · ${t(`diagnosticCapability_${item.blockedBy}`)}` : ''}</td>
          <td>{item.latest ? `${item.latest.action} · ${t(`diagnosticSource_${item.latest.source}`)} · ${t(`diagnosticOutcome_${item.latest.status}`)} · ${new Date(item.latest.observedAt).toLocaleTimeString()}` : t('diagnosticsUnverified')}{item.unresolved?.length ? <p>{t('diagnosticsUnresolved')}</p> : null}</td>
        </tr>)}</tbody>
      </table>
      <p className="codexSubscriptionHelp">{report.client?.topology?.length ? t('diagnosticsHostCollected') : t('diagnosticsHostUnknown')}</p>
      <details><summary>{t('diagnosticsDetails')}</summary><pre>{JSON.stringify(report, null, 2)}</pre></details>
    </>}
    {error ? <p className="codexSubscriptionError" role="alert">{t('diagnosticsFailed')}</p> : null}
    {copyError ? <p className="codexSubscriptionError" role="alert">{t('diagnosticsCopyFailed')}</p> : null}
  </div>
}
