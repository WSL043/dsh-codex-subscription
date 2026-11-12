import test from 'node:test'
import assert from 'node:assert/strict'
import { createModelSseProxyRegistry } from '../src/model-sse-proxy.js'
import { createCodexNetworkTransport } from '../src/oauth-network.js'

test('registered endpoints migrate between requests; disappearance never silently sends direct', async () => {
  const registry = createModelSseProxyRegistry()
  assert.equal(registry.resolve(), undefined)
  let route = { proxy: 'http://127.0.0.1:17001' }
  const dispose = registry.register({ current: () => route })
  assert.throws(() => registry.register({ current: () => route }), /already registered/)
  const calls = [], env = { HTTPS_PROXY: 'http://127.0.0.1:17000' }
  const network = createCodexNetworkTransport({ env, resolveModelSseProxy: registry.resolve,
    fetchThroughProxy: async (url, _init, proxy, tls) => { calls.push({ url, proxy, tls }); return new Response('ok') } })
  const model = () => network.run('model', fetch => fetch('https://chatgpt.com/backend-api/codex/responses'), { requestFetch: true })
  await model()
  route = { proxy: 'http://127.0.0.1:17002' }
  await model()
  assert.deepEqual(calls.map(c => c.proxy), ['http://127.0.0.1:17001/', 'http://127.0.0.1:17002/'])
  dispose()
  await assert.rejects(model(), /unavailable/)
  assert.equal(calls.length, 2)
  await network.fetch('quota', 'https://chatgpt.com/backend-api/wham/usage')
  assert.equal(calls.at(-1).proxy, 'http://127.0.0.1:17000/')
  env.DSH_CODEX_SSE_PROXY = 'http://127.0.0.1:17003'
  await model()
  assert.equal(calls.at(-1).proxy, 'http://127.0.0.1:17003/')
})

test('unready, invalid and asynchronous providers cannot send a request', () => {
  for (const value of [undefined, Promise.resolve({ proxy: 'http://localhost' }), { proxy: 'socks5://localhost' }, { proxy: 'http://localhost/private' }, { proxy: 'http://localhost', ca: false }]) {
    const registry = createModelSseProxyRegistry()
    registry.register({ current: () => value })
    assert.throws(() => registry.resolve())
  }
})

test('a stale disposer cannot remove a provider that has registered again', () => {
  const registry = createModelSseProxyRegistry()
  const provider = { current: () => ({ proxy: 'http://localhost:18000' }) }
  const old = registry.register(provider)
  old()
  registry.register(provider)
  old()
  assert.equal(registry.resolve().proxy, 'http://localhost:18000/')
})

test('an in-flight operation pins its endpoint and CA; unrelated endpoints retain their route', async () => {
  const registry = createModelSseProxyRegistry(), calls = []
  const ca = '-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----'
  let route = { proxy: 'http://localhost:17001', ca }
  registry.register({ current: () => route })
  const network = createCodexNetworkTransport({ env: { HTTPS_PROXY: 'http://localhost:17000' }, resolveModelSseProxy: registry.resolve,
    fetchThroughProxy: async (url, init, proxy, tls) => { calls.push({ proxy, ca: tls.ca }); return new Response('ok') } })
  const target = 'https://chatgpt.com/backend-api/codex/responses'
  await network.run('model', async fetch => {
    await fetch(target)
    route = { proxy: 'http://localhost:17002' }
    await fetch(target)
    await fetch('https://chatgpt.com/backend-api/wham/usage')
  }, { requestFetch: true })
  await network.run('model', fetch => fetch(target), { requestFetch: true })
  for (const [area, url] of [['oauth', 'https://auth.openai.com/oauth/token'], ['remote', 'https://chatgpt.com/backend-api/wham/remote/control/server/refresh']]) await network.fetch(area, url)
  assert.deepEqual(calls, [
    { proxy: 'http://localhost:17001/', ca }, { proxy: 'http://localhost:17001/', ca },
    { proxy: 'http://localhost:17000/', ca: undefined }, { proxy: 'http://localhost:17002/', ca: undefined },
    { proxy: 'http://localhost:17000/', ca: undefined }, { proxy: 'http://localhost:17000/', ca: undefined },
  ])
})

test('a failed coordinated request is not replayed through the fallback fetch', async () => {
  const registry = createModelSseProxyRegistry()
  registry.register({ current: () => ({ proxy: 'http://localhost:17001' }) })
  let attempts = 0, fallbacks = 0
  const failure = Object.assign(new Error('socket closed'), { code: 'ECONNRESET' })
  const network = createCodexNetworkTransport({ resolveModelSseProxy: registry.resolve,
    fetchThroughProxy: async () => { attempts++; throw failure } })
  await assert.rejects(network.run('model', fetch => fetch('https://chatgpt.com/backend-api/codex/responses'), {
    requestFetch: true, fallbackFetch: async () => { fallbacks++; return new Response('unexpected') },
  }), /socket closed/)
  assert.equal(attempts, 1)
  assert.equal(fallbacks, 0)
})
