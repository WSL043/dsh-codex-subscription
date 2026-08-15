import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CODEX_SEARCH_PROVIDER_ID,
  CODEX_SEARCH_URL,
  createCodexSearchProvider,
} from '../src/codex-search.js'

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
      return { type: 'oauth', accountId: 'account-local' }
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

test('Codex search drops the raw endpoint dump and preserves full structured source copy', async () => {
  const provider = createCodexSearchProvider({
    async getAuth() { return { auth: { apiKey: 'access-secret' } } },
    async readCredential() { return { type: 'oauth', accountId: 'account-local' } },
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
    async readCredential() { return { type: 'oauth', accountId: 'account-local' } },
    resolveModel: () => 'gpt-5.6-luna',
    resolveSessionId: () => 'session-local',
    fetch: fetchSearch,
  })

  for (const [response, code, message] of [
    [new Response('', { status: 401 }), 'WEB_PROVIDER_CREDENTIAL_MISSING', 'ChatGPT sign-in needs to be renewed'],
    [new Response('', { status: 503 }), 'WEB_PROVIDER_ERROR', 'Codex search request failed (HTTP 503)'],
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
    assert.equal(calls, 1)
  }

  const aborted = authed(async () => {
    throw new DOMException('cancelled', 'AbortError')
  })
  await assert.rejects(
    aborted.search({ query: 'current result', maxResults: 8 }),
    error => error?.code === 'WEB_ABORTED' && error.message === 'Codex search aborted',
  )
})
