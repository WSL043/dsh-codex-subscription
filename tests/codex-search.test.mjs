import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { REQUEST_BLOCKED } from '../src/http-failure.js'
import { diagnosticLog } from '../src/diagnostic-log.js'
import { WebError } from '@deepseek-ai/dsh-web'

import {
  CODEX_SEARCH_PROVIDER_ID,
  CODEX_SEARCH_URL,
  createCodexAutoSearchProvider,
  createCodexSearchProvider,
} from '../src/codex-search.js'

test('automatic search routes Codex sessions to subscription and other sessions to DSH', async () => {
  const calls = []
  let modelProvider = 'openai-codex'
  const auto = createCodexAutoSearchProvider({
    codex: { async search(request) { calls.push(['codex', request.query]); return { sources: [{ url: 'https://codex.example', title: 'Codex' }], truncated: false } } },
    resolveModelProvider: () => modelProvider,
    resolveDshProvider: () => ({ id: 'deepseek-official', available: () => true, async search(request) { calls.push(['dsh', request.query]); return { sources: [{ url: 'https://dsh.example', title: 'DSH' }], truncated: false } } }),
  })
  assert.equal((await auto.search({ query: 'one' })).sources[0].title, 'Codex')
  modelProvider = 'deepseek-official'
  assert.equal((await auto.search({ query: 'two' })).sources[0].title, 'DSH')
  assert.deepEqual(calls, [['codex', 'one'], ['dsh', 'two']])
})

test('automatic search fails closed when the DSH route is unavailable', async () => {
  const auto = createCodexAutoSearchProvider({
    codex: { async search() { throw new WebError('signed out', 'WEB_PROVIDER_CREDENTIAL_MISSING') } },
    resolveModelProvider: () => 'another-provider',
    resolveDshProvider: () => undefined,
  })
  await assert.rejects(auto.search({ query: 'test' }), error => error?.code === 'WEB_PROVIDER_UNAVAILABLE')
})

test('automatic search falls back to the other side when the preferred one has no sign-in or key', async () => {
  const missing = () => new WebError('no key', 'WEB_PROVIDER_CREDENTIAL_MISSING')
  const ok = title => ({ sources: [{ url: 'https://x.example', title }], truncated: false })
  const make = (modelProvider, codex, dsh) => createCodexAutoSearchProvider({
    codex: { search: codex },
    resolveModelProvider: () => modelProvider,
    resolveDshProvider: () => ({ id: 'deepseek-official', available: () => true, search: dsh }),
  })
  const codexDown = async () => { throw missing() }
  const dshDown = async () => { throw missing() }
  assert.equal((await make('openai-codex', codexDown, async () => ok('DSH')).search({ query: 'a' })).sources[0].title, 'DSH')
  assert.equal((await make('deepseek-account', async () => ok('Codex'), dshDown).search({ query: 'a' })).sources[0].title, 'Codex')
  await assert.rejects(make('openai-codex', codexDown, dshDown).search({ query: 'a' }), error => error?.code === 'WEB_PROVIDER_CREDENTIAL_MISSING')
  const real = new WebError('boom', 'WEB_PROVIDER_ERROR')
  await assert.rejects(make('openai-codex', async () => { throw real }, async () => ok('DSH')).search({ query: 'a' }), error => error === real, 'real failures are not masked by the other side')
})

