import { useState } from 'react'
import { SettingsLabel } from './client-hint.jsx'
import { Button } from './client-primitives.js'
import { SUPPORT_ISSUE_URL, uiLocale } from './client-shared.js'
import { recoveryCall, clientDiagnostic } from './client-recovery.js'
import { diagnosticSummary } from './diagnostic-summary.js'
import { compactDiagnostic } from './diagnostic-compact.js'
import { formatLogLine } from './diagnostic-log-format.js'
const LEVELS = { all: ['info', 'warn', 'error'], warn: ['warn', 'error'], error: ['error'] }
export function DiagnosticsCard({ rpc, t, diagnostics }) {
  const [report, setReport] = useState()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [level, setLevel] = useState('all')
  const [logCopied, setLogCopied] = useState(false)
  const load = () => {
    setBusy(true); setError(false); setCopied(false); setCopyError(false)
    void Promise.allSettled([recoveryCall(rpc, 'diagnostics'), Promise.resolve().then(() => diagnostics?.collect())]).then(([server, client]) => {
      setError(server.status === 'rejected')
      const combined = { ...(server.status === 'fulfilled' ? server.value : clientDiagnostic(server.reason)),
        client: client.status === 'fulfilled' && client.value ? client.value : { status: 'unknown' } }
      setReport({ ...combined, summary: diagnosticSummary(combined) })
    }).finally(() => setBusy(false))
  }
  const copy = (full = false) => {
    if (report === undefined) return
    setCopyError(false)
    void Promise.resolve().then(() => navigator.clipboard.writeText(JSON.stringify(full ? report : compactDiagnostic(report), null, 2))).then(() => setCopied(true)).catch(() => setCopyError(true))
  }
  const lines = (report?.log?.entries ?? []).filter(entry => LEVELS[level].includes(entry.level))
  const copyLog = () => { void Promise.resolve().then(() => navigator.clipboard.writeText(lines.map(formatLogLine).join(String.fromCharCode(10)))).then(() => setLogCopied(true)).catch(() => setCopyError(true)) }
  const findings = report?.summary?.findings ?? []
  const attention = findings.filter(item => item.severity !== 'info')
  const notes = findings.filter(item => item.severity === 'info')
  const finding = item => <li key={item.code}>
    <span className="codexDiagTitle">{t(`diagnosticFinding_${item.code}`)}</span>
    <span className="codexDiagNext">{t(`diagnosticNext_${item.next}`)}</span>
    {item.code === 'recent-failure' ? <ul>{item.evidence.map(event => <li key={`${event.source}:${event.action}`}>{event.action} · {t(`diagnosticSource_${event.source}`)} · {new Date(event.observedAt).toLocaleTimeString(uiLocale())}</li>)}</ul> : null}
  </li>
  return <div className="codexSubscriptionCard codexSubscriptionDiagnostics">
    <div className="codexSubscriptionPreference">
      <div className="codexSubscriptionPreferenceCopy"><SettingsLabel description={t('diagnosticsHint')}>{t('diagnostics')}</SettingsLabel></div>
      <div className="codexSubscriptionActions"><Button type="button" variant="outline" disabled={busy} onClick={load}>{busy ? t('diagnosticsLoading') : t('diagnosticsLoad')}</Button>{report === undefined ? null : <Button type="button" variant="outline" onClick={() => copy()}>{copied ? t('diagnosticsCopied') : t('diagnosticsCopy')}</Button>}<a className="codexSubscriptionLink" href={SUPPORT_ISSUE_URL} target="_blank" rel="noreferrer">{t('feedbackOpen')}</a></div>
    </div>
    {report === undefined ? null : <>
      <div className="codexDiagResult" role="status" data-state={attention.length ? 'attention' : 'ok'}>
        <span className="codexDiagBadge">{attention.length ? t('diagnosticsAttention').replace('{count}', String(attention.length)) : t('diagnosticsNoRecordedFailure')}</span>
        {report.generatedAt ? <span className="codexDiagTime">{new Date(report.generatedAt).toLocaleString(uiLocale())}</span> : null}
      </div>
      {attention.length ? <ul className="codexDiagFindings">{attention.map(finding)}</ul> : null}
      {notes.length ? <details className="codexAdvancedFold codexAdvancedInline"><summary>{t('diagnosticsNotes').replace('{count}', String(notes.length))}</summary><ul className="codexDiagFindings">{notes.map(finding)}</ul></details> : null}
      <details className="codexAdvancedFold codexAdvancedInline">
        <SettingsLabel as="summary" className="" openOnClick={false} description={t('diagnosticsLogHint')}>{t('diagnosticsLog')}<span>{lines.length}</span></SettingsLabel>
        <div className="codexSubscriptionLogHead">
          <div className="codexSubscriptionQuotaModes" role="radiogroup" aria-label={t('diagnosticsLog')}>
            {Object.keys(LEVELS).map(value => <label key={value} className="codexSubscriptionQuotaMode"><input type="radio" name="codex-log-level" checked={level === value} onChange={() => { setLevel(value); setLogCopied(false) }} /><span>{t(`logLevel_${value}`)}</span></label>)}
          </div>
          <Button type="button" variant="outline" disabled={lines.length === 0} onClick={copyLog}>{logCopied ? t('logCopied') : t('logCopy')}</Button>
        </div>
        {lines.length === 0 ? <p className="codexSubscriptionHelp">{t('logEmpty')}</p> : <pre className="codexSubscriptionLog" tabIndex={0}>{lines.slice().reverse().map(entry => <span key={entry.sequence} className={`codexSubscriptionLogLine codexSubscriptionLog_${entry.level}`}>{formatLogLine(entry)}{entry.earlier ? ` (${t('logEarlier')})` : ''}{String.fromCharCode(10)}</span>)}</pre>}
      </details>
      <details className="codexAdvancedFold codexAdvancedInline"><SettingsLabel as="summary" className="" openOnClick={false} description={t('diagnosticsCoverageHint')}>{t('diagnosticsAdvanced')}</SettingsLabel>
        <p className="codexSubscriptionHelp">{report.client?.topology?.length ? t('diagnosticsHostCollected') : t('diagnosticsHostUnknown')}</p>
        <table className="codexDiagTable">
          <thead><tr><th>{t('diagnosticsCapability')}</th><th>{t('diagnosticsReadiness')}</th><th>{t('diagnosticsEvidence')}</th></tr></thead>
          <tbody>{(report.inspection?.capabilities ?? []).map(item => <tr key={item.id}>
            <td>{t(`diagnosticCapability_${item.id}`)}</td>
            <td>{t(`diagnosticReason_${item.reason}`)}{item.blockedBy ? ` · ${t(`diagnosticCapability_${item.blockedBy}`)}` : ''}</td>
            <td>{item.latest ? `${item.latest.action} · ${t(`diagnosticSource_${item.latest.source}`)} · ${t(`diagnosticOutcome_${item.latest.status}`)} · ${new Date(item.latest.observedAt).toLocaleTimeString(uiLocale())}` : t('diagnosticsUnverified')}{item.unresolved?.length ? <p>{t('diagnosticsUnresolved')}</p> : null}</td>
          </tr>)}</tbody>
        </table>
        <div className="codexSubscriptionActions"><Button type="button" variant="outline" onClick={() => copy(true)}>{t('diagnosticsCopyFull')}</Button></div>
        <pre className="codexSubscriptionLog" tabIndex={0}>{JSON.stringify(report, null, 2)}</pre>
      </details>
    </>}
    {error ? <p className="codexSubscriptionError" role="alert">{t('diagnosticsFailed')}</p> : null}
    {copyError ? <p className="codexSubscriptionError" role="alert">{t('diagnosticsCopyFailed')}</p> : null}
  </div>
}
