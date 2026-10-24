import assert from 'node:assert/strict'
import test from 'node:test'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import { createCodexFetchProvider, createCodexFetchRouter, configuredFetchProviderId, CODEX_FETCH_PROVIDER_ID } from '../src/codex-fetch.js'
import { CODEX_SEARCH_URL } from '../src/codex-search.js'

const target = 'https://example.com/'
const success = { output: 'Example Domain\nL0: Example page text.', results: [{ type: 'webpage', title: 'Example Domain', url: target }], encrypted_output: 'opaque-do-not-return' }
const setup = (overrides = {}) => createCodexFetchProvider({
  getAuth: async () => ({ auth: { apiKey: 'secret-token' } }),
  readCredential: async () => ({ type: 'oauth', access: 'secret-token', accountId: 'secret-account' }),
  fetch: async () => Response.json(success), ...overrides,
})

test('Codex fetch sends commands.open and returns readable output, not search snippets or encrypted payload', async () => {
  const calls = []
  const provider = setup({ resolveModel: () => 'gpt-6.1-sol', resolveSessionId: () => 'session', fetch: async (...args) => { calls.push(args); return Response.json(success) } })
  const result = await provider.fetch({ url: target })
  assert.deepEqual(result, { url: target, statusCode: 200, body: { kind: 'text', content: success.output }, truncated: false })
  assert.equal(provider.id, CODEX_FETCH_PROVIDER_ID)
  assert.equal(calls.length, 1)
  const [url, init] = calls[0]
  assert.equal(url, CODEX_SEARCH_URL)
  assert.equal(init.redirect, 'error')
  assert.equal(init.headers.authorization, 'Bearer secret-token')
  assert.equal(init.headers['chatgpt-account-id'], 'secret-account')
  const body = JSON.parse(init.body)
  assert.deepEqual(body.commands, { open: [{ ref_id: target }], response_length: 'long' })
  assert.equal(body.model, 'gpt-6.1-sol')
  assert.equal(body.id, 'session')
  assert.equal(body.max_output_tokens, 4096)
  assert.doesNotMatch(JSON.stringify(result), /secret|opaque/)
})

test('Codex fetch caps decoded text with an explicit truncation flag', async () => {
  const result = await setup({ fetch: async () => Response.json({ ...success, output: 'a'.repeat(70_000) }) }).fetch({ url: target })
  assert.equal(result.body.content.length, 64_000)
  assert.equal(result.truncated, true)
})

test('real RFC open shape with empty results uses the normal page header and marks partial page output', async () => {
  const url = 'https://www.rfc-editor.org/rfc/rfc8259.html'
  const output = `www.rfc-editor.org (${url})\n[citation] Crawled: today; Content type: text/html; Source: open({"ref_id":"${url}","lineno":null}); Total lines: 845\nL0: Internet Engineering Task Force (IETF)\nL1: Request for Comments: 8259\n`
  for (const results of [[], undefined]) {
    const result = await setup({ fetch: async () => Response.json({ output, ...(results ? { results } : {}) }) }).fetch({ url })
    assert.equal(result.url, url)
    assert.equal(result.body.content, output)
    assert.equal(result.truncated, true)
  }
  const full = await setup({ fetch: async () => Response.json({ output: output.replace('Total lines: 845', 'Total lines: 2'), results: [] }) }).fetch({ url })
  assert.equal(full.truncated, false)
})

test('HTTP 200 inaccessible-page errors, absent sources and malformed outputs fail without fallback', async () => {
  for (const body of [
    { output: 'Internal Error\nURL is not accessible via this tool.', results: [{ title: 'Internal Error', type: 'error' }] },
    { output: 'text only', results: [] }, { ...success, output: '' }, { ...success, output: {} },
    { output: 'not a public page', results: [{ url: 'file:///secret' }] }, null,
  ]) await assert.rejects(setup({ fetch: async () => Response.json(body) }).fetch({ url: target }), error => error.code === 'WEB_PROVIDER_ERROR')
})

