import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import WebSocket from 'ws'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { resolveCodexOAuthProxy } from '../src/oauth-network.js'
import { createRemoteControlRelay } from '../src/remote-control-relay.js'

const endpoint = 'wss://chatgpt.com/backend-api/wham/remote/control/server'
const enrollment = () => Response.json({
  environment_id: 'env', server_id: 'srv', remote_control_token: 'relay-token',
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
})

function fixture(extra = {}, onOpen = () => {}) {
  const sockets = []
  const connected = Promise.withResolvers()
  class Socket extends EventEmitter {
    constructor(url, options) {
      super()
      this.url = url
      this.options = options
      this.readyState = 1
      sockets.push(this)
      queueMicrotask(() => {
        this.emit('open')
        connected.resolve(this)
        onOpen(this, sockets.length)
      })
    }
    close() { this.readyState = 3; this.emit('close') }
  }
  const relay = createRemoteControlRelay({
    credentials: async () => ({ access: 'access-token', accountId: 'account' }),
    fetch: async () => enrollment(), WebSocket: Socket,
    installationId: 'installation', hostName: 'host', userAgent: 'test/1',
    serve: () => ({ receive() {}, close() {} }),
    ...extra,
  })
  return { relay, sockets, connected: connected.promise }
}

const routes = [
  ['environment HTTPS proxy', { env: { HTTPS_PROXY: 'http://proxy.example:8080' }, platform: 'linux' }, 'http://proxy.example:8080/'],
  ['lowercase environment proxy', { env: { https_proxy: 'http://proxy.example:8081' }, platform: 'linux' }, 'http://proxy.example:8081/'],
  ['ALL_PROXY fallback', { env: { ALL_PROXY: 'http://proxy.example:8082' }, platform: 'linux' }, 'http://proxy.example:8082/'],
  ['macOS system proxy', {
    env: {}, platform: 'darwin',
    execFile: async () => ({ stdout: 'HTTPSEnable : 1\nHTTPSProxy : proxy.example\nHTTPSPort : 8083\n' }),
  }, 'http://proxy.example:8083/'],
  ['Windows system proxy', {
    env: {}, platform: 'win32',
    execFile: async (_file, args) => ({ stdout: args.at(-1) === 'ProxyEnable' ? 'ProxyEnable REG_DWORD 0x1' : 'ProxyServer REG_SZ https=proxy.example:8084' }),
  }, 'http://proxy.example:8084/'],
  ['NO_PROXY bypass including the system proxy', {
    env: { HTTPS_PROXY: 'http://proxy.example:8080', NO_PROXY: '.chatgpt.com:443' }, platform: 'darwin',
    execFile: async () => { throw new Error('a bypass must not query the system proxy') },
  }, undefined],
  ['NO_PROXY for auth does not bypass the relay', { env: { HTTPS_PROXY: 'http://proxy.example:8080', NO_PROXY: 'auth.openai.com' }, platform: 'linux' }, 'http://proxy.example:8080/'],
  ['NO_PROXY for another port does not bypass the relay', { env: { HTTPS_PROXY: 'http://proxy.example:8080', NO_PROXY: 'chatgpt.com:8443' }, platform: 'linux' }, 'http://proxy.example:8080/'],
  ['NO_PROXY wildcard', { env: { HTTPS_PROXY: 'http://proxy.example:8080', NO_PROXY: '*' }, platform: 'linux' }, undefined],
  ['no configured proxy', { env: {}, platform: 'linux' }, undefined],
]

for (const [name, options, expected] of routes) {
  test(`remote relay honors ${name} without changing headers or global networking`, { timeout: 5000 }, async t => {
    const originalFetch = globalThis.fetch, originalSocket = globalThis.WebSocket
    let systemQueries = 0
    const { relay, connected } = fixture({
      resolveProxy: async ({ target }) => {
        assert.equal(target.href, endpoint)
        return resolveCodexOAuthProxy({
          ...options, target,
          execFile: async (...args) => { systemQueries++; return options.execFile(...args) },
        })
      },
    })
    t.after(() => relay.stop())
    void relay.start()
    const socket = await connected
    assert.equal(socket.url, endpoint)
    if (options.env.NO_PROXY) assert.equal(systemQueries, 0, 'NO_PROXY must not query the system proxy')
    if (expected) {
      assert.ok(socket.options.agent instanceof HttpsProxyAgent)
      assert.equal(socket.options.agent.proxy.href, expected)
    } else {
      assert.equal(Object.hasOwn(socket.options, 'agent'), false)
    }
    assert.equal(socket.options.headers.authorization, 'Bearer relay-token')
    assert.equal(socket.options.headers['x-codex-server-id'], 'srv')
    assert.equal(socket.options.headers['x-codex-protocol-version'], '3')
    assert.equal(relay.status().status, 'connected')
    assert.equal(globalThis.fetch, originalFetch)
    assert.equal(globalThis.WebSocket, originalSocket)
  })
}

