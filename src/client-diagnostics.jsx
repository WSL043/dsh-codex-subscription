import { useState } from 'react'
import { Button } from './client-primitives.js'
import { CHANNEL, SUPPORT_ISSUE_URL, unwrap } from './client-shared.js'
import { recoveryCall, clientDiagnostic } from './client-recovery.js'
import { diagnosticFindings } from './client-health.js'
export function DiagnosticsCard({ rpc, t, health }) {
  const [report, setReport] = useState()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const load = () => {
    setBusy(true); setError(false); setCopied(false); setCopyError(false)
    const client = health?.snapshot() ?? { coverage: 'unavailable' }
    void recoveryCall(rpc, 'diagnostics').then(value => setReport({ ...value, client }))
      .catch(error => { setReport({ ...clientDiagnostic(error), client }); setError(true) }).finally(() => setBusy(false))
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
    {report === undefined ? null : <><p className="codexSubscriptionHelp">{t('diagnosticsClientScope')}</p>
      {diagnosticFindings(report).map(code => <p key={code} role="status">{t(`diagnosticFinding_${code}`)}</p>)}
      <ul>{report.client?.quota?.length ? report.client.quota.map((item, index) => <li key={index}>{t(`diagnosticQuota_${item.presentation ?? item.state}`)}</li>) : <li>{t('diagnosticQuota_not-mounted')}</li>}</ul>
      <details><summary>{t('diagnosticsDetails')}</summary><pre>{JSON.stringify(report, null, 2)}</pre></details></>}
    {error ? <p className="codexSubscriptionError" role="alert">{t('diagnosticsFailed')}</p> : null}
    {copyError ? <p className="codexSubscriptionError" role="alert">{t('diagnosticsCopyFailed')}</p> : null}
  </div>
}
