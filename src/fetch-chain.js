import { WebError } from '@deepseek-ai/dsh-web'
import { FETCH_CHAIN_PROVIDER_ID, validateFetchOrder } from './fetch-order.js'

const FALLBACK_ERRORS = new Set([
  'WEB_PROVIDER_ERROR',
  'WEB_PROVIDER_CREDENTIAL_MISSING',
  'WEB_FETCH_TIMEOUT',
  'WEB_FETCH_CERTIFICATE_INVALID',
  'WEB_FETCH_CONNECTION_INTERRUPTED',
  'WEB_FETCH_CONNECTION_REFUSED',
  'WEB_FETCH_CONNECTION_TIMEOUT',
  'WEB_FETCH_DNS_FAILED',
  'WEB_FETCH_NETWORK_ERROR',
  'WEB_FETCH_NETWORK_UNREACHABLE',
  'WEB_FETCH_TOO_LARGE',
  'WEB_UNSUPPORTED_CONTENT_TYPE',
])

// Installed plugins can bundle a different copy of WebError than the host providers.
export const canFallbackFetch = error => (error instanceof WebError || error instanceof Error && error.name === 'WebError')
  && error.name !== 'AbortError' && FALLBACK_ERRORS.has(error.code)
const summarize = attempts => attempts.map(attempt => `${attempt.id} (${attempt.code ?? `HTTP ${attempt.statusCode}`})`).join('; ')
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function createFetchChainProvider({ order, resolveProvider, allowed = () => true, authorize = () => {}, report = () => {} }) {
  const assertActive = signal => {
    signal?.throwIfAborted()
    if (!allowed()) throw new WebError('Webpage reading order is no longer active', 'WEB_PROVIDER_UNAVAILABLE')
  }
  const authorizeFetch = async (id, signal) => {
    assertActive(signal)
    await authorize(id)
    assertActive(signal)
  }

  return Object.freeze({
    id: FETCH_CHAIN_PROVIDER_ID,
    title: 'Webpage reading order',
    available: () => true,
    async ready(llmProvider) {
      if (!allowed()) return false
      const ids = validateFetchOrder(order())
      let selectionFailure = false
      for (const id of ids) {
        if (!allowed()) return false
        await authorize(id, llmProvider)
        if (!allowed()) return false
        const provider = resolveProvider(id)
        if (!allowed()) return false
        const available = provider?.available()
        if (!allowed()) return false
        if (!provider || !available) {
          selectionFailure = true
          continue
        }
        if (!allowed()) return false
        await authorize(id, llmProvider)
        if (!allowed()) return false
        let ready
        try { ready = await provider.ready?.(llmProvider) ?? true }
        catch (error) {
          if (!allowed()) return false
          if (!canFallbackFetch(error)) throw error
          continue
        }
        if (!allowed()) return false
        if (ready) return true
      }
      return selectionFailure
    },
    async fetch(request, signal) {
      assertActive(signal)
      const ids = validateFetchOrder(order())
      const failures = []
      const fail = attempt => {
        failures.push(attempt)
        report({ ...attempt })
      }
      for (const id of ids) {
        await authorizeFetch(id, signal)
        assertActive(signal)
        const provider = resolveProvider(id)
        assertActive(signal)
        if (!provider) {
          fail({ id, outcome: 'missing', code: 'WEB_PROVIDER_CONFIGURED_MISSING' })
          continue
        }
        const available = provider.available()
        assertActive(signal)
        if (!available) {
          fail({ id, outcome: 'unavailable', code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' })
          continue
        }
        await authorizeFetch(id, signal)
        assertActive(signal)
        let result
        try { result = await provider.fetch(request, signal) }
        catch (error) {
          assertActive(signal)
          if (!canFallbackFetch(error)) throw error
          fail({ id, outcome: 'failed', code: error.code })
          continue
        }
        assertActive(signal)
        if (!Number.isInteger(result.statusCode)) throw new TypeError('Webpage provider returned an invalid HTTP status')
        if (result.statusCode < 200 || result.statusCode >= 300) {
          fail({ id, outcome: 'failed', statusCode: result.statusCode })
          continue
        }
        if (!result.body.content.trim()) {
          fail({ id, outcome: 'failed', code: 'WEB_FETCH_EMPTY_BODY' })
          continue
        }
        report({ id, outcome: 'success', statusCode: result.statusCode })
        assertActive(signal)
        if (failures.length === 0) return result
        const notice = `[Reader fallback: ${summarize(failures)}; used provider ${id}.]`
        const content = result.body.kind === 'html'
          ? `<p>${escapeHtml(notice)}</p>\n${result.body.content}`
          : `${notice}\n\n${result.body.content}`
        return { ...result, body: { ...result.body, content } }
      }
      assertActive(signal)
      throw new WebError(`Webpage reading order failed: ${summarize(failures)}`, 'WEB_FETCH_CHAIN_FAILED')
    },
  })
}
