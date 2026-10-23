import test from 'node:test'
import assert from 'node:assert/strict'
import { createDshSearchProvider } from '../src/dsh-search.js'

test('DSH selection uses the configured host provider with its original request and signal', async () => {
  const request = { query: 'q' }, signal = new AbortController().signal
  const expected = { sources: [{ url: 'https://example.org' }], truncated: false }
  const provider = createDshSearchProvider({ resolveDshProvider: () => ({ id: 'native', available: () => true,
    async search(input, abort) { assert.equal(input, request); assert.equal(abort, signal); return expected },
  }) })
  assert.equal(await provider.search(request, signal), expected)
})

test('host failures stay visible and never read account credentials or call a paid fallback', async () => {
  for (const code of ['WEB_PROVIDER_CREDENTIAL_MISSING', 'WEB_PROVIDER_ERROR', 'WEB_ABORTED']) {
    const original = Object.assign(new Error('Configure the DSH search provider'), { code })
    const provider = createDshSearchProvider({
      resolveDshProvider: () => ({ id: 'native', available: () => true, async search() { throw original } }),
      resolveAccount: () => assert.fail('must not read account credentials'),
      fetch: () => assert.fail('must not call the paid endpoint'),
    })
    await assert.rejects(provider.search({ query: 'q' }), error => error === original)
  }
})

test('missing, unavailable and recursive host providers fail safely', async () => {
  for (const native of [undefined, { id: 'native', available: () => false }, { id: 'codex-subscription-dsh' }]) {
    const provider = createDshSearchProvider({ resolveDshProvider: () => native })
    await assert.rejects(provider.search({ query: 'q' }), error => error.code === 'WEB_PROVIDER_UNAVAILABLE')
  }
})
