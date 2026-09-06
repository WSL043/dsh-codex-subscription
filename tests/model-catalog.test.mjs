import assert from 'node:assert/strict'
import test from 'node:test'

import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'

import { CODEX_MODELS_URL, createOfficialModelCatalog, parseOfficialModelCatalog } from '../src/model-catalog.js'
import { openaiCodexProvider, openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'

const base = [{
  id: 'gpt-base', name: 'GPT Base', api: 'openai-codex-responses', provider: 'openai-codex',
  baseUrl: 'https://chatgpt.com/backend-api', reasoning: true, input: ['text'],
  cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 128_000,
}]

const remote = (overrides = {}) => ({
  slug: 'gpt-next', display_name: 'GPT Next', description: 'Current account model',
  supported_reasoning_levels: [{ effort: 'low', description: 'Low' }, { effort: 'max', description: 'Max' }],
  visibility: 'list', supported_in_api: true, priority: 10, support_verbosity: true,
  default_verbosity: 'medium', context_window: 400_000, input_modalities: ['text', 'image'],
  service_tiers: [{ id: 'priority', name: 'Fast', description: 'Priority' }],
  ...overrides,
})

test('official model catalog filters hidden entries and preserves advertised capabilities', () => {
  const models = parseOfficialModelCatalog({ models: [
    remote(),
    remote({ slug: 'hidden', visibility: 'hide' }),
  ] })
  assert.equal(models.length, 1)
  assert.deepEqual(models[0], {
    id: 'gpt-next', name: 'GPT Next', description: 'Current account model', priority: 10,
    input: ['text', 'image'], contextWindow: 400_000, reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: null, high: null, xhigh: null, max: 'max' },
    supportVerbosity: true, defaultVerbosity: 'medium', supportsFast: true,
  })
})

test('ChatGPT catalog keeps picker-visible subscription models that are not API-key models', () => {
  const models = parseOfficialModelCatalog({ models: [remote({
    slug: 'gpt-5.3-codex-spark',
    display_name: 'GPT-5.3-Codex-Spark',
    supported_in_api: false,
    input_modalities: ['text'],
  })] })
  assert.equal(models.length, 1)
  assert.equal(models[0].id, 'gpt-5.3-codex-spark')
})

test('Astra from the official catalog reaches DSH with the selected context window', async () => {
  const astraContext = { context_window: 272_000, max_context_window: 872_000 }
  const catalog = createOfficialModelCatalog({
    baseModels: () => openaiCodexProvider().getModels(),
    async getAuth() { return { auth: { apiKey: 'test-token' } } },
    async readCredential() { return { type: 'oauth', accountId: 'test-account' } },
    async fetch() {
      return Response.json({ models: [remote({
        slug: 'gpt-6-astra', display_name: 'GPT-6 Astra',
        ...astraContext,
      })] })
    },
  })
  await catalog.refresh()
  let contextMode = 'standard'
  const customWindows = {}
  const provider = openaiCodexSubscriptionProvider({
    catalog,
    resolveContextMode: () => contextMode,
    resolveCustomContextWindow: modelKey => customWindows[modelKey],
  })
  const adapter = new PiAiAdapter({
    profiles: () => new Map([['openai-codex', {
      provider: 'openai-codex', displayName: 'ChatGPT subscription',
      piProvider: provider, configuredMaxTokens: new Map(),
    }]]),
    resolveApiKey: async () => { throw new Error('context resolution must not send a model request') },
  })
  const contextWindow = async () => (await adapter.resolveModel('openai-codex', 'gpt-6-astra')).context.contextWindow
  assert.equal(await contextWindow(), 272_000)
  contextMode = 'extended'
  assert.equal(await contextWindow(), 872_000)
  contextMode = 'custom'
  assert.equal(await contextWindow(), 272_000, 'an unset custom budget keeps the safe default')
  for (const [requested, expected] of [[500_000, 500_000], [1_000_000, 872_000], [99, 128_000]]) {
    customWindows['gpt-6-astra'] = requested
    assert.equal(await contextWindow(), expected)
  }
  contextMode = 'standard'
  assert.equal(await contextWindow(), 272_000, 'switching back must restore the unmodified catalog window')
  assert.equal(catalog.getModels([])[0].contextWindow, 272_000)
  Object.assign(astraContext, { context_window: 1_000_000, max_context_window: 1_000_000 })
  await catalog.refresh()
  assert.equal(await contextWindow(), 1_000_000, 'Standard must preserve even a newer catalog window')
  contextMode = 'extended'
  assert.equal(await contextWindow(), 872_000, 'Extended stays at the audited budget until explicitly re-audited')
})

