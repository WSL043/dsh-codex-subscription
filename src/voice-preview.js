// A short sample of each live voice for the settings page, from the same catalog ChatGPT's own voice picker reads
// (GET settings/voices?spoken_language=...): samples are localized independently of descriptions.
import { normalizeVoiceLanguage } from './settings-contract.js'
import { createSharedRequests } from './shared-request.js'
const BASE = 'https://chatgpt.com/backend-api'
const CATALOG_TTL_MS = 10 * 60_000
const MAX_CLIP_BYTES = 2 * 1024 * 1024
const MAX_CACHED_AUDIO_BYTES = 8 * 1024 * 1024
const PREVIEW_HOSTS = /^https:\/\/[a-z0-9.-]*oaistatic\.com\//u

const failure = (code, message) => Object.assign(new Error(message), { code })

export function createVoicePreview({ fetch, credentials, userAgent, now = Date.now, base = BASE, maxCachedAudioBytes = MAX_CACHED_AUDIO_BYTES }) {
  const catalogs = new Map()
  const clips = new Map()
  const requests = createSharedRequests()
  const cacheLimit = Number.isSafeInteger(maxCachedAudioBytes) && maxCachedAudioBytes >= 0 ? maxCachedAudioBytes : MAX_CACHED_AUDIO_BYTES
  let accountId, generation = 0, audioBytes = 0
  const languageOf = value => { const language = normalizeVoiceLanguage(value); return language === 'auto' ? 'en' : language }
  const cancelled = () => new DOMException('Voice preview scope changed', 'AbortError')
  const clear = () => {
    generation++
    accountId = undefined
    catalogs.clear(); clips.clear(); audioBytes = 0
    requests.clear(cancelled())
  }
  const scope = async signal => {
    signal?.throwIfAborted()
    const current = generation, auth = await credentials(signal)
    signal?.throwIfAborted()
    if (current !== generation) throw cancelled()
    if (!auth?.access || !auth.accountId) { clear(); throw failure('voice-auth', 'ChatGPT sign-in is required') }
    if (accountId !== undefined && accountId !== auth.accountId) clear()
    accountId = auth.accountId
    return { ...auth, generation }
  }
  const readCatalog = async (auth, language, signal) => {
    signal?.throwIfAborted()
    if (auth.generation !== generation) throw cancelled()
    const catalog = catalogs.get(language)
    if (catalog && now() - catalog.at < CATALOG_TTL_MS) return catalog.voices
    return requests.run(`catalog:${language}`, async sharedSignal => {
      let value
      try {
        const response = await fetch(`${base}/settings/voices?spoken_language=${language}`, { headers: { authorization: `Bearer ${auth.access}`, 'chatgpt-account-id': auth.accountId, accept: 'application/json', 'user-agent': userAgent }, signal: AbortSignal.any([sharedSignal, AbortSignal.timeout(15_000)]) })
        if (response.status === 401) throw failure('voice-auth', 'ChatGPT sign-in needs renewal')
        if (!response.ok) throw failure('voice-catalog', `voice catalog HTTP ${response.status}`)
        value = await response.json()
        if (!Array.isArray(value?.voices)) throw failure('voice-catalog', 'Invalid voice catalog')
        sharedSignal.throwIfAborted()
      } catch (error) {
        sharedSignal.throwIfAborted()
        if (error?.code === 'voice-auth' || error?.code === 'voice-catalog') throw error
        throw failure('voice-catalog', 'Could not load the voice catalog')
      }
      const voices = (Array.isArray(value?.voices) ? value.voices : []).filter(entry => typeof entry?.name === 'string' && typeof entry?.preview_url === 'string' && PREVIEW_HOSTS.test(entry.preview_url))
      if (auth.generation !== generation) throw cancelled()
      catalogs.set(language, { at: now(), voices })
      return voices
    }, signal)
  }
  return {
    clear,
    /** Which voices ChatGPT's own catalog offers right now (lower-case names), so the settings can mark the others unavailable. */
    async available(language, signal) {
      const auth = await scope(signal)
      const voices = await readCatalog(auth, languageOf(language), signal)
      signal?.throwIfAborted()
      if (auth.generation !== generation) throw cancelled()
      return voices.map(entry => entry.name.toLowerCase())
    },
    /** The clip of one voice (by its Codex name, e.g. "spruce") as a data URL, with the catalog's description. */
    async preview(voice, selectedLanguage, signal) {
      signal?.throwIfAborted()
      if (typeof voice !== 'string' || !/^[a-z]{2,16}$/u.test(voice)) return undefined
      const auth = await scope(signal)
      const language = languageOf(selectedLanguage)
      const entry = (await readCatalog(auth, language, signal)).find(item => item.name.toLowerCase() === voice || item.voice === voice)
      signal?.throwIfAborted()
      if (auth.generation !== generation) throw cancelled()
      if (!entry) return undefined
      const key = `${language}:${voice}:${entry.preview_url}`
      let audio = clips.get(key)
      if (audio) { clips.delete(key); clips.set(key, audio) }
      else audio = await requests.run(`clip:${key}`, async sharedSignal => {
        let bytes
        try {
          const response = await fetch(entry.preview_url, { signal: AbortSignal.any([sharedSignal, AbortSignal.timeout(15_000)]) })
          if (!response.ok) throw failure('voice-download', `voice sample HTTP ${response.status}`)
          bytes = Buffer.from(await response.arrayBuffer())
          if (bytes.byteLength === 0 || bytes.byteLength > MAX_CLIP_BYTES) throw failure('voice-download', 'voice sample has an unexpected size')
          sharedSignal.throwIfAborted()
        } catch {
          sharedSignal.throwIfAborted()
          throw failure('voice-download', 'Could not download the voice sample')
        }
        const type = /\.mp3(?:$|\?)/u.test(entry.preview_url) ? 'audio/mpeg' : 'audio/mp4'
        const value = `data:${type};base64,${bytes.toString('base64')}`
        if (auth.generation !== generation) throw cancelled()
        if (value.length <= cacheLimit) {
          while (clips.size >= 40 || audioBytes + value.length > cacheLimit) {
            const oldest = clips.keys().next().value
            if (oldest === undefined) break
            audioBytes -= clips.get(oldest).length
            clips.delete(oldest)
          }
          clips.set(key, value); audioBytes += value.length
        }
        return value
      }, signal)
      signal?.throwIfAborted()
      if (auth.generation !== generation) throw cancelled()
      return { name: entry.name, description: typeof entry.description === 'string' ? entry.description.slice(0, 120) : '', accent: typeof entry.accent === 'string' ? entry.accent.slice(0, 60) : '', audio }
    },
  }
}
