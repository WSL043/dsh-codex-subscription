import assert from 'node:assert/strict'
import test from 'node:test'

import { CODEX_MODELS_URL, createOfficialModelCatalog, parseOfficialModelCatalog } from '../src/model-catalog.js'

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
    remote({ slug: 'unsupported', supported_in_api: false }),
  ] })
  assert.equal(models.length, 1)
  assert.deepEqual(models[0], {
    id: 'gpt-next', name: 'GPT Next', description: 'Current account model', priority: 10,
    input: ['text', 'image'], contextWindow: 400_000, reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: null, high: null, xhigh: null, max: 'max' },
    supportVerbosity: true, defaultVerbosity: 'medium', supportsFast: true,
  })
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
