import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import {
  createCodexNetworkTransport,
  proxyFromEnvironment,
  resolveCodexOAuthProxy,
  withCodexNetwork,
  withCodexOAuthNetwork,
} from '../src/oauth-network.js'
import { createModels, openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { createSubscriptionDiagnostics } from '../src/diagnostics.js'

test('voice standard HTTPS honors direct and NO_PROXY routing without changing model transport', async () => {
  const original = globalThis.fetch, requests = []
  globalThis.fetch = async () => new Response('normal-fetch')
  try {
    for (const env of [{}, { HTTPS_PROXY:'http://127.0.0.1:7890', NO_PROXY:'chatgpt.com' }]) {
      const network = createCodexNetworkTransport({ env, platform:'linux', fetchThroughProxy: async (_url,_init,proxy) => { requests.push(proxy); return new Response('standard-https') } })
      assert.equal(await (await network.fetch('voice','https://chatgpt.com/backend-api/settings/voices',{}, { standardHttps:true })).text(), 'standard-https')
      assert.equal(await (await network.fetch('model','https://chatgpt.com/backend-api/codex/responses')).text(), 'normal-fetch')
      assert.equal(await (await network.fetch('voice','https://example.test/',{}, { standardHttps:true })).text(), 'normal-fetch')
    }
    assert.deepEqual(requests, [undefined, undefined])
  } finally { globalThis.fetch = original }
})

test('model SSE honors an explicit proxy while preserving host interception on direct calls', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
  const url = 'https://chatgpt.com/backend-api/codex/responses'
  const response = () => new Response('data: {"type":"response.created","response":{"id":"fixture"}}\n\ndata: {"type":"response.done","response":{"id":"fixture","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":0,"total_tokens":1}}}\n\n')
  const direct = [], proxied = []
  let assignments = 0
  const intercept = async input => { direct.push(String(input)); return response() }
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true, get: () => intercept, set: () => { assignments++ },
  })
  const env = { HTTPS_PROXY: 'http://127.0.0.1:7890' }
  const transport = createCodexNetworkTransport({
    env, platform: 'test',
    fetchThroughProxy: async (input, _init, proxy) => { proxied.push([input, proxy]); return response() },
  })
  const provider = openaiCodexSubscriptionProvider({ runNetwork: transport.run, beginModelAttempt: transport.beginModelAttempt })
  const model = provider.getModels().find(value => value.id === 'gpt-5.6-luna')
  const apiKey = 'e30.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url') + '.fixture'
  const context = { messages: [{ role: 'user', content: 'fixture', timestamp: Date.now() }] }
  async function complete() {
    const events = []
    for await (const event of provider.streamSimple(model, context, { apiKey, transport: 'sse' })) events.push(event.type)
    assert.ok(events.includes('done'), events.join(','))
  }
  try {
    await complete()
    assert.deepEqual(proxied, [[url, 'http://127.0.0.1:7890/']])
    assert.deepEqual(direct, [])
    env.NO_PROXY = 'chatgpt.com'
    await complete()
    assert.deepEqual(direct, [url])
    assert.equal(proxied.length, 1)
    env.DSH_CODEX_SSE_PROXY = 'http://127.0.0.1:7891'
    await complete()
    assert.deepEqual(proxied.at(-1), [url, 'http://127.0.0.1:7891/'])
    assert.equal(direct.length, 1)
    assert.equal(transport.snapshot().model.route, 'model-proxy')
    assert.equal(assignments, 0)
  } finally { Object.defineProperty(globalThis, 'fetch', descriptor) }
})

test('the dedicated proxy stays on the exact model SSE endpoint and fails without a fallback', async () => {
  const model = 'https://chatgpt.com/backend-api/codex/responses'
  const other = 'https://chatgpt.com/backend-api/wham/usage'
  const baseProxy = 'http://127.0.0.1:7890/'
  const dedicated = 'http://127.0.0.1:7891/'
  const env = { HTTPS_PROXY: baseProxy, DSH_CODEX_SSE_PROXY: dedicated }
  const calls = []
  const network = createCodexNetworkTransport({
    env, platform: 'test',
    fetchThroughProxy: async (input, _init, proxy) => {
      calls.push([input, proxy])
      if (proxy === dedicated) throw Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' })
      return new Response('ok')
    },
  })
  const runModel = () => network.run('model', async fetch => {
    await fetch(other)
    return fetch(model)
  }, { requestFetch: true, fallbackFetch: () => assert.fail('Unexpected direct request') })
  await assert.rejects(runModel(), { code: 'ECONNREFUSED' })
  await network.refreshOAuth(() => fetch('https://auth.openai.com/oauth/token'))
  await network.fetch('quota', other)
  await network.fetch('remote', 'https://chatgpt.com/backend-api/wham/remote/control/server/pair/status')
  await network.fetch('predictions', model, {}, { standardHttps: true })
  assert.deepEqual(calls, [
    [other, baseProxy], [model, dedicated],
    ['https://auth.openai.com/oauth/token', baseProxy], [other, baseProxy],
    ['https://chatgpt.com/backend-api/wham/remote/control/server/pair/status', baseProxy],
    [model, baseProxy],
  ])
  assert.equal(await resolveCodexOAuthProxy({ env, target: new URL('wss://chatgpt.com/') }), baseProxy)
  assert.equal(network.snapshot().model.route, 'model-proxy')

  env.DSH_CODEX_SSE_PROXY = 'socks5://private-proxy.invalid:1111'
  await assert.rejects(runModel(), {
    message: 'Invalid DSH_CODEX_SSE_PROXY. Use an HTTP or HTTPS CONNECT proxy.',
  })
  assert.equal(calls.length, 7)
})