test('Codex search uses refreshed subscription OAuth and returns structured citeable sources', async () => {
  const requests = []
  const signal = new AbortController().signal
  const provider = createCodexSearchProvider({
    async getAuth(options) {
      assert.equal(options.signal, signal)
      return { auth: { apiKey: 'access-secret' } }
    },
    async readCredential(options) {
      assert.equal(options.signal, signal)
      return { type: 'oauth', access: 'access-secret', accountId: 'account-local' }
    },
    resolveModel: () => 'gpt-5.6-luna',
    resolveSessionId: () => 'session-local',
    async fetch(url, init) {
      requests.push({ url, init })
      return new Response(JSON.stringify({
        output: 'Current answer.',
        results: [
          {
            type: 'text_result',
            ref_id: 'turn0search0',
            url: 'https://example.com/one',
            title: 'First result',
            snippet: 'Relevant excerpt.',
            published_at: '2026-08-16',
          },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })

  assert.equal(provider.id, CODEX_SEARCH_PROVIDER_ID)
  assert.equal(provider.available(), true)
  assert.deepEqual(await provider.search({ query: 'current result', maxResults: 8 }, signal), {
    sources: [{
      url: 'https://example.com/one',
      title: 'First result',
      snippet: 'Relevant excerpt.',
      publishedAt: '2026-08-16',
    }],
    truncated: false,
  })

  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, CODEX_SEARCH_URL)
  assert.equal(requests[0].init.method, 'POST')
  assert.equal(requests[0].init.redirect, 'error')
  assert.equal(requests[0].init.signal, signal)
  const headers = new Headers(requests[0].init.headers)
  assert.equal(headers.get('authorization'), 'Bearer access-secret')
  assert.equal(headers.get('chatgpt-account-id'), 'account-local')
  assert.equal(headers.get('content-type'), 'application/json')
  assert.equal(headers.get('accept'), 'application/json')
  assert.equal(headers.get('originator'), 'pi')
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(headers.get('user-agent'), `dsh-codex-subscription/${version}`)
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    id: 'session-local',
    model: 'gpt-5.6-luna',
    input: 'current result',
    commands: {
      search_query: [{ q: 'current result' }],
      response_length: 'short',
    },
    settings: {
      allowed_callers: ['direct'],
      external_web_access: true,
    },
    max_output_tokens: 4096,
  })
  assert.doesNotMatch(requests[0].url, /api\.openai\.com/u)
  assert.doesNotMatch(requests[0].init.body, /access-secret|account-local/u)
})

test('Codex search safely supports concurrent provider calls across supported DSH releases', async () => {
  const pending = []
  const provider = createCodexSearchProvider({
    async getAuth() { return { auth: { apiKey: 'access-secret' } } },
    async readCredential() { return { type: 'oauth', access: 'access-secret', accountId: 'account-local' } },
    async fetch(_url, init) {
      const query = JSON.parse(init.body).input
      await new Promise(resolve => pending.push(resolve))
      return new Response(JSON.stringify({
        results: [{ url: `https://example.com/${query}`, title: query }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })

  const searches = [
    provider.search({ query: 'one', maxResults: 8 }),
    provider.search({ query: 'two', maxResults: 8 }),
    provider.search({ query: 'three', maxResults: 8 }),
    provider.search({ query: 'four', maxResults: 8 }),
  ]
  while (pending.length < searches.length) await new Promise(resolve => setImmediate(resolve))
  for (const resolve of pending) resolve()

  const results = await Promise.all(searches)
  assert.deepEqual(results.map(result => result.sources[0].title), ['one', 'two', 'three', 'four'])
})

test('Codex search drops the raw endpoint dump and preserves full structured source copy', async () => {
  const provider = createCodexSearchProvider({
    async getAuth() { return { auth: { apiKey: 'access-secret' } } },
    async readCredential() { return { type: 'oauth', access: 'access-secret', accountId: 'account-local' } },
    async fetch() {
      return new Response(JSON.stringify({
        output: `raw-search-dump\n${'x'.repeat(20_000)}`,
        results: [{
          url: `https://example.com/${'encoded-'.repeat(200)}`,
          title: 'T'.repeat(500),
          snippet: 'S'.repeat(2_000),
        }, {
          url: `https://fallback.example/${'encoded-'.repeat(200)}`,
          snippet: 'Fallback title.',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })

  const result = await provider.search({ query: 'current result', maxResults: 8 })
  assert.equal('content' in result, false)
  assert.equal(result.sources[0].title, 'T'.repeat(500))
  assert.equal(result.sources[0].snippet, 'S'.repeat(2_000))
  assert.equal(result.sources[1].title, 'fallback.example')
})

test('Codex search fails closed when the subscription is signed out', async () => {
  let fetchCalls = 0
  const provider = createCodexSearchProvider({
    async getAuth() { return undefined },
    async readCredential() { return undefined },
    async fetch() {
      fetchCalls += 1
      throw new Error('must not run')
    },
  })

  await assert.rejects(
    provider.search({ query: 'current result', maxResults: 8 }),
    error => error?.code === 'WEB_PROVIDER_CREDENTIAL_MISSING'
      && error.message === 'ChatGPT subscription is not signed in',
  )
  assert.equal(fetchCalls, 0)
})

test('Codex search reports subscription, provider, and cancellation failures without fallback', async () => {
  const authed = fetchSearch => createCodexSearchProvider({
    async getAuth() { return { auth: { apiKey: 'access-secret' } } },
    async readCredential() { return { type: 'oauth', access: 'access-secret', accountId: 'account-local' } },
    resolveModel: () => 'gpt-5.6-luna',
    resolveSessionId: () => 'session-local',
    fetch: fetchSearch,
  })

  for (const [response, code, message] of [
    [new Response('', { status: 401 }), 'WEB_PROVIDER_CREDENTIAL_MISSING', 'ChatGPT sign-in needs to be renewed'],
    ...[400, 429, 501, 503].map(status => [new Response('', { status }), 'WEB_PROVIDER_ERROR', `Codex search request failed (HTTP ${status})`]),
    [new Response('<title>Just a moment...</title>', { status: 403, headers: { 'content-type': 'text/html' } }), 'WEB_PROVIDER_ERROR', REQUEST_BLOCKED],
  ]) {
    let calls = 0
    const provider = authed(async (url) => {
      calls += 1
      assert.equal(url, CODEX_SEARCH_URL)
      return response
    })
    await assert.rejects(
      provider.search({ query: 'current result', maxResults: 8 }),
      error => error?.code === code && error.message === message,
    )
    assert.equal(calls, response.status === 503 ? 2 : 1)
  }

  const aborted = authed(async () => {
    throw new DOMException('cancelled', 'AbortError')
  })
  await assert.rejects(
    aborted.search({ query: 'current result', maxResults: 8 }),
    error => error?.code === 'WEB_ABORTED' && error.message === 'Codex search aborted',
  )
})


test('a three-query batch recovers one 500 without changing its source, model, mode or credentials', async () => {
  for (const mode of ['live', 'cached']) {
    const requests = [], counts = new Map()
    let released = 0, reads = 0
    const provider = createCodexSearchProvider({
      getAuth: async () => ({ auth: { apiKey: 'private-access-value' } }),
      readCredential: async () => { reads++; return { type: 'oauth', access: 'private-access-value', accountId: 'private-account-value' } },
      resolveModel: () => 'gpt-6.1-sol',
      resolveSessionId: () => 'private-session-value',
      resolvePreferences: () => ({ searchMode: mode }),
      async fetch(url, init) {
        const body = JSON.parse(init.body), count = (counts.get(body.input) ?? 0) + 1
        counts.set(body.input, count); requests.push({ url, init, body })
        if (body.input === 'private-query-two' && count === 1) return new Response(new ReadableStream({ cancel() { released++ } }), { status: 500, headers: { 'x-request-id': 'search-recovery-test' } })
        return Response.json({ results: [{ url: 'https://example.com/' + count, title: 'Result' }] })
      },
    })
    const values = await Promise.all(['private-query-one', 'private-query-two', 'private-query-three'].map(query => provider.search({ query })))
    assert.ok(values.every(value => value.sources.length === 1))
    assert.deepEqual([...counts.values()], [1, 2, 1]); assert.equal(released, 1); assert.equal(reads, 3)
    const retried = requests.filter(value => value.body.input === 'private-query-two')
    assert.equal(retried.length, 2); assert.equal(retried[0].url, CODEX_SEARCH_URL); assert.equal(retried[1].url, CODEX_SEARCH_URL)
    assert.equal(retried[0].init.body, retried[1].init.body); assert.deepEqual(retried[0].init.headers, retried[1].init.headers)
    assert.equal(retried[1].body.model, 'gpt-6.1-sol'); assert.equal(retried[1].body.settings.external_web_access, mode === 'live')
  }
  const log = JSON.stringify(diagnosticLog.snapshot())
  for (const privateValue of ['private-query-two', 'private-access-value', 'private-account-value', 'private-session-value']) assert.ok(!log.includes(privateValue))
  assert.ok(log.includes('search-recovery-test')); assert.ok(log.includes('mode=cached')); assert.ok(log.includes('mode=live'))
})

test('persistent transient HTTP errors stop after one retry and stay on the subscription source', async () => {
  for (const status of [500, 502, 503, 504]) {
    let requests = 0
    const provider = createCodexSearchProvider({
      getAuth: async () => ({ auth: { apiKey: 'access' } }),
      readCredential: async () => ({ type: 'oauth', access: 'access', accountId: 'account' }),
      async fetch(url) { assert.equal(url, CODEX_SEARCH_URL); requests++; return new Response('', { status }) },
    })
    await assert.rejects(provider.search({ query: 'query' }), error => error.code === 'WEB_PROVIDER_ERROR' && error.message.endsWith(`(HTTP ${status})`))
    assert.equal(requests, 2)
  }
})

test('cancellation during HTTP-error cleanup prevents the retry', async () => {
  let requests = 0
  const controller = new AbortController()
  const provider = createCodexSearchProvider({
    getAuth: async () => ({ auth: { apiKey: 'access' } }),
    readCredential: async () => ({ type: 'oauth', access: 'access', accountId: 'account' }),
    fetch: async () => { requests++; return new Response(new ReadableStream({ cancel() { controller.abort() } }), { status: 500 }) },
  })
  await assert.rejects(provider.search({ query: 'query' }, controller.signal), error => error.code === 'WEB_ABORTED')
  assert.equal(requests, 1)
})


test('a stuck response cleanup cannot delay caller cancellation', { timeout: 200 }, async () => {
  let requests = 0
  const controller = new AbortController()
  const provider = createCodexSearchProvider({
    getAuth: async () => ({ auth: { apiKey: 'access' } }),
    readCredential: async () => ({ type: 'oauth', access: 'access', accountId: 'account' }),
    fetch: async () => { requests++; return new Response(new ReadableStream({ cancel() { return new Promise(() => {}) } }), { status: 500 }) },
  })
  const timer = setTimeout(() => controller.abort(), 20)
  try { await assert.rejects(provider.search({ query: 'query' }, controller.signal), error => error.code === 'WEB_ABORTED') }
  finally { clearTimeout(timer) }
  assert.equal(requests, 1)
})

test('cancelling streamed response bodies reports cancellation rather than parsing or sign-in failure', async () => {
  for (const status of [200, 401, 403]) {
    const caller = new AbortController()
    let started, requests = 0
    const reading = new Promise(resolve => { started = resolve })
    const provider = createCodexSearchProvider({
      getAuth: async () => ({ auth: { apiKey: 'synthetic' } }),
      readCredential: async () => ({ type: 'oauth', access: 'synthetic', accountId: 'synthetic' }),
      fetch: async () => {
        requests++
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"results":['))
            caller.signal.addEventListener('abort', () => controller.error(new DOMException('cancelled', 'AbortError')), { once: true })
          },
          pull() { started() },
        }), { status, headers: { 'content-type': 'application/json' } })
      },
    })
    const pending = provider.search({ query: 'synthetic' }, caller.signal)
    await reading
    // Allow the response/body reader to enter before cancelling it.
    await new Promise(resolve => setImmediate(resolve))
    caller.abort()
    await assert.rejects(pending, error => error.code === 'WEB_ABORTED', `HTTP ${status}`)
    assert.equal(requests, 1)
  }
})

test('cancellation racing with successful JSON decoding cannot return stale search results', async () => {
  const caller = new AbortController()
  const provider = createCodexSearchProvider({
    getAuth: async () => ({ auth: { apiKey: 'synthetic' } }),
    readCredential: async () => ({ type: 'oauth', access: 'synthetic', accountId: 'synthetic' }),
    fetch: async () => ({ ok: true, status: 200, async json() {
      caller.abort()
      return { results: [{ url: 'https://example.com/', title: 'Stale' }] }
    } }),
  })
  await assert.rejects(provider.search({ query: 'synthetic' }, caller.signal), error => error.code === 'WEB_ABORTED')
})
