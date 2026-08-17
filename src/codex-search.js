import { randomUUID } from 'node:crypto'

import { WebError } from '@deepseek-ai/dsh-web'

export const CODEX_SEARCH_PROVIDER_ID = 'codex-subscription'
export const CODEX_SEARCH_URL = 'https://chatgpt.com/backend-api/codex/alpha/search'

const DEFAULT_MODEL = 'gpt-5.6-luna'
const MAX_OUTPUT_TOKENS = 4096
const MAX_SOURCE_DATE = 64

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = value => typeof value === 'string' && value.length > 0 ? value : undefined
const displayText = value => {
  const text = nonEmpty(value)?.replace(/\s+/gu, ' ').trim()
  if (text === undefined || text.length === 0) return undefined
  return text
}
const boundedDisplayText = (value, maximum) => {
  const text = displayText(value)
  if (text === undefined || text.length <= maximum) return text
  return `${text.slice(0, maximum - 1)}…`
}

function sourceOf(value) {
  if (!record(value)) return undefined
  const url = nonEmpty(value.url)
  if (url === undefined) return undefined
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  const title = displayText(value.title) ?? parsed.hostname
  const snippet = displayText(value.snippet)
  const publishedAt = boundedDisplayText(value.published_at, MAX_SOURCE_DATE)
    ?? boundedDisplayText(value.publishedAt, MAX_SOURCE_DATE)
  return {
    url,
    title,
    ...(snippet === undefined ? {} : { snippet }),
    ...(publishedAt === undefined ? {} : { publishedAt }),
  }
}

function parseSearchResponse(value) {
  if (!record(value) || !Array.isArray(value.results)) {
    throw new Error('Codex returned a malformed search response')
  }
  const seen = new Set()
  const sources = []
  for (const result of value.results ?? []) {
    const source = sourceOf(result)
    if (source === undefined || seen.has(source.url)) continue
    seen.add(source.url)
    sources.push(source)
  }
  return {
    sources,
    truncated: false,
  }
}

/** Create the DSH web provider backed only by the ChatGPT subscription search endpoint. */
export function createCodexSearchProvider(options) {
  const fetchSearch = options.fetch ?? fetch
  return Object.freeze({
    id: CODEX_SEARCH_PROVIDER_ID,
    available: () => true,
    async search(request, signal) {
      const auth = await options.getAuth({ signal })
      const credential = await options.readCredential({ signal })
      const access = auth?.auth?.apiKey
      const accountId = credential?.type === 'oauth' ? credential.accountId : undefined
      if (typeof access !== 'string' || access.length === 0
        || typeof accountId !== 'string' || accountId.length === 0) {
        throw new WebError('ChatGPT subscription is not signed in', 'WEB_PROVIDER_CREDENTIAL_MISSING')
      }
      const model = nonEmpty(options.resolveModel?.()) ?? DEFAULT_MODEL
      const id = nonEmpty(options.resolveSessionId?.()) ?? randomUUID()
      let response
      try {
        response = await fetchSearch(CODEX_SEARCH_URL, {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${access}`,
            'chatgpt-account-id': accountId,
            accept: 'application/json',
            'content-type': 'application/json',
            originator: 'pi',
            'user-agent': 'dsh-codex-subscription/0.3.2',
          },
          body: JSON.stringify({
            id,
            model,
            input: request.query,
            commands: {
              search_query: [{ q: request.query }],
              response_length: 'short',
            },
            settings: {
              allowed_callers: ['direct'],
              external_web_access: true,
            },
            max_output_tokens: MAX_OUTPUT_TOKENS,
          }),
          signal,
        })
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') {
          throw new WebError('Codex search aborted', 'WEB_ABORTED', { cause: error })
        }
        throw new WebError('Codex search request failed', 'WEB_PROVIDER_ERROR', { cause: error })
      }
      if (!response.ok) {
        throw response.status === 401 || response.status === 403
          ? new WebError('ChatGPT sign-in needs to be renewed', 'WEB_PROVIDER_CREDENTIAL_MISSING')
          : new WebError(`Codex search request failed (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR')
      }
      let value
      try {
        value = await response.json()
      } catch (error) {
        throw new WebError('Codex returned an unreadable search response', 'WEB_PROVIDER_ERROR', { cause: error })
      }
      try {
        return parseSearchResponse(value)
      } catch (error) {
        throw new WebError('Codex returned a malformed search response', 'WEB_PROVIDER_ERROR', { cause: error })
      }
    },
  })
}