test('OAuth proxy resolution honors standard environment variables and NO_PROXY', () => {
  assert.equal(proxyFromEnvironment({ HTTPS_PROXY: '127.0.0.1:7890' }), 'http://127.0.0.1:7890/')
  assert.equal(proxyFromEnvironment({ HTTPS_PROXY: 'http://127.0.0.1:7890', NO_PROXY: 'auth.openai.com' }), undefined)
  assert.equal(proxyFromEnvironment({ ALL_PROXY: 'socks5://127.0.0.1:7891' }), undefined)
})

test('Windows system proxy is used without exposing or persisting registry state', async () => {
  const execFile = async (_file, args) => ({
    stdout: args.at(-1) === 'ProxyEnable'
      ? 'ProxyEnable    REG_DWORD    0x1\r\n'
      : 'ProxyServer    REG_SZ    http=127.0.0.1:7890;https=127.0.0.1:7891\r\n',
  })
  assert.equal(await resolveCodexOAuthProxy({ env: {}, platform: 'win32', execFile }), 'http://127.0.0.1:7891/')
})

test('macOS HTTPS proxy is recognized from the system proxy snapshot', async () => {
  const execFile = async () => ({ stdout: `\n<dictionary> {\n  HTTPSEnable : 1\n  HTTPSPort : 7890\n  HTTPSProxy : 127.0.0.1\n}\n` })
  assert.equal(await resolveCodexOAuthProxy({ env: {}, platform: 'darwin', execFile }), 'http://127.0.0.1:7890/')
})

test('only OpenAI auth requests use the temporary proxy-aware fetch', async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async input => new Response(`direct:${input}`)
  try {
    const result = await withCodexOAuthNetwork(async () => {
      const auth = await fetch('https://auth.openai.com/oauth/token', { method: 'POST' })
      const unrelated = await fetch('https://example.test/')
      return [await auth.text(), await unrelated.text()]
    }, {
      env: { HTTPS_PROXY: 'http://127.0.0.1:7890' },
      fetchThroughProxy: async (input, init, proxy) => {
        calls.push({ input, method: init.method, proxy })
        return new Response('proxied')
      },
    })
    assert.deepEqual(result, ['proxied', 'direct:https://example.test/'])
    assert.deepEqual(calls, [{
      input: 'https://auth.openai.com/oauth/token',
      method: 'POST',
      proxy: 'http://127.0.0.1:7890/',
    }])
    assert.equal(globalThis.fetch('https://example.test/') instanceof Promise, true)
  } finally {
    globalThis.fetch = original
  }
})

test('a fetch captured by another plugin remains usable after the Codex scope ends', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async input => new Response(`direct:${input}`)
  try {
    let capturedFetch
    await withCodexNetwork(async () => {
      capturedFetch = globalThis.fetch
    }, { env: {}, platform: 'linux' })

    assert.equal(globalThis.fetch === capturedFetch, false)
    const response = await capturedFetch('https://ilinkai.weixin.qq.com/ilink/bot/msg/notifystart')
    assert.equal(await response.text(), 'direct:https://ilinkai.weixin.qq.com/ilink/bot/msg/notifystart')
  } finally {
    globalThis.fetch = original
  }
})

test('a third-party fetch wrapper installed during the scope survives its teardown', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async input => new Response(`direct:${input}`)
  try {
    let thirdPartyFetch
    await withCodexNetwork(async () => {
      const capturedFetch = globalThis.fetch
      thirdPartyFetch = (...args) => capturedFetch(...args)
      globalThis.fetch = thirdPartyFetch
    }, { env: {}, platform: 'linux' })

    assert.equal(globalThis.fetch, thirdPartyFetch)
    const response = await globalThis.fetch('https://example.test/from-other-plugin')
    assert.equal(await response.text(), 'direct:https://example.test/from-other-plugin')
  } finally {
    globalThis.fetch = original
  }
})

