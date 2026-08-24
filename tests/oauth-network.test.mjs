import assert from 'node:assert/strict'
import test from 'node:test'

import {
  proxyFromEnvironment,
  resolveCodexOAuthProxy,
  withCodexOAuthNetwork,
} from '../src/oauth-network.js'

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
      { env: {} },
    )
    releaseFirst()
    assert.deepEqual(await Promise.all([first, second]), ['first', 'direct:https://auth.openai.com/oauth/token'])
    assert.deepEqual(calls, ['http://127.0.0.1:7890/'])
  } finally {
    globalThis.fetch = original
  }
})
