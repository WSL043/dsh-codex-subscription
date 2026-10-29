import { useState } from 'react'
import { Button } from './client-primitives.js'
import { fill } from './client-shared.js'

export function InterruptedOutput({ node, t }) {
  const [open, setOpen] = useState(false), [copied, setCopied] = useState(false)
  const { text, repeated, retry } = node.data
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true) } catch { setCopied(false) } }
  return <aside className="codexInterruptedOutput">
    {repeated ? <p className="codexSubscriptionHelp" role="status">{fill(t('streamRepeated'), { count: retry })}</p> : null}
    {text ? <details className="codexAdvancedFold" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>{t('streamDraft')}</summary>
      {open ? <div><p className="codexSubscriptionHelp">{t('streamDraftHint')}</p>
        <Button type="button" variant="outline" onClick={() => { void copy() }}>{t(copied ? 'streamDraftCopied' : 'streamDraftCopy')}</Button>
        <pre tabIndex={0}>{text}</pre></div> : null}
    </details> : null}
  </aside>
}

export const INTERRUPTED_OUTPUT_CSS = '.codexInterruptedOutput{margin:12px 0}.codexInterruptedOutput>p{margin:0 0 8px}.codexInterruptedOutput details>div{padding:0 12px 12px}.codexInterruptedOutput pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font:inherit;font-size:13px;line-height:1.6;margin:10px 0 0}'
