import { randomUUID } from 'node:crypto'
import { WebError } from '@deepseek-ai/dsh-web'
import { readSubscriptionCredentials, subscriptionCredentialReady } from './subscription-credentials.js'
import { CODEX_SEARCH_URL } from './codex-search.js'
import { authFailureMessage, SIGN_IN_RENEW } from './http-failure.js'
import { USER_AGENT } from './version.js'
import { setTimeout as wait } from 'node:timers/promises'
import { diagnosticLog } from './diagnostic-log.js'

export const CODEX_FETCH_PROVIDER_ID = 'codex-subscription-fetch'
const MAX_CONTENT = 64_000
const RETRYABLE = new Set([500, 502, 503, 504])
const httpUrl = value => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

/** Read public page text through Codex commands.open; never call another provider. */
export function createCodexFetchProvider(options) {
  const fetchPage = options.fetch ?? fetch
  return Object.freeze({
    id: CODEX_FETCH_PROVIDER_ID,
    available: () => true,
    ready: llmProvider => options.allowed?.(llmProvider) === false ? false : subscriptionCredentialReady(options.readCredential),
    async fetch(request, signal) {
      signal?.throwIfAborted()
      if (options.allowed?.() === false) throw new WebError('Codex webpage reading is disabled for this model', 'WEB_PROVIDER_UNAVAILABLE')
      const url = typeof request?.url === 'string' && request.url.length <= 8192 ? httpUrl(request.url) : undefined
      if (url === undefined) throw new WebError('Codex webpage reading requires an HTTP or HTTPS URL without credentials', 'WEB_INVALID_URL')
      let credentials
      try { credentials = await readSubscriptionCredentials(options.getAuth, options.readCredential, signal) }
      catch {
        if (signal?.aborted) throw new WebError('Codex webpage request aborted', 'WEB_ABORTED')
        throw new WebError('Could not read ChatGPT subscription sign-in', 'WEB_PROVIDER_CREDENTIAL_MISSING')
      }
      const { access, accountId } = credentials
      if (typeof access !== 'string' || !access || typeof accountId !== 'string' || !accountId) throw new WebError('ChatGPT subscription is not signed in', 'WEB_PROVIDER_CREDENTIAL_MISSING')
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000)
      const activeSignal = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
      try {
        for (let attempt = 1; attempt <= 2; attempt++) {
          const response = await fetchPage(CODEX_SEARCH_URL, {
            method: 'POST', redirect: 'error',
            headers: { authorization: `Bearer ${access}`, 'chatgpt-account-id': accountId, accept: 'application/json', 'content-type': 'application/json', originator: 'pi', 'user-agent': USER_AGENT },
            body: JSON.stringify({
              id: options.resolveSessionId?.() || randomUUID(), model: options.resolveModel?.() || 'gpt-5.6-luna', input: url,
              commands: { open: [{ ref_id: url }], response_length: 'long' },
              settings: { allowed_callers: ['direct'], external_web_access: true }, max_output_tokens: 4096,
            }),
            signal: activeSignal,
          })
          activeSignal.throwIfAborted()
          diagnosticLog.info('fetch', `Codex webpage HTTP ${response.status}`, `attempt=${attempt}`)
          if (!response.ok) {
            if (RETRYABLE.has(response.status) && attempt === 1) {
              await response.body?.cancel()
              await wait(options.retryDelayMs ?? 250, undefined, { signal: activeSignal })
              continue
            }
            const authFailure = await authFailureMessage(response)
            throw new WebError(authFailure ?? `Codex webpage request failed (HTTP ${response.status})`, authFailure === SIGN_IN_RENEW ? 'WEB_PROVIDER_CREDENTIAL_MISSING' : 'WEB_PROVIDER_ERROR')
          }
          const value = await response.json()
          activeSignal.throwIfAborted()
          // SearchResponse.results is optional: real RFC opens return [] with readable
          // output. The service's normal page heading carries the final URL instead.
          // HTTP 200 "Internal Error ()" has neither a source nor that normal heading.
          const source = Array.isArray(value?.results) ? value.results.find(item => httpUrl(item?.url) !== undefined && item?.type !== 'error' && item?.title !== 'Internal Error') : undefined
          const output = typeof value?.output === 'string' ? value.output : ''
          const heading = output.split(/\r?\n/u, 1)[0].trim()
          const headingUrl = heading.endsWith(')') ? httpUrl(heading.slice(heading.lastIndexOf(' (') + 2, -1)) : undefined
          const metadata = output.slice(0, 1024)
          const pageUrl = source ? httpUrl(source.url) : headingUrl && /Content type:/u.test(metadata) && /Source: open\(/u.test(metadata) ? headingUrl : undefined
          const internalError = /^Internal Error(?:\s|\(|$)/iu.test(heading)
          if (!pageUrl || output.trim() === '' || internalError) {
            // Retry only the service's transient internal-error envelope, not
            // blocked pages, malformed extraction, authentication, or another source.
            if (attempt === 1 && !source && /^Internal Error(?:\s*\(\s*\))?\s*$/iu.test(heading)
              && !/non-retryable|not accessible|not safe|blocked|robots|forbidden|access denied/iu.test(output)) {
              diagnosticLog.warn('fetch', 'Codex webpage service returned an internal error; retrying once')
              await wait(options.retryDelayMs ?? 250, undefined, { signal: activeSignal })
              continue
            }
            const upstreamTimeout = internalError && /(?:^|\n)Failed to fetch [^\n]*:\s*\(\d+\)\s*Timeout fetching/iu.test(output)
            diagnosticLog.warn('fetch', 'Codex webpage text unavailable', upstreamTimeout ? 'upstream-timeout' : internalError ? 'upstream-error' : !pageUrl ? 'missing-source' : 'empty-output')
            if (upstreamTimeout) throw new WebError('Codex webpage service timed out fetching this page. Try another page, or change the webpage provider in settings.', 'WEB_FETCH_TIMEOUT')
            throw new WebError('Codex could not read this webpage. Try another page, or change the webpage provider in settings.', 'WEB_PROVIDER_ERROR')
          }
          const lineCount = Number(metadata.match(/Total lines: (\d+)/u)?.[1])
          const shownLines = new Set([...output.matchAll(/^L(\d+):/gmu)].map(match => Number(match[1]))).size
          const partialPage = Number.isSafeInteger(lineCount) && lineCount > 0 && shownLines > 0 && shownLines < lineCount
          // Like DSH's native Fetch API provider, 200 means this text retrieval succeeded;
          // the remote extraction service does not expose the origin server's HTTP status.
          return {
            url: pageUrl, statusCode: 200,
            body: { kind: 'text', content: output.slice(0, MAX_CONTENT) },
            truncated: output.length > MAX_CONTENT || partialPage,
          }
        }
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw new WebError('Codex webpage request aborted', 'WEB_ABORTED')
        if (activeSignal.aborted) throw new WebError('Codex webpage request timed out', 'WEB_FETCH_TIMEOUT')
        if (error instanceof WebError) throw error
        throw new WebError('Codex webpage request failed', 'WEB_PROVIDER_ERROR')
      }
    },
  })
}

/** Preserve DSH's configured fetch provider; only an explicit plugin choice changes dispatch. */
export function createCodexFetchRouter({ registry, configuredId, mode, codex }) {
  if (!(registry instanceof Map)) return undefined
  const wrappers = new Map()
  const wrapper = id => {
    if (!wrappers.has(id)) wrappers.set(id, Object.freeze({ id, available: () => mode() === 'codex',
      ready: llmProvider => mode() === 'codex' && (codex.ready?.(llmProvider) ?? true), fetch(request, signal) {
      if (mode() !== 'codex') throw new WebError('Codex webpage reading is no longer selected', 'WEB_PROVIDER_UNAVAILABLE')
      return codex.fetch(request, signal)
    } }))
    return wrappers.get(id)
  }
  return new Proxy(registry, {
    get(target, property) {
      if (property === 'get') return id => mode() === 'codex' && id === configuredId() ? wrapper(id) : target.get(id)
      // With no configured id, the native runtime requires exactly one usable provider.
      if (property === 'values' && mode() === 'codex' && configuredId() === undefined) return () => [wrapper(CODEX_FETCH_PROVIDER_ID)].values()
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** Match the runtime's live volatile selection and constructor-time env snapshot. */
export function configuredFetchProviderId(web, entries = [], ambient = process.env.DSH_WEB_FETCH_PROVIDER) {
  // Older DSH captures the effective id once in its constructor, including an
  // explicitly absent value. Match the same field that its native fetch reads.
  if ('fetchProviderId' in web) return web.fetchProviderId
  const environment = 'fetchProviderEnv' in web ? web.fetchProviderEnv : ambient
  if (typeof web.config?.fetchProvider?.get === 'function') return web.config.fetchProvider.get() ?? environment
  const entry = [...entries].find(item => item.options?.id === 'web')
  const value = entry?.fiber?.config?.fetchProvider
  if (typeof value?.get === 'function') return value.get() ?? environment
  return value ?? entry?.options?.config?.fetchProvider ?? environment
}