test('concurrent OAuth attempts never inherit another attempt proxy', async () => {
  const original = globalThis.fetch
  const calls = []
  let releaseFirst
  globalThis.fetch = async input => new Response(`direct:${input}`)
  try {
    const first = withCodexOAuthNetwork(async () => {
      await new Promise(resolve => { releaseFirst = resolve })
      return (await fetch('https://auth.openai.com/oauth/token')).text()
    }, {
      env: { HTTPS_PROXY: 'http://127.0.0.1:7890' },
      fetchThroughProxy: async (_input, _init, proxy) => {
        calls.push(proxy)
        return new Response('first')
      },
    })
    await new Promise(resolve => setImmediate(resolve))
    const second = withCodexOAuthNetwork(
      async () => (await fetch('https://auth.openai.com/oauth/token')).text(),
      { env: {}, platform: 'linux' },
    )
    releaseFirst()
    assert.deepEqual(await Promise.all([first, second]), ['first', 'direct:https://auth.openai.com/oauth/token'])
    assert.deepEqual(calls, ['http://127.0.0.1:7890/'])
  } finally {
    globalThis.fetch = original
  }
})

test('concurrent Codex request scopes do not serialize a streaming model behind other features', async () => {
  const original = globalThis.fetch
  let releaseModel
  let quotaStarted = false
  globalThis.fetch = async input => new Response(`direct:${input}`)
  try {
    const model = withCodexNetwork(async () => {
      await new Promise(resolve => { releaseModel = resolve })
      return (await fetch('https://chatgpt.com/backend-api/codex/responses')).text()
    }, { env: {}, platform: 'linux' })
    await new Promise(resolve => setImmediate(resolve))
    const quota = withCodexNetwork(async () => {
      quotaStarted = true
      return (await fetch('https://chatgpt.com/backend-api/wham/usage')).text()
    }, { env: {}, platform: 'linux' })
    await new Promise(resolve => setImmediate(resolve))
    const overlapped = quotaStarted
    releaseModel()
    assert.deepEqual(await Promise.all([model, quota]), [
      'direct:https://chatgpt.com/backend-api/codex/responses',
      'direct:https://chatgpt.com/backend-api/wham/usage',
    ])
    assert.equal(overlapped, true)
  } finally {
    globalThis.fetch = original
  }
})

test('Codex network adapts only official auth and subscription hosts to an existing proxy', async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async input => new Response(`direct:${input}`)
  try {
    const result = await withCodexNetwork(async () => {
      const quota = await fetch('https://chatgpt.com/backend-api/wham/usage')
      const unrelated = await fetch('https://example.test/')
      return [await quota.text(), await unrelated.text()]
    }, {
      env: { HTTPS_PROXY: 'http://127.0.0.1:7890' },
      fetchThroughProxy: async (input, _init, proxy) => {
        calls.push({ input, proxy })
        return new Response('proxied')
      },
    })
    assert.deepEqual(result, ['proxied', 'direct:https://example.test/'])
    assert.deepEqual(calls, [{ input: 'https://chatgpt.com/backend-api/wham/usage', proxy: 'http://127.0.0.1:7890/' }])
  } finally {
    globalThis.fetch = original
  }
})

test('network diagnostics keep actionable request failures without proxy addresses', async () => {
  const transport = createCodexNetworkTransport({
    env: { HTTPS_PROXY: 'http://user:secret@127.0.0.1:7890' },
    fetchThroughProxy: async () => new Response('', { status: 502 }),
  })
  const response = await transport.fetch('quota', 'https://chatgpt.com/backend-api/wham/usage')
  assert.equal(response.status, 502)
  assert.deepEqual(transport.snapshot(), {
    quota: { status: 'failed', stage: 'http', code: 'http-error', httpStatus: 502, route: 'environment', elapsed: 'under-1s' },
  })
  assert.doesNotMatch(JSON.stringify(transport.snapshot()), /secret|127\.0\.0\.1|7890/u)
})

