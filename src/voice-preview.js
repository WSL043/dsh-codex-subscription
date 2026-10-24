// A short sample of each live voice for the settings page, from the same catalog ChatGPT's own voice picker reads
// (GET settings/voices?spoken_language=...): samples are localized independently of descriptions.
import { normalizeVoiceLanguage } from './settings-contract.js'
const BASE = 'https://chatgpt.com/backend-api'
const CATALOG_TTL_MS = 10 * 60_000
const MAX_CLIP_BYTES = 2 * 1024 * 1024
const PREVIEW_HOSTS = /^https:\/\/[a-z0-9.-]*oaistatic\.com\//u

const failure = (code, message) => Object.assign(new Error(message), { code })

export function createVoicePreview({ fetch, credentials, userAgent, now = Date.now, base = BASE }) {
  const catalogs = new Map()
  const clips = new Map()
  const languageOf = value => { const language = normalizeVoiceLanguage(value); return language === 'auto' ? 'en' : language }
  const readCatalog = async (language, signal) => {
    signal?.throwIfAborted()
    const catalog = catalogs.get(language)
    if (catalog && now() - catalog.at < CATALOG_TTL_MS) return catalog.voices
    let value
    try {
      const { access, accountId } = await credentials(signal)
      if (!access || !accountId) throw failure('voice-auth', 'ChatGPT sign-in is required')
      const response = await fetch(`${base}/settings/voices?spoken_language=${language}`, { headers: { authorization: `Bearer ${access}`, 'chatgpt-account-id': accountId, accept: 'application/json', 'user-agent': userAgent }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) })
      if (response.status === 401) throw failure('voice-auth', 'ChatGPT sign-in needs renewal')
      if (!response.ok) throw failure('voice-catalog', `voice catalog HTTP ${response.status}`)
      value = await response.json()
      if (!Array.isArray(value?.voices)) throw failure('voice-catalog', 'Invalid voice catalog')
      signal?.throwIfAborted()
    } catch (error) {
      signal?.throwIfAborted()
      if (error?.code === 'voice-auth' || error?.code === 'voice-catalog') throw error
      throw failure('voice-catalog', 'Could not load the voice catalog')
    }
    const voices = (Array.isArray(value?.voices) ? value.voices : []).filter(entry => typeof entry?.name === 'string' && typeof entry?.preview_url === 'string' && PREVIEW_HOSTS.test(entry.preview_url))
    catalogs.set(language, { at: now(), voices })
    return voices
  }
  return {
    /** Which voices ChatGPT's own catalog offers right now (lower-case names), so the settings can mark the others unavailable. */
    async available(language, signal) { return (await readCatalog(languageOf(language), signal)).map(entry => entry.name.toLowerCase()) },
    /** The clip of one voice (by its Codex name, e.g. "spruce") as a data URL, with the catalog's description. */
    async preview(voice, selectedLanguage, signal) {
      signal?.throwIfAborted()
      if (typeof voice !== 'string' || !/^[a-z]{2,16}$/u.test(voice)) return undefined
      const language = languageOf(selectedLanguage)
      const key = `${language}:${voice}`
      if (clips.has(key)) return clips.get(key)
      const entry = (await readCatalog(language, signal)).find(item => item.name.toLowerCase() === voice || item.voice === voice)
      if (!entry) return undefined
      let bytes
      try {
        const response = await fetch(entry.preview_url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) })
        if (!response.ok) throw failure('voice-download', `voice sample HTTP ${response.status}`)
        bytes = Buffer.from(await response.arrayBuffer())
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_CLIP_BYTES) throw failure('voice-download', 'voice sample has an unexpected size')
        signal?.throwIfAborted()
      } catch {
        signal?.throwIfAborted()
        throw failure('voice-download', 'Could not download the voice sample')
      }
      const type = /\.mp3(?:$|\?)/u.test(entry.preview_url) ? 'audio/mpeg' : 'audio/mp4'
      const result = { name: entry.name, description: typeof entry.description === 'string' ? entry.description.slice(0, 120) : '', accent: typeof entry.accent === 'string' ? entry.accent.slice(0, 60) : '', audio: `data:${type};base64,${bytes.toString('base64')}` }
      if (clips.size < 40) clips.set(key, result)
      return result
    },
  }
}
