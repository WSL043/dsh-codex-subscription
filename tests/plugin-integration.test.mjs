import assert from 'node:assert/strict'
import test from 'node:test'

import { apply as applyBoundary, providerPolicy } from '../src/boundary.js'
import { apply as applyPlugin } from '../src/index.js'

function fakeContext() {
  const registered = []
  const handled = []
  const provided = new Map()
  let credential
  const ctx = {
    credentials: {
      async resolve() { return credential === undefined ? undefined : { value: credential } },
      async set(_ref, value) { credential = value },
      async unset() { credential = undefined },
    },
    llm: {
      registerAdapter(providers, adapter) {
        registered.push({ providers, adapter })
        return () => {}
      },
    },
    connection: {
      rpc: {
        handle(channel, handler, options) {
          handled.push({ channel, handler, options })
          return () => {}
        },
      },
    },
    get(name) { return provided.get(name) },
    provide(name, value) { provided.set(name, value) },
    effect(register) { return register() },
  }
  return { ctx, registered, handled, provided }
}

test('provider boundary is immutable, trusted, and has no fallback route', () => {
  assert.deepEqual(providerPolicy('openai-codex'), {
    id: 'openai-codex',
    displayName: 'ChatGPT / Codex subscription',
    adapterOwner: '@wsl043/dsh-codex-subscription',
    auth: 'oauth',
    trustDomain: 'trusted',
    fallback: 'none',
    maturity: 'preview',
  })
  assert.throws(() => providerPolicy('api-openai'), /unknown provider/i)
  assert.throws(() => { providerPolicy('openai-codex').fallback = 'paid' }, TypeError)
})

test('plugin registers one Codex route and one loopback-only redacted RPC', async () => {
  const host = fakeContext()
  applyBoundary(host.ctx)
  applyPlugin(host.ctx)

  assert.deepEqual(host.registered.map(item => item.providers), [['openai-codex']])
  assert.equal(host.handled.length, 1)
  assert.equal(host.handled[0].channel, '/wsl043-codex-subscription')
  assert.deepEqual(host.handled[0].options, { authority: 'loopback' })
  assert.ok(host.provided.has('wsl043CodexCacheTelemetry'))

  const signal = new AbortController().signal
  const status = await host.handled[0].handler('status', {}, signal)
  assert.deepEqual(status, {
    ok: true,
    value: { authenticated: false, provider: 'openai-codex' },
  })
  const cache = await host.handled[0].handler('cache', {}, signal)
  assert.equal(cache.ok, true)
  assert.equal(cache.value.requests, 0)
  assert.doesNotMatch(JSON.stringify({ status, cache }), /access|refresh|accountId/)
})
