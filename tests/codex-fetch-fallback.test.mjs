import assert from 'node:assert/strict'
import test from 'node:test'
import { WebError, WebRuntime } from '@deepseek-ai/dsh-web'
import { CODEX_FETCH_PROVIDER_ID, CODEX_FETCH_FALLBACK_PROVIDER_ID, createCodexFetchProvider, createCodexFallbackFetchProvider, createCodexFetchRouter, resolveDshFetchProvider } from '../src/codex-fetch.js'
import { normalizeFetchProvider } from '../src/settings-contract.js'
import { PREFERENCE_FIELDS } from '../src/preference-fields.js'

const request = { url: 'https://example.com/' }
const result = { url: request.url, statusCode: 200, body: { kind: 'text', content: 'Page' }, truncated: false }
const failure = code => new WebError('Sanitized failure', code)
const native = (id, overrides = {}) => ({ id, available: () => true, fetch: async () => result, ...overrides })
const assertFallback = (value, code = 'WEB_PROVIDER_ERROR', id = 'http') => assert.deepEqual(value, { ...result, body: { kind: 'text', content: `[Reader fallback: Codex failed (${code}); used DSH provider ${id}.]\n\n${result.body.content}` } })

function fixture(codex) {
  const calls = []
  const provider = createCodexFallbackFetchProvider({
    codex: { fetch: async (...args) => { calls.push(['codex', ...args]); return codex(...args) } },
    resolveDshProvider: () => {
      calls.push(['resolve'])
      return native('http', { fetch: async (...args) => { calls.push(['dsh', ...args]); return result } })
    },
  })
  return { provider, calls }
}

test('fallback mode is an explicit validated choice and leaves the existing default unchanged', () => {
  for (const mode of ['dsh', 'codex', 'codex-fallback']) {
    assert.equal(normalizeFetchProvider(mode), mode)
    assert.ok(PREFERENCE_FIELDS.fetchProvider.choices.includes(mode))
  }
  assert.equal(normalizeFetchProvider(undefined), 'dsh')
  assert.equal(normalizeFetchProvider('unknown'), 'dsh')
})

test('successful Codex reads never resolve or call a DSH provider', async () => {
  const { provider, calls } = fixture(async () => result)
  assert.equal(provider.id, CODEX_FETCH_FALLBACK_PROVIDER_ID)
  assert.equal(await provider.fetch(request), result)
  assert.deepEqual(calls, [['codex', request, undefined]])
})

for (const code of ['WEB_PROVIDER_ERROR', 'WEB_FETCH_TIMEOUT', 'WEB_PROVIDER_CREDENTIAL_MISSING']) {
  test(`${code} falls back exactly once with the original URL and caller signal`, async () => {
    const { provider, calls } = fixture(async () => { throw failure(code) })
    const signal = new AbortController().signal
    assertFallback(await provider.fetch(request, signal), code)
    assert.deepEqual(calls, [['codex', request, signal], ['resolve'], ['dsh', request, signal]])
  })
}

for (const code of ['WEB_ABORTED', 'WEB_INVALID_URL', 'WEB_PROVIDER_UNAVAILABLE', 'AUTHORIZATION_DENIED', 'TOOL_PERMISSION_DENIED', 'UNKNOWN']) {
  test(`${code} does not bypass cancellation, invalid input or permission policy`, async () => {
    const error = failure(code)
    const { provider, calls } = fixture(async () => { throw error })
    await assert.rejects(provider.fetch(request), value => value === error)
    assert.equal(calls.length, 1)
  })
}

test('an uncoded error is not treated as an upstream service failure', async () => {
  const error = new Error('Unexpected implementation failure')
  const { provider, calls } = fixture(async () => { throw error })
  await assert.rejects(provider.fetch(request), value => value === error)
  assert.equal(calls.length, 1)
})

test('already-cancelled calls and cancellation during primary failure never reach fallback', async () => {
  const controller = new AbortController()
  const first = fixture(async () => result)
  controller.abort()
  await assert.rejects(first.provider.fetch(request, controller.signal))
  assert.deepEqual(first.calls, [])
  const during = new AbortController()
  const second = fixture(async () => { during.abort(); throw failure('WEB_PROVIDER_ERROR') })
  await assert.rejects(second.provider.fetch(request, during.signal))
  assert.equal(second.calls.length, 1)
})

test('changing the mode or unloading during a primary failure prevents fallback', async () => {
  let active = true, nativeCalls = 0
  const provider = createCodexFallbackFetchProvider({
    allowed: () => active,
    codex: { fetch: async () => { active = false; throw failure('WEB_FETCH_TIMEOUT') } },
    resolveDshProvider: () => { nativeCalls++; return native('http') },
  })
  await assert.rejects(provider.fetch(request), error => error.code === 'WEB_PROVIDER_UNAVAILABLE')
  await assert.rejects(provider.fetch(request), error => error.code === 'WEB_PROVIDER_UNAVAILABLE')
  assert.equal(await provider.ready(), false)
  assert.equal(nativeCalls, 0)
})

test('DSH failures remain visible without retry, masking permission errors or returning to Codex', async () => {
  const denied = failure('AUTHORIZATION_DENIED')
  let calls = 0
  const provider = createCodexFallbackFetchProvider({
    codex: { fetch: async () => { calls++; throw failure('WEB_PROVIDER_ERROR') } },
    resolveDshProvider: () => native('http', { fetch: async () => { calls++; throw denied } }),
  })
  await assert.rejects(provider.fetch(request), error => error === denied)
  assert.equal(calls, 2)
})

