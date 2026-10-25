import assert from 'node:assert/strict'
import test from 'node:test'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { createOfficialModelCatalog, withModelCatalogReady } from '../src/model-catalog.js'
import { openaiCodexProvider, openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(value => { resolve = value }); return { promise, resolve } }
const raw = id => ({ models: [{ slug: id, display_name: id, visibility: 'list', context_window: 128_000, input_modalities: ['text'] }] })
const credential = id => ({ type: 'oauth', access: 'synthetic-token', accountId: id })
const options = extra => ({
  baseModels: () => openaiCodexProvider().getModels(),
  getAuth: async () => ({ auth: { apiKey: 'synthetic-token' } }),
  readCredential: async () => credential('synthetic-account'),
  fetch: async () => Response.json(raw('remote-model')),
  ...extra,
})
const alive = t => { const timer = setInterval(() => {}, 1000); t.after(() => clearInterval(timer)) }

test('initialization has a deadline even when a credential resolver ignores cancellation', async t => {
  alive(t)
  const gate = deferred()
  const catalog = createOfficialModelCatalog(options({ timeoutMs: 5, readCredential: () => gate.promise }))
  await assert.rejects(catalog.initialize(), /initialization timed out/)
  gate.resolve(credential('late-account'))
  await tick()
  assert.deepEqual(catalog.getModels(), [])
  assert.equal(catalog.status().source, 'unavailable')
})

test('refresh deadline includes OAuth resolution, and caller abort stops an initializing waiter', async t => {
  alive(t)
  let requests = 0
  const auth = deferred()
  const catalog = createOfficialModelCatalog(options({ timeoutMs: 5, getAuth: () => auth.promise, fetch: async () => { requests += 1 } }))
  await assert.rejects(catalog.refresh(), /refresh timed out/)
  auth.resolve({ auth: { apiKey: 'synthetic-token' } })
  await tick()
  assert.equal(requests, 0)
  const vault = deferred(), caller = new AbortController()
  const next = createOfficialModelCatalog(options({ readCredential: () => vault.promise }))
  const pending = next.initialize({ signal: caller.signal })
  caller.abort()
  await assert.rejects(pending, error => error.name === 'AbortError')
  vault.resolve(credential('late-account'))
  await tick()
  assert.deepEqual(next.getModels(), [])
})

test('clear settles old initialization immediately and its late identity cannot start a new account request', async () => {
  const old = deferred()
  let reads = 0, requests = 0
  const catalog = createOfficialModelCatalog(options({
    readCredential: async () => ++reads === 1 ? old.promise : credential('account-b'),
    fetch: async (_url, init) => { requests += 1; assert.equal(init.headers['chatgpt-account-id'], 'account-b'); return Response.json(raw('b-model')) },
  }))
  const pending = catalog.refresh(), rejected = assert.rejects(pending, error => error.name === 'AbortError')
  await tick()
  catalog.clear()
  await rejected
  await catalog.refresh()
  old.resolve(credential('account-a'))
  await tick()
  assert.equal(requests, 1)
  assert.deepEqual(catalog.getModels().map(model => model.id), ['b-model'])
})

test('cached identity restoration does not wait for OAuth network access', async () => {
  let authReads = 0
  const catalog = createOfficialModelCatalog(options({ cacheDirectory: 'in-memory',
    loadCache: async () => ({ rawCatalog: raw('cached-model') }),
    getAuth: () => { authReads += 1; throw Error('must not refresh OAuth to restore metadata') },
  }))
  assert.equal(await catalog.initialize(), true)
  assert.equal(authReads, 0)
  assert.deepEqual(catalog.getModels().map(model => model.id), ['cached-model'])
})

test('a stuck cache write cannot delay a valid model directory, host notification or successful refresh', async t => {
  alive(t)
  const gate = deferred(), errors = []
  let notifications = 0
  const catalog = createOfficialModelCatalog(options({ timeoutMs: 5, cacheDirectory: 'in-memory',
    loadCache: async () => undefined, saveCache: () => gate.promise,
    onUpdated: () => { notifications += 1 }, onCacheError: error => errors.push(error.message),
  }))
  assert.equal(await catalog.refresh(), true)
  assert.equal(notifications, 1)
  assert.equal(catalog.status().refresh, 'ok')
  await catalog.flushCache()
  assert.equal(catalog.status().refresh, 'ok')
  assert.match(errors[0], /cache write timed out/)
  gate.resolve()
})

function adapterFor(catalog, extra = {}) {
  const provider = { ...openaiCodexSubscriptionProvider({ catalog }), ...extra }
  return withModelCatalogReady(new PiAiAdapter({
    profiles: () => new Map([['openai-codex', { provider: 'openai-codex', piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(), streamIdleTimeoutMs: 1000 }]]),
    resolveApiKey: async () => 'synthetic-token',
  }), catalog)
}

test('actual PiAiAdapter resolveModel, prepareCall and legacy stream wait for account cache restoration', async () => {
  let streamCalls = 0
  const catalog = createOfficialModelCatalog(options({ cacheDirectory: 'in-memory', loadCache: async () => ({ rawCatalog: raw('cached-model') }) }))
  const adapter = adapterFor(catalog, { streamSimple() { streamCalls += 1; throw Error('controlled stream reached') } })
  assert.equal((await adapter.resolveModel('openai-codex', 'cached-model')).id, 'cached-model')
  if (typeof adapter.prepareCall === 'function') assert.equal((await adapter.prepareCall('openai-codex', 'cached-model')).model.id, 'cached-model')
  const chunks = []
  for await (const chunk of adapter.stream({ provider: 'openai-codex', model: 'cached-model', messages: [{ role: 'user', content: [{ type: 'text', text: 'synthetic' }] }] })) chunks.push(chunk)
  assert.equal(streamCalls, 1)
  assert.match(chunks.find(chunk => chunk.type === 'finish')?.reason?.failure?.message ?? '', /controlled stream reached/)
})

test('actual model resolution waits for a shared first refresh when no cache exists', async () => {
  const gate = deferred()
  let requests = 0, resolved = false
  const catalog = createOfficialModelCatalog(options({ fetch: async () => { requests += 1; return gate.promise } }))
  const adapter = adapterFor(catalog)
  adapter.providerInfo('openai-codex') // The real host asks synchronously while registering an empty initial catalog.
  const first = adapter.resolveModel('openai-codex', 'fresh-model').then(value => { resolved = true; return value })
  const second = adapter.resolveModel('openai-codex', 'fresh-model')
  await tick()
  assert.equal(resolved, false)
  assert.equal(requests, 1)
  gate.resolve(Response.json(raw('fresh-model')))
  assert.equal((await first).id, 'fresh-model')
  assert.equal((await second).id, 'fresh-model')
})

test('a later account boundary repeats the ready gate instead of resolving from the previous account', async () => {
  let account = 'a'
  const catalog = createOfficialModelCatalog(options({ cacheDirectory: 'in-memory',
    readCredential: async () => credential(account), loadCache: async id => ({ rawCatalog: raw(`${id}-model`) }),
  }))
  const adapter = adapterFor(catalog)
  assert.equal((await adapter.resolveModel('openai-codex', 'a-model')).id, 'a-model')
  account = 'b'; catalog.clear()
  assert.equal((await adapter.resolveModel('openai-codex', 'b-model')).id, 'b-model')
  await assert.rejects(adapter.resolveModel('openai-codex', 'a-model'), error => error.code === 'UNKNOWN_MODEL')
})