test('HTTP, malformed JSON, network and timeout failures are sanitized and never fall back', async () => {
  for (const status of [401, 403, 404, 429, 503]) {
    let calls = 0
    await assert.rejects(setup({ fetch: async () => { calls += 1; return new Response('private-server-error', { status }) } }).fetch({ url: target }), error =>
      error.code === (status === 401 || status === 403 ? 'WEB_PROVIDER_CREDENTIAL_MISSING' : 'WEB_PROVIDER_ERROR') && !error.message.includes('private'))
    assert.equal(calls, 1)
  }
  await assert.rejects(setup({ fetch: async () => new Response('{private') }).fetch({ url: target }), error => error.code === 'WEB_PROVIDER_ERROR' && !error.message.includes('private'))
  await assert.rejects(setup({ fetch: async () => { throw Error('private-token') } }).fetch({ url: target }), error => error.code === 'WEB_PROVIDER_ERROR' && !error.message.includes('private'))
  const waiting = setup({ timeoutMs: 2, fetch: async (_url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })) })
  // Keep the event loop alive while AbortSignal.timeout's unref timer is being exercised.
  const alive = setTimeout(() => {}, 1000)
  try { await assert.rejects(waiting.fetch({ url: target }), error => error.code === 'WEB_FETCH_TIMEOUT') } finally { clearTimeout(alive) }
})

