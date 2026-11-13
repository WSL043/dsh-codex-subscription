import { useState } from 'react'
import { SettingsLabel } from './client-hint.jsx'
import { Button } from './client-primitives.jsx'
import { SUPPORT_ISSUE_URL } from './client-shared.js'
import { recoveryCall, clientDiagnostic } from './client-recovery.js'
import { compactDiagnostic } from './diagnostic-compact.js'

export function DiagnosticsCard({ rpc, t, diagnostics }) {
  const [report, setReport] = useState()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const load = () => {
    setBusy(true); setReport(undefined); setCopied(false); setCopyError(false)
    void Promise.allSettled([recoveryCall(rpc, 'diagnostics'), Promise.resolve().then(() => diagnostics?.collect())]).then(([server, client]) => {
      const combined = { ...(server.status === 'fulfilled' ? server.value : clientDiagnostic(server.reason)),
        client: client.status === 'fulfilled' && client.value ? client.value : { status: 'unknown' } }
      setReport(compactDiagnostic(combined))
    }).finally(() => setBusy(false))
  }
  const text = report === undefined ? undefined : JSON.stringify(report, null, 2)
  const copy = () => {
    setCopyError(false)
    void Promise.resolve().then(() => navigator.clipboard.writeText(text)).then(() => setCopied(true)).catch(() => setCopyError(true))
  }
  return <div className="codexSubscriptionCard codexSubscriptionDiagnostics">
    <div className="codexSubscriptionPreference">
      <div className="codexSubscriptionPreferenceCopy"><SettingsLabel description={t('diagnosticsHint')}>{t('diagnostics')}</SettingsLabel></div>
      <div className="codexSubscriptionActions"><Button type="button" variant="outline" disabled={busy} onClick={load}>{busy ? t('diagnosticsLoading') : t('diagnosticsLoad')}</Button>{text === undefined ? null : <Button type="button" variant="outline" onClick={copy}>{copied ? t('diagnosticsCopied') : t('diagnosticsCopy')}</Button>}<a className="codexSubscriptionLink" href={SUPPORT_ISSUE_URL} target="_blank" rel="noreferrer">{t('feedbackOpen')}</a></div>
    </div>
    {text === undefined ? null : <details className="codexAdvancedFold codexAdvancedInline">
      <summary>{t('diagnosticsPreview')}</summary>
      <pre className="codexSubscriptionLog" tabIndex={0}>{text}</pre>
    </details>}
    {report?.serverDiagnostics === 'unavailable' ? <p className="codexSubscriptionError" role="alert">{t('diagnosticsFailed')}</p> : null}
    {copyError ? <p className="codexSubscriptionError" role="alert">{t('diagnosticsCopyFailed')}</p> : null}
  </div>
}