test('remote relay uses the shared proxy resolver by default', { timeout: 5000 }, async t => {
  const saved = { HTTPS_PROXY: process.env.HTTPS_PROXY, NO_PROXY: process.env.NO_PROXY }
  process.env.HTTPS_PROXY = 'http://proxy.example:8085'
  process.env.NO_PROXY = ''
  const { relay, connected } = fixture()
  t.after(async () => {
    await relay.stop()
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  void relay.start()
  const socket = await connected
  assert.ok(socket.options.agent instanceof HttpsProxyAgent)
  assert.equal(socket.options.agent.proxy.href, 'http://proxy.example:8085/')
})

test('local ws fixtures stay direct even when a proxy is configured', { timeout: 5000 }, async t => {
  let resolutions = 0
  const { relay, connected } = fixture({
    base: 'http://127.0.0.1:12345/backend-api/',
    resolveProxy: async () => { resolutions++; return 'http://proxy.example:8080' },
  })
  t.after(() => relay.stop())
  void relay.start()
  const socket = await connected
  assert.equal(socket.url, 'ws://127.0.0.1:12345/backend-api/wham/remote/control/server')
  assert.equal(resolutions, 0)
  assert.equal(Object.hasOwn(socket.options, 'agent'), false)
})

test('each reconnect re-resolves the proxy instead of keeping a stale route', { timeout: 5000 }, async t => {
  let calls = 0
  const reconnected = Promise.withResolvers()
  const { relay, connected } = fixture({
    resolveProxy: async () => ++calls === 1 ? 'http://proxy.example:8086' : undefined,
    wait: async () => {},
  }, (socket, count) => { if (count === 2) reconnected.resolve(socket) })
  t.after(() => relay.stop())
  void relay.start()
  const first = await connected
  assert.equal(first.options.agent.proxy.href, 'http://proxy.example:8086/')
  first.close()
  const second = await reconnected.promise
  assert.equal(calls, 2)
  assert.equal(Object.hasOwn(second.options, 'agent'), false)
})

test('disabling during proxy resolution never opens a late socket', { timeout: 5000 }, async t => {
  const resolving = Promise.withResolvers(), resolved = Promise.withResolvers()
  const { relay, sockets } = fixture({ resolveProxy: () => { resolving.resolve(); return resolved.promise } })
  t.after(async () => {
    const stopping = relay.stop()
    resolved.resolve(undefined)
    await new Promise(resolve => setImmediate(resolve))
    for (const socket of sockets) socket.close()
    await stopping
  })
  void relay.start()
  await resolving.promise
  const stopped = relay.stop()
  resolved.resolve('http://proxy.example:8087')
  await stopped
  assert.equal(sockets.length, 0)
  assert.equal(relay.status().status, 'stopped')
})

test('real ws uses the default proxy policy for CONNECT without disclosing relay tokens', { timeout: 5000 }, async t => {
  const requests = []
  const server = http.createServer()
  server.on('connect', (request, socket) => {
    requests.push({ url: request.url, headers: request.headers })
    socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const saved = { HTTPS_PROXY: process.env.HTTPS_PROXY, NO_PROXY: process.env.NO_PROXY }
  process.env.HTTPS_PROXY = `http://127.0.0.1:${server.address().port}`
  process.env.NO_PROXY = ''
  const failed = Promise.withResolvers()
  const { relay } = fixture({
    WebSocket,
    wait: (_ms, signal) => {
      failed.resolve()
      return new Promise(resolve => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', resolve, { once: true })
      })
    },
  })
  t.after(async () => {
    try {
      await relay.stop()
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      await new Promise(resolve => server.close(resolve))
    }
  })
  void relay.start()
  await failed.promise
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'chatgpt.com:443')
  assert.doesNotMatch(JSON.stringify(requests), /relay-token|access-token|account/)
  assert.equal(relay.status().lastError, 'socket')
})
