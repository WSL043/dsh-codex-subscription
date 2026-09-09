import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { CHANNEL, SUPPORT_ISSUE_URL, unwrap } from './client-shared.js'
import { recoveryCall, clientDiagnostic } from './client-recovery.js'
export function DiagnosticsCard({ rpc, t }) {
  const [report, setReport] = useState()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const load = () => {
    setBusy(true); setError(false); setCopied(false)
    void recoveryCall(rpc, 'diagnostics').then(setReport)
      .catch(error => { setReport(clientDiagnostic(error)); setError(true) }).finally(() => setBusy(false))
  }
  const copy = () => {
    if (report === undefined) return
    void navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => setCopied(true)).catch(() => setError(true))
  }
  return <div className="codexSubscriptionCard codexSubscriptionDiagnostics">
    <div className="codexSubscriptionSectionHead">
      <div className="codexSubscriptionSectionTitle"><h3>{t('diagnostics')}</h3></div>
      <div className="codexSubscriptionActions"><Button type="button" variant="outline" disabled={busy} onClick={load}>{busy ? t('diagnosticsLoading') : t('diagnosticsLoad')}</Button>{report === undefined ? null : <Button type="button" variant="outline" onClick={copy}>{copied ? t('diagnosticsCopied') : t('diagnosticsCopy')}</Button>}<a className="codexSubscriptionLink" href={SUPPORT_ISSUE_URL} target="_blank" rel="noreferrer">{t('feedbackOpen')}</a></div>
    </div>
    {report === undefined ? null : <pre>{JSON.stringify(report, null, 2)}</pre>}
    {error ? <p className="codexSubscriptionError" role="alert">{t('diagnosticsFailed')}</p> : null}
  </div>
}
