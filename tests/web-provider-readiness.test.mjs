import test from 'node:test'
import assert from 'node:assert/strict'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import { createCodexFetchProvider, createCodexFetchRouter } from '../src/codex-fetch.js'
import { createCodexSearchProvider, createCodexAutoSearchProvider } from '../src/codex-search.js'
import { createDshSearchProvider } from '../src/dsh-search.js'
import { createSearchRouter, gateSearchProvider } from '../src/search-router.js'

test('step readiness uses a current vault snapshot without refreshing credentials or requesting the network', async () => {
  let credential
  const options = {
    readCredential: async () => credential,
    getAuth() { assert.fail('readiness must not refresh credentials') },
    fetch() { assert.fail('readiness must not request the network') },
  }
  const providers = [createCodexFetchProvider(options), createCodexSearchProvider(options)]
  for (const provider of providers) assert.equal(await provider.ready('openai-codex'), false)
  credential = { type: 'oauth', access: 'test-access', accountId: 'test-account' }
  for (const provider of providers) assert.equal(await provider.ready('openai-codex'), true)
  credential = { type: 'oauth', access: 'test-access' }
  for (const provider of providers) assert.equal(await provider.ready('openai-codex'), false)
  options.readCredential = async () => { throw Error('vault unavailable') }
  for (const provider of providers) assert.equal(await provider.ready('openai-codex'), false)
  assert.equal(await createCodexSearchProvider({ ...options, resolvePreferences: () => ({ searchMode: 'disabled' }) }).ready(), false)
})

test('search readiness follows source selection, gates and native credentials without running a search', async () => {
  const native = { id: 'native', available: () => true, ready: model => model === 'deepseek', search() { assert.fail('no search') } }
  const codex = { id: 'codex', available: () => true, ready: () => false, search() { assert.fail('no search') } }
  const dsh = createDshSearchProvider({ resolveDshProvider: () => native })
  const auto = createCodexAutoSearchProvider({ codex, resolveDshProvider: () => dsh })
  const gated = gateSearchProvider(codex, { allowed: model => model === 'openai-codex', resolveDshProvider: () => native })
  assert.equal(await gated.ready('openai-codex'), false)
  assert.equal(await gated.ready('deepseek'), true)
  let mode = 'codex'
  const registry = new Map([['native', native]])
  const router = createSearchRouter({ registry, configuredId: () => 'native', mode: () => mode, providers: { codex, dsh, auto } })
  assert.equal(await router.get('native').ready('deepseek'), false)
  mode = 'dsh'; assert.equal(await router.get('native').ready('deepseek'), true)
  mode = 'auto'; assert.equal(await router.get('native').ready('deepseek'), true)
  assert.equal(await router.get('native').ready('unconfigured'), false)
  assert.equal(await createDshSearchProvider({ resolveDshProvider: () => undefined }).ready(), true, 'native selection errors stay structured execution errors')
})

test('fetch routing preserves native readiness and rejects stale Codex readiness handles', async () => {
  let mode = 'codex'
  const native = { id: 'native', available: () => true, ready: () => true }
  const codex = { ready: model => model === 'openai-codex' }
  const registry = new Map([['native', native]])
  const router = createCodexFetchRouter({ registry, configuredId: () => 'native', mode: () => mode, codex })
  const handle = router.get('native')
  assert.equal(await handle.ready('openai-codex'), true)
  assert.equal(await handle.ready('deepseek'), false)
  mode = 'dsh'
  assert.equal(await handle.ready('openai-codex'), false)
  assert.equal(router.get('native'), native)
  assert.equal(await router.get('native').ready('deepseek'), true)
})

test('native host step checks consume subscription readiness before execution', {
  skip: typeof WebRuntime.prototype.fetchReady !== 'function' || typeof WebRuntime.prototype.searchReady !== 'function',
}, async () => {
  const provider = createCodexFetchProvider({ readCredential: async () => undefined })
  const host = { selectFetchProvider: () => provider, selectSearchProvider: () => provider }
  assert.equal(await WebRuntime.prototype.fetchReady.call(host, 'openai-codex'), false)
  assert.equal(await WebRuntime.prototype.searchReady.call(host, 'openai-codex'), false)
})
