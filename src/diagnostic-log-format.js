// Pure text helpers shared by the server log and the settings page (no Node built-ins here).
const MAX_MESSAGE = 300

export function sanitizeLogText(value) {
  let text = typeof value === 'string' ? value : String(value?.message ?? value ?? '')
  text = text
    .replace(/Bearer\s+[\w.~+/=-]+/giu, 'Bearer ***')
    .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}(?:\.[\w-]*)?/gu, '***')
    .replace(/\b(token|access_token|refresh_token|id_token|code|key|secret|password|authorization)=[^\s&"']+/giu, '$1=***')
    .replace(/(["']?(?:access|refresh|id)_?token["']?\s*[:=]\s*)["'][^"']+["']/giu, '$1"***"')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu, '***@***')
    .replace(/https?:\/\/[^\s"'<>)]+/giu, url => url.split(/[?#]/u)[0])
    .replace(/[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+/gu, '~')
    .replace(/\/(?:home|Users)\/[^/\s"']+/gu, '~')
    .replace(/\b[0-9a-f]{32,}\b/giu, '***')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/gu, '***')
    .replace(/\s+/gu, ' ')
    .trim()
  return text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)}…` : text
}

export function formatLogLine(entry) {
  const stamp = new Date(entry.time).toISOString().replace('T', ' ').slice(0, 19)
  const repeat = entry.count > 1 ? ` (x${entry.count})` : ''
  return `${stamp} ${entry.level.toUpperCase().padEnd(5)} [${entry.area}] ${entry.message}${entry.detail ? ` — ${entry.detail}` : ''}${repeat}`
}
