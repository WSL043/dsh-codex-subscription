import assert from 'node:assert/strict'
import test from 'node:test'

import * as plugin from '../src/index.js'

const { apply: applyPlugin } = plugin

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

test('plugin registers one Codex route and one loopback-only redacted RPC', async () => {
  const host = fakeContext()
  applyPlugin(host.ctx)

  assert.equal('CODEX_PROVIDER_POLICY' in plugin, false, 'do not replace the removed boundary with cosmetic metadata')
  assert.deepEqual(host.registered.map(item => item.providers), [['openai-codex']])
  assert.equal(host.registered[0].adapter.providerRetryPolicy(), undefined)
  assert.equal(host.handled.length, 1)
  assert.equal(host.handled[0].channel, '/codex-subscription')
  assert.deepEqual(host.handled[0].options, { authority: 'loopback' })
  assert.equal(host.provided.size, 0, 'the plugin should not publish undocumented host services')
  assert.equal('CodexCacheTelemetry' in plugin, false, 'cache diagnostics are outside the subscription route boundary')

  const signal = new AbortController().signal
  const status = await host.handled[0].handler('status', {}, signal)
  assert.deepEqual(status, {
    ok: true,
    value: { authenticated: false, provider: 'openai-codex' },
  })
  assert.doesNotMatch(JSON.stringify(status), /access|refresh|accountId/)
})

test('usage failures use a DSH-supported bounded RPC error', async () => {
  const handler = plugin.createSubscriptionRpcHandler({
    async authHandler() { throw new Error('not used') },
    usageReader: { async read() { throw new Error('host secret') }, clear() {} },
  })
  const result = await handler('usage', {}, new AbortController().signal)
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'internal', message: 'Could not read ChatGPT usage', details: { issues: [] } },
  })
  assert.doesNotMatch(JSON.stringify(result), /host secret/)
})