test('signed-out, model-disabled and invalid URL calls make no network request', async () => {
  let calls = 0
  const fetch = async () => { calls += 1; return Response.json(success) }
  await assert.rejects(setup({ fetch, getAuth: async () => undefined }).fetch({ url: target }), error => error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING')
  await assert.rejects(setup({ fetch, getAuth: async () => { throw Error('private-vault-details') } }).fetch({ url: target }), error => error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING' && !error.message.includes('private'))
  await assert.rejects(setup({ fetch, allowed: () => false }).fetch({ url: target }), error => error.code === 'WEB_PROVIDER_UNAVAILABLE')
  for (const url of ['file:///a', 'javascript:alert(1)', 'https://name:password@example.com/', 'bad-url']) {
    await assert.rejects(setup({ fetch }).fetch({ url }), error => error.code === 'WEB_INVALID_URL')
  }
  assert.equal(calls, 0)
})

test('caller cancellation is passed to transport and stops before decoding, without replay', async () => {
  const controller = new AbortController()
  let calls = 0
  const provider = setup({ fetch: async (_url, init) => { calls += 1; controller.abort(); assert.equal(init.signal.aborted, true); return Response.json(success) } })
  await assert.rejects(provider.fetch({ url: target }, controller.signal), error => error.code === 'WEB_ABORTED')
  assert.equal(calls, 1)
})

function routing(configured = 'http') {
  let selected = configured, mode = 'dsh', codexCalls = 0
  const nativeCalls = []
  const native = id => ({ id, available: () => true, async fetch(request) { nativeCalls.push(id); return { native: id, ...request } } })
  const registry = new Map([['http', native('http')], ['deepseek-fetch-api', native('deepseek-fetch-api')]])
  const codex = { id: CODEX_FETCH_PROVIDER_ID, available: () => true, async fetch(request) { codexCalls += 1; return { codex: true, ...request } } }
  const router = createCodexFetchRouter({ registry, configuredId: () => selected, mode: () => mode, codex })
  // Native fetch reads a constructor id on old cohorts and a volatile config on
  // new ones. Keep both fixture fields in sync while exercising its real method.
  const host = { config: { fetchProvider: { get: () => selected } }, get fetchProviderId() { return selected }, fetchProviders: router }
  const fetch = () => WebRuntime.prototype.fetch.call(host, { url: target })
  return { registry, router, host, fetch, setMode: value => { mode = value }, configure: value => { selected = value }, counts: () => ({ nativeCalls, codexCalls }) }
}

test('default DSH routing preserves native get/has/values and configured provider behavior', async () => {
  const r = routing()
  assert.equal(r.router.get('http'), r.registry.get('http'))
  assert.equal(r.router.has('missing'), false)
  assert.deepEqual([...r.router.values()], [...r.registry.values()])
  assert.equal((await r.fetch()).native, 'http')
  r.configure('deepseek-fetch-api')
  assert.equal((await r.fetch()).native, 'deepseek-fetch-api')
  assert.equal(r.counts().codexCalls, 0)
})

test('explicit Codex routing survives native API switches and restores the latest native choice when switched back', async () => {
  const r = routing()
  r.setMode('codex')
  assert.equal((await r.fetch()).codex, true)
  r.configure('deepseek-fetch-api')
  assert.equal((await r.fetch()).codex, true)
  r.setMode('dsh')
  assert.equal((await r.fetch()).native, 'deepseek-fetch-api')
  assert.deepEqual(r.counts(), { codexCalls: 2, nativeCalls: ['deepseek-fetch-api'] })
  r.setMode('codex')
  r.host.fetchProviders = r.registry // The owning effect's unload action.
  assert.equal((await r.fetch()).native, 'deepseek-fetch-api')
})

test('unconfigured native provider selection preserves its ambiguity; explicit Codex selects only Codex', async () => {
  const r = routing(); r.configure(undefined)
  await assert.rejects(r.fetch(), error => error.code === 'WEB_PROVIDER_AMBIGUOUS')
  r.setMode('codex')
  assert.equal((await r.fetch()).codex, true)
  r.setMode('dsh'); r.registry.delete('deepseek-fetch-api')
  assert.equal((await r.fetch()).native, 'http')
})

test('explicit Codex errors never invoke a configured DeepSeek fetch provider', async () => {
  let nativeCalls = 0
  const error = Object.assign(new Error('not signed in'), { code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
  const registry = new Map([['deepseek-fetch-api', { available: () => true, fetch: async () => { nativeCalls += 1 } }]])
  const router = createCodexFetchRouter({ registry, configuredId: () => 'deepseek-fetch-api', mode: () => 'codex', codex: { fetch: async () => { throw error } } })
  await assert.rejects(WebRuntime.prototype.fetch.call({ fetchProviders: router, fetchProviderId: 'deepseek-fetch-api', config: { fetchProvider: { get: () => 'deepseek-fetch-api' } } }, { url: target }), value => value === error)
  assert.equal(nativeCalls, 0)
})

test('older hosts without a Map registry do not claim routing support', () => {
  assert.equal(createCodexFetchRouter({ registry: undefined }), undefined)
  assert.equal(createCodexFetchRouter({ registry: {} }), undefined)
})

test('cached Codex route handles stop on selection change without using either provider', async () => {
  const r = routing()
  r.setMode('codex')
  const stale = r.router.get('http')
  r.setMode('dsh')
  assert.equal(stale.available(), false)
  assert.throws(() => stale.fetch({ url: target }), error => error.code === 'WEB_PROVIDER_UNAVAILABLE')
  assert.deepEqual(r.counts(), { nativeCalls: [], codexCalls: 0 })
})

test('configured id honors the native constructor env snapshot and never resurrects a cleared raw setting', async () => {
  const native = { id: 'original-env', available: () => true, fetch: async () => { throw Error('must not fall back') } }
  const registry = new Map([['original-env', native]])
  const host = { config: { fetchProvider: { get: () => undefined } }, fetchProviderEnv: 'original-env', get fetchProviderId() { return this.config.fetchProvider.get() ?? this.fetchProviderEnv } }
  const entries = [{ options: { id: 'web', config: { fetchProvider: 'stale-raw' } } }]
  const configuredId = () => configuredFetchProviderId(host, entries, 'later-env')
  assert.equal(configuredId(), 'original-env')
  host.fetchProviders = createCodexFetchRouter({ registry, configuredId, mode: () => 'codex', codex: { fetch: async () => ({ codex: true }) } })
  assert.deepEqual(await WebRuntime.prototype.fetch.call(host, { url: target }), { codex: true })
  host.fetchProviderEnv = undefined
  assert.equal(configuredId(), undefined, 'an originally absent env stays absent despite later ambient changes')
  assert.deepEqual(await WebRuntime.prototype.fetch.call(host, { url: target }), { codex: true })
  const old = { fiber: { config: { fetchProvider: { get: () => undefined } } }, options: { id: 'web', config: { fetchProvider: 'stale-raw' } } }
  assert.equal(configuredFetchProviderId({ fetchProviderEnv: 'original-env' }, [old], 'later-env'), 'original-env')
})

test('old native constructor id overrides later raw config and ambient env, including an absent id', async () => {
  const entries = [{ options: { id: 'web', config: { fetchProvider: 'stale-raw' } } }]
  const host = { fetchProviderId: 'original-id', config: { fetchProvider: { get: () => 'later-volatile' } } }
  const configuredId = () => configuredFetchProviderId(host, entries, 'later-env')
  assert.equal(configuredId(), 'original-id')
  // Mirror that effective selection for the actual runtime version under test.
  host.config.fetchProvider.get = () => host.fetchProviderId
  let nativeCalls = 0
  const native = { available: () => true, fetch: async () => { nativeCalls += 1; throw Error('must not fall back') } }
  const registry = new Map([['original-id', native], ['stale-raw', native]])
  host.fetchProviders = createCodexFetchRouter({ registry, configuredId, mode: () => 'codex', codex: { fetch: async () => ({ codex: true }) } })
  assert.deepEqual(await WebRuntime.prototype.fetch.call(host, { url: target }), { codex: true })
  host.fetchProviderId = undefined
  assert.equal(configuredId(), undefined)
  assert.deepEqual(await WebRuntime.prototype.fetch.call(host, { url: target }), { codex: true })
  assert.equal(nativeCalls, 0)
})
