// A short sample of each live voice for the settings page, from the same catalog ChatGPT's own voice picker reads
// (GET settings/voices): every entry has a name, a one-line description and a static preview clip.
const BASE = 'https://chatgpt.com/backend-api'
const CATALOG_TTL_MS = 10 * 60_000
const MAX_CLIP_BYTES = 2 * 1024 * 1024
const PREVIEW_HOSTS = /^https:\/\/[a-z0-9.-]*oaistatic\.com\//u

export function createVoicePreview({ fetch, credentials, userAgent, now = Date.now, base = BASE }) {
  let catalog
  const readCatalog = async () => {
    if (catalog && now() - catalog.at < CATALOG_TTL_MS) return catalog.voices
    const { access, accountId } = await credentials()
    const response = await fetch(`${base}/settings/voices`, { headers: { authorization: `Bearer ${access}`, 'chatgpt-account-id': accountId, accept: 'application/json', 'user-agent': userAgent }, signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`voice catalog HTTP ${response.status}`)
    const value = await response.json()
    const voices = (Array.isArray(value?.voices) ? value.voices : []).filter(entry => typeof entry?.name === 'string' && typeof entry?.preview_url === 'string' && PREVIEW_HOSTS.test(entry.preview_url))
    catalog = { at: now(), voices }
    return voices
  }
  return {
    /** The clip of one voice (by its Codex name, e.g. "spruce") as a data URL, with the catalog's description. */
    async preview(voice) {
      if (typeof voice !== 'string' || !/^[a-z]{2,16}$/u.test(voice)) return undefined
      const entry = (await readCatalog()).find(item => item.name.toLowerCase() === voice || item.voice === voice)
      if (!entry) return undefined
      const response = await fetch(entry.preview_url, { signal: AbortSignal.timeout(15_000) })
      if (!response.ok) throw new Error(`voice sample HTTP ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_CLIP_BYTES) throw new Error('voice sample has an unexpected size')
      const type = /\.mp3(?:$|\?)/u.test(entry.preview_url) ? 'audio/mpeg' : 'audio/mp4'
      return { name: entry.name, description: typeof entry.description === 'string' ? entry.description.slice(0, 120) : '', accent: typeof entry.accent === 'string' ? entry.accent.slice(0, 60) : '', audio: `data:${type};base64,${bytes.toString('base64')}` }
    },
  }
}
