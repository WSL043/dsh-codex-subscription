import { createElement, useMemo, useState } from 'react'
import { webFetchPreview, readableWebFetchText } from './web-fetch-preview.js'

export const WEB_FETCH_PREVIEW_CSS = `
.codexWebFetchBody{margin:4px 0 8px 20px;font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}
.codexWebFetchBody>summary{cursor:pointer;min-height:24px;line-height:24px}
.codexWebFetchBody pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.6;max-height:360px;overflow:auto;padding:8px 10px;margin:4px 0;border:1px solid var(--dsw-alias-border-primary,#8884);border-radius:6px;color:var(--dsw-alias-label-primary,inherit)}
`

export function WebFetchWithBody({ nativeEntry, nativeT, t, ...owner }) {
  const entry = nativeEntry()
  const preview = useMemo(() => webFetchPreview(owner.block), [owner.block])
  const [open, setOpen] = useState(false)
  const readable = useMemo(() => open && preview ? readableWebFetchText(preview.text) : '', [open, preview])
  return <>
    {entry ? createElement(entry.component, { ...owner, t: nativeT }) : null}
    {!preview ? null : <details className="codexWebFetchBody" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>{t(preview.partial ? 'webFetchPartialBody' : 'webFetchBody')} · {t('webFetchBodySize', { count: preview.text.length.toLocaleString() })}</summary>
      {open ? <pre>{readable}</pre> : null}
    </details>}
  </>
}
