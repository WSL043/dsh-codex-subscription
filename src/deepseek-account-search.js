import { WebError } from '@deepseek-ai/dsh-web'
import { USER_AGENT } from './version.js'

export const DSH_ACCOUNT_SEARCH_PROVIDER_ID = 'codex-subscription-dsh'
// Same defaults as DSH's web-deepseek-api plugin, which owns the real values in its config.
const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1/tools'
const DEFAULT_COUNT = 10
const MAX_QUESTION = 128

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const missing = message => new WebError(message, 'WEB_PROVIDER_CREDENTIAL_MISSING')

function parseSources(value) {
  if (!record(value) || !Array.isArray(value.results)) throw new WebError('DeepSeek returned an invalid search response', 'WEB_PROVIDER_ERROR')
  return {
    sources: value.results.flatMap(item => {
      if (!record(item) || typeof item.url !== 'string' || item.url.length === 0) return []
      return [{
        url: item.url,
        ...typeof item.title === 'string' && item.title.length > 0 ? { title: item.title } : {},
        ...typeof item.snippet === 'string' && item.snippet.length > 0 ? { snippet: item.snippet } : {},
        ...typeof item.date === 'string' && item.date.length > 0 ? { publishedAt: item.date } : {},
      }]
    }),
    truncated: false,
  }
}

/**
 * Search through DeepSeek's Search API with the signed-in DeepSeek account, for conversations whose
 * model is not a DeepSeek Account one (DSH itself only hands the account token to those).
 */
export async function searchWithDeepSeekAccount(options, request, signal) {
  signal?.throwIfAborted()
  const account = options.resolveAccount?.()
  if (typeof account?.resolveToken !== 'function') throw missing('DeepSeek account sign-in is not available')
  const config = options.resolveConfig?.() ?? {}
  const baseURL = typeof config.baseURL === 'string' && config.baseURL.length > 0 ? config.baseURL : DEFAULT_BASE_URL
  const count = Number.isInteger(config.count) && config.count > 0 ? config.count : DEFAULT_COUNT
  let endpoint
  try {
    endpoint = `${new URL(baseURL).href.replace(/\/+$/u, '')}/search`
  } catch {
    throw new WebError('DeepSeek search base URL is invalid', 'WEB_PROVIDER_ERROR')
  }
  let token
  try {
    token = await account.resolveToken(endpoint)
  } catch {
    throw missing('DeepSeek account sign-in could not be read')
  }
  if (typeof token !== 'string' || token.length === 0) throw missing('DeepSeek account is not signed in')
  const question = config.sendOriginalQuestion === false ? undefined
    : Array.from((options.resolveQuestion?.() ?? '').replace(/\s+/gu, ' ').trim()).slice(0, MAX_QUESTION).join('')
  let response
  try {
    response = await (options.fetch ?? fetch)(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'x-dsh-auth-token': token,
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': USER_AGENT,
      },
      body: JSON.stringify({
        query: request.query,
        count: Math.min(count, request.maxResults ?? count),
        need_content: false,
        ...question ? { ori_question: question } : {},
      }),
      signal,
    })
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw new WebError('DeepSeek web request aborted', 'WEB_ABORTED', { cause: error })
    throw new WebError('DeepSeek web request failed', 'WEB_PROVIDER_ERROR', { cause: error })
  }
  if (!response.ok) {
    throw response.status === 401
      ? new WebError('DeepSeek rejected the account sign-in used for web search; sign in to DeepSeek again', 'WEB_PROVIDER_ERROR')
      : new WebError(`DeepSeek search request failed (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR')
  }
  let body
  try {
    body = await response.json()
  } catch (error) {
    throw new WebError('DeepSeek returned an unreadable search response', 'WEB_PROVIDER_ERROR', { cause: error })
  }
  return parseSources(body)
}

/**
 * The DSH search source with the account fallback: DSH's own provider goes first, and only when it
 * reports a missing credential (no API key, model not a DeepSeek Account one) the account token is used.
 */
export function createDshAccountSearchProvider(options) {
  return Object.freeze({
    id: DSH_ACCOUNT_SEARCH_PROVIDER_ID,
    available: () => true,
    async search(request, signal) {
      const provider = options.resolveDshProvider?.()
      if (provider === undefined || provider.id === DSH_ACCOUNT_SEARCH_PROVIDER_ID || provider.available() !== true) {
        throw new WebError('DSH default search is unavailable', 'WEB_PROVIDER_UNAVAILABLE')
      }
      try {
        const result = await provider.search(request, signal)
        options.report?.(`answered by DSH provider ${provider.id}`)
        return result
      } catch (error) {
        if (error?.code !== 'WEB_PROVIDER_CREDENTIAL_MISSING' || signal?.aborted) throw error
        // The fallback bills the account's Search API per successful request; callers can turn it off.
        if (options.allowAccountFallback?.() === false) {
          options.report?.('DeepSeek account fallback disabled')
          throw error
        }
        try {
          const result = await searchWithDeepSeekAccount(options, request, signal)
          options.report?.('answered by DeepSeek account fallback')
          return result
        } catch (fallback) {
          options.report?.(`DeepSeek account fallback failed: ${fallback?.message}`)
          throw fallback?.code === 'WEB_PROVIDER_CREDENTIAL_MISSING' ? error : fallback
        }
      }
    },
  })
}