test('native provider resolution honors explicit selection, availability and ambiguity without recursion', () => {
  const http = native('http'), deepseek = native('deepseek-fetch-api')
  const registry = new Map([[http.id, http], [deepseek.id, deepseek], [CODEX_FETCH_PROVIDER_ID, native(CODEX_FETCH_PROVIDER_ID)], [CODEX_FETCH_FALLBACK_PROVIDER_ID, native(CODEX_FETCH_FALLBACK_PROVIDER_ID)]])
  assert.equal(resolveDshFetchProvider(registry, 'http'), http)
  assert.equal(resolveDshFetchProvider(registry, 'deepseek-fetch-api'), deepseek)
  for (const id of ['missing', CODEX_FETCH_PROVIDER_ID, CODEX_FETCH_FALLBACK_PROVIDER_ID]) {
    assert.throws(() => resolveDshFetchProvider(registry, id), error => error.code === 'WEB_PROVIDER_CONFIGURED_MISSING')
  }
  assert.throws(() => resolveDshFetchProvider(registry), error => error.code === 'WEB_PROVIDER_AMBIGUOUS')
  registry.set('http', native('http', { available: () => false }))
  assert.throws(() => resolveDshFetchProvider(registry, 'http'), error => error.code === 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE')
  assert.equal(resolveDshFetchProvider(registry), deepseek)
  registry.delete('deepseek-fetch-api')
  assert.throws(() => resolveDshFetchProvider(registry), error => error.code === 'WEB_PROVIDER_UNAVAILABLE')
})

test('signed-out Codex can report ready through the native reader without making a request', async () => {
  const provider = createCodexFallbackFetchProvider({
    codex: { ready: async () => false },
    resolveDshProvider: () => native('http', { ready: async route => route === 'openai-codex' }),
  })
  assert.equal(await provider.ready('openai-codex'), true)
  assert.equal(await provider.ready('other'), false)
  assert.equal(await createCodexFallbackFetchProvider({ codex: { ready: async () => false }, resolveDshProvider: () => { throw failure('WEB_PROVIDER_AMBIGUOUS') } }).ready(), true)
})

for (const status of [401, 403, 429, 503]) {
  test(`an OAI HTTP ${status} service failure can fall back; it is not a DSH authorization denial`, async () => {
    let requests = 0, nativeCalls = 0
    const codex = createCodexFetchProvider({
      getAuth: async () => ({ auth: { apiKey: 'test-token' } }),
      readCredential: async () => ({ type: 'oauth', access: 'test-token', accountId: 'test-account' }),
      retryDelayMs: 0,
      fetch: async () => { requests++; return new Response('', { status }) },
    })
    const provider = createCodexFallbackFetchProvider({ codex, resolveDshProvider: () => native('http', { fetch: async () => { nativeCalls++; return result } }) })
    assertFallback(await provider.fetch(request), status === 401 ? 'WEB_PROVIDER_CREDENTIAL_MISSING' : 'WEB_PROVIDER_ERROR')
    assert.equal(requests, status === 503 ? 2 : 1)
    assert.equal(nativeCalls, 1)
  })
}

test('fallback notices preserve HTML content and escape the provider label', async () => {
  const provider = createCodexFallbackFetchProvider({
    codex: { fetch: async () => { throw failure('WEB_FETCH_TIMEOUT') } },
    resolveDshProvider: () => native('<custom&reader>', { fetch: async () => ({ ...result, body: { kind: 'html', content: '<h1>Native page</h1>' } }) }),
  })
  const value = await provider.fetch(request)
  assert.equal(value.body.kind, 'html')
  assert.match(value.body.content, /^<p>\[Reader fallback: Codex failed \(WEB_FETCH_TIMEOUT\); used DSH provider &lt;custom&amp;reader&gt;\.\]<\/p>\n<h1>Native page<\/h1>$/u)
})

test('legacy routing supports the new mode, follows the current native selection and preserves Codex-only', async () => {
  let mode = 'codex-fallback', configured = 'http', primaryCalls = 0
  const calls = []
  const registry = new Map(['http', 'deepseek-fetch-api'].map(id => [id, native(id, { fetch: async () => { calls.push(id); return result } })]))
  const error = failure('WEB_PROVIDER_ERROR')
  const router = createCodexFetchRouter({ registry, configuredId: () => configured, mode: () => mode, codex: { fetch: async () => { primaryCalls++; throw error } } })
  const host = { __proto__: WebRuntime.prototype, get fetchProviderId() { return configured }, config: { fetchProvider: { get: () => configured } }, fetchProviders: router }
  const fetch = () => WebRuntime.prototype.fetch.call(host, request)
  assertFallback(await fetch())
  configured = 'deepseek-fetch-api'
  assertFallback(await fetch(), 'WEB_PROVIDER_ERROR', 'deepseek-fetch-api')
  const stale = router.get(configured)
  mode = 'codex'
  assert.throws(() => stale.fetch(request), error => error.code === 'WEB_PROVIDER_UNAVAILABLE')
  await assert.rejects(fetch(), value => value === error)
  assert.deepEqual(calls, ['http', 'deepseek-fetch-api'])
  mode = 'dsh'
  assert.equal(await fetch(), result)
  assert.equal(primaryCalls, 3)
  configured = undefined; mode = 'codex-fallback'
  await assert.rejects(fetch(), error => error.code === 'WEB_PROVIDER_AMBIGUOUS')
})
