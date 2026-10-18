import test from 'node:test'
import assert from 'node:assert/strict'
import { WebError } from '@deepseek-ai/dsh-web'
import { createDshAccountSearchProvider, searchWithDeepSeekAccount } from '../src/deepseek-account-search.js'

const noKey = () => new WebError('no key', 'WEB_PROVIDER_CREDENTIAL_MISSING')
const results = { results: [{ url: 'https://a.example', title: 'A', snippet: 's', date: null }, { url: '', title: 'x' }] }

function harness({ token = 'tok-secret', config, status = 200, body = results } = {}) {
  const calls = []
  const options = {
    resolveAccount: () => token === null ? undefined : { async resolveToken(url) { calls.push(['token', url]); return token } },
    resolveConfig: () => config,
    resolveQuestion: () => '  what   is\nthis ',
    async fetch(url, init) {
      calls.push(['fetch', url, init])
      return new Response(JSON.stringify(body), { status })
    },
  }
  return { calls, options }
}

test('account search posts to the configured Search API with the account token header', async () => {
  const { calls, options } = harness({ config: { baseURL: 'https://api.deepseek.com/v1/tools/', count: 5 } })
  const out = await searchWithDeepSeekAccount(options, { query: 'q', maxResults: 3 })
  assert.deepEqual(out, { sources: [{ url: 'https://a.example', title: 'A', snippet: 's' }], truncated: false })
  assert.deepEqual(calls[0], ['token', 'https://api.deepseek.com/v1/tools/search'])
  const [, url, init] = calls[1]
  assert.equal(url, 'https://api.deepseek.com/v1/tools/search')
  assert.equal(init.headers['x-dsh-auth-token'], 'tok-secret')
  assert.equal(init.redirect, 'error')
  assert.deepEqual(JSON.parse(init.body), { query: 'q', count: 3, need_content: false, ori_question: 'what is this' })
})

test('account search uses DSH defaults and respects sendOriginalQuestion: false', async () => {
  const { calls, options } = harness({ config: { sendOriginalQuestion: false } })
  await searchWithDeepSeekAccount(options, { query: 'q' })
  assert.equal(calls[1][1], 'https://api.deepseek.com/v1/tools/search')
  assert.deepEqual(JSON.parse(calls[1][2].body), { query: 'q', count: 10, need_content: false })
})

test('account search reports a missing credential without calling the network', async () => {
  for (const token of [null, '']) {
    const { calls, options } = harness({ token })
    await assert.rejects(searchWithDeepSeekAccount(options, { query: 'q' }), error => error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING')
    assert.equal(calls.filter(call => call[0] === 'fetch').length, 0)
  }
})

test('account search errors never include the token', async () => {
  const { options } = harness({ status: 401 })
  await assert.rejects(searchWithDeepSeekAccount(options, { query: 'q' }), error => error.code === 'WEB_PROVIDER_ERROR' && !error.message.includes('tok-secret'))
})

test('the DSH wrapper tries DSH first and falls back to the account only for a missing credential', async () => {
  const { calls, options } = harness()
  const order = []
  const wrapper = createDshAccountSearchProvider({
    ...options,
    resolveDshProvider: () => ({ id: 'deepseek-official', available: () => true, async search() { order.push('dsh'); throw noKey() } }),
  })
  assert.equal((await wrapper.search({ query: 'q' })).sources[0].title, 'A')
  assert.deepEqual(order, ['dsh'])
  assert.equal(calls.some(call => call[0] === 'fetch'), true)

  const other = createDshAccountSearchProvider({
    ...options,
    resolveDshProvider: () => ({ id: 'deepseek-official', available: () => true, async search() { throw new WebError('boom', 'WEB_PROVIDER_ERROR') } }),
  })
  await assert.rejects(other.search({ query: 'q' }), error => error.message === 'boom')

  const signedOut = createDshAccountSearchProvider({
    ...harness({ token: null }).options,
    resolveDshProvider: () => ({ id: 'deepseek-official', available: () => true, async search() { throw noKey() } }),
  })
  await assert.rejects(signedOut.search({ query: 'q' }), error => error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING' && error.message === 'no key')
})

test('a credential error from the host\'s own WebError class is recognised by code', async () => {
  const hostError = Object.assign(new Error('no key'), { name: 'WebError', code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
  const wrapper = createDshAccountSearchProvider({
    ...harness().options,
    resolveDshProvider: () => ({ id: 'deepseek-official', available: () => true, async search() { throw hostError } }),
  })
  assert.equal((await wrapper.search({ query: 'q' })).sources[0].title, 'A')
})