test('SDK OAuth refresh uses the proxy, preserves the credential on 403, and reports separately from the relay', async () => {
  const accountId = 'fixture-account'
  const claim = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } })).toString('base64url')
  const access = `eyJhbGciOiJub25lIn0.${claim}.fixture`
  const expired = { type: 'oauth', accountId, access, refresh: 'old-fixture', expires: Date.now() - 1000 }
  let saved = expired
  let fail = true
  const targets = []
  const network = createCodexNetworkTransport({
    env: { HTTPS_PROXY: 'http://proxy-user:proxy-secret@127.0.0.1:7890' },
    fetchThroughProxy: async (input, init, proxy) => {
      const url = new URL(input)
      targets.push(url.hostname)
      assert.match(proxy, /127\.0\.0\.1:7890/u)
      if (url.hostname === 'chatgpt.com') return Response.json({})
      assert.equal(url.pathname, '/oauth/token')
      assert.equal(init.body.get('grant_type'), 'refresh_token')
      assert.equal(init.body.get('refresh_token'), 'old-fixture')
      if (fail) return Response.json({ error: 'fixture-response-secret' }, { status: 403 })
      return Response.json({ access_token: access, refresh_token: 'rotated-fixture', expires_in: 3600 })
    },
  })
  const provider = openaiCodexSubscriptionProvider({ runOAuthRefresh: network.refreshOAuth })
  const models = createModels({ credentials: {
    read: async () => saved,
    modify: async (_id, update) => { saved = await update(saved) ?? saved; return saved },
  } })
  models.setProvider(provider)
  const original = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('unproxied request') }
  try {
    await assert.rejects(models.getAuth('openai-codex'), /OAuth refresh failed/u)
    assert.equal(saved, expired)
    fail = false
    assert.equal((await models.getAuth('openai-codex')).auth.apiKey, access)
    assert.equal(saved.refresh, 'rotated-fixture')
    await models.getAuth('openai-codex')
    await network.fetch('remote', 'https://chatgpt.com/backend-api/wham/remote/control/server/pair')
    assert.deepEqual(targets, ['auth.openai.com', 'auth.openai.com', 'chatgpt.com'])
    const report = await createSubscriptionDiagnostics({ auth: { status: async () => ({ authenticated: true }) }, preferences: { status: () => ({}) }, network })
    assert.deepEqual(report.requestHistory.events.map(({ area, status, httpStatus, route }) => ({ area, status, httpStatus, route })), [
      { area: 'oauth', status: 'failed', httpStatus: 403, route: 'environment' },
      { area: 'oauth', status: 'ok', httpStatus: undefined, route: 'environment' },
      { area: 'remote', status: 'ok', httpStatus: undefined, route: 'environment' },
    ])
    assert.doesNotMatch(JSON.stringify(report), /fixture-response-secret|proxy-secret|rotated-fixture|127\.0\.0\.1/u)
  } finally { globalThis.fetch = original }
})

test('caller cancellation is not a transport timeout, while real timeout signals remain diagnosed', async () => {
  const transport = createCodexNetworkTransport({
    env: { HTTPS_PROXY: 'http://127.0.0.1:7890' },
    fetchThroughProxy: async (_input, init) => new Promise((_resolve, reject) => {
      if (init.signal.aborted) reject(init.signal.reason)
      else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    }),
  })
  const cancelled = new AbortController()
  const request = transport.fetch('predictions', 'https://chatgpt.com/backend-api/codex/responses', { signal: cancelled.signal })
  await new Promise(resolve => setImmediate(resolve))
  cancelled.abort()
  await assert.rejects(request, error => error.name === 'AbortError')
  assert.equal(transport.snapshot().predictions, undefined)
  const alive = setTimeout(() => {}, 1000)
  try {
    await assert.rejects(transport.fetch('predictions', 'https://chatgpt.com/backend-api/codex/responses', { signal: AbortSignal.timeout(10) }), error => error.name === 'TimeoutError')
    assert.equal(transport.snapshot().predictions.code, 'timeout')
  } finally { clearTimeout(alive) }
})

test('cancelling OAuth also closes a silent proxy CONNECT socket', { timeout: 3000 }, async t => {
  const accepted = Promise.withResolvers()
  const closed = Promise.withResolvers()
  let socket
  const proxy = createServer()
  proxy.on('connect', (request, client) => {
    socket = client
    client.on('error', () => {})
    client.on('end', () => client.end())
    client.once('close', closed.resolve)
    client.resume()
    accepted.resolve(request.url)
  })
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
  t.after(async () => { socket?.destroy(); await new Promise(resolve => proxy.close(resolve)) })
  const network = createCodexNetworkTransport({ env: { HTTPS_PROXY: `http://127.0.0.1:${proxy.address().port}` } })
  const abort = new AbortController()
  const refresh = network.refreshOAuth(() => fetch('https://auth.openai.com/oauth/token', {
    method: 'POST', signal: abort.signal,
  }), abort.signal)
  assert.equal(await accepted.promise, 'auth.openai.com:443')
  abort.abort()
  await assert.rejects(refresh, { name: 'AbortError' })
  await closed.promise
  assert.equal(network.snapshot().oauth, undefined)
})