test('catalog refresh is conditional, keeps the last good result, and never exposes credentials', async () => {
  const requests = []
  let mode = 'fresh'
  const catalog = createOfficialModelCatalog({
    baseModels: () => base,
    async getAuth() { return { auth: { apiKey: 'secret-token' } } },
    async readCredential() { return { type: 'oauth', accountId: 'secret-account' } },
    async fetch(input, init) {
      requests.push({ input: String(input), headers: new Headers(init.headers) })
      if (mode === 'not-modified') return new Response(null, { status: 304 })
      if (mode === 'failed') return new Response('{}', { status: 503 })
      return new Response(JSON.stringify({ models: [remote()] }), { status: 200, headers: { etag: '"catalog-1"', 'content-type': 'application/json' } })
    },
  })
  assert.equal(await catalog.refresh(), true)
  assert.equal(catalog.getModels(base)[0].id, 'gpt-next')
  assert.equal(catalog.getModels(base)[0].cost.input, 0)
  assert.equal(catalog.metadata('gpt-next').supportVerbosity, true)
  assert.equal(catalog.revision(), 1)
  assert.equal(requests[0].input, CODEX_MODELS_URL)
  mode = 'not-modified'
  assert.equal(await catalog.refresh(), false)
  assert.equal(requests[1].headers.get('if-none-match'), '"catalog-1"')
  mode = 'failed'
  await assert.rejects(catalog.refresh(), /HTTP 503/u)
  assert.equal(catalog.getModels(base)[0].id, 'gpt-next')
  assert.doesNotMatch(JSON.stringify(catalog.getModels(base)), /secret-token|secret-account/u)
})

test('catalog timeout rejects even when an injected request ignores abort and drops its late result', async () => {
  let resolveFetch
  const catalog = createOfficialModelCatalog({
    baseModels: () => base,
    timeoutMs: 10,
    async getAuth() { return { auth: { apiKey: 'test-token' } } },
    async readCredential() { return { type: 'oauth', accountId: 'test-account' } },
    async fetch() {
      return new Promise(resolve => { resolveFetch = resolve })
    },
  })

  await assert.rejects(catalog.refresh(), /timed out/u)
  resolveFetch(Response.json({ models: [remote({ slug: 'late-model' })] }))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(catalog.revision(), 0)
  assert.equal(catalog.getModels(base), base)
})

test('clear aborts the old flight without letting its timer invalidate the replacement', async () => {
  const fetches = []
  const timers = []
  let now = 0
  const scheduleTimeout = (callback, delay) => {
    const timer = { at: now + delay, callback, cleared: false }
    timers.push(timer)
    return timer
  }
  const cancelTimeout = timer => { timer.cleared = true }
  const advanceTo = target => {
    now = target
    for (const timer of timers.filter(item => !item.cleared && item.at <= target)) {
      timer.cleared = true
      timer.callback()
    }
  }
  const catalog = createOfficialModelCatalog({
    baseModels: () => base,
    timeoutMs: 50,
    setTimeout: scheduleTimeout,
    clearTimeout: cancelTimeout,
    async getAuth() { return { auth: { apiKey: 'test-token' } } },
    async readCredential() { return { type: 'oauth', accountId: 'test-account' } },
    async fetch() {
      return new Promise(resolve => fetches.push(resolve))
    },
  })

  const old = catalog.refresh()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(fetches.length, 1)
  now = 10
  catalog.clear()
  await assert.rejects(old)
  const replacement = catalog.refresh()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(timers.length, 2)
  assert.equal(timers[0].cleared, true)
  advanceTo(50)
  assert.equal(fetches.length, 2)
  fetches[1](Response.json({ models: [remote({ slug: 'replacement-model' })] }))
  assert.equal(await replacement, true)
  fetches[0](Response.json({ models: [remote({ slug: 'late-old-model' })] }))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(catalog.getModels(base)[0].id, 'replacement-model')
})
