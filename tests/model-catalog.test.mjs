import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'

import { CODEX_MODELS_URL, createOfficialModelCatalog, parseOfficialModelCatalog, retirementNotice, withModelCatalogReady } from '../src/model-catalog.js'
import { clearModelCatalogCache, loadModelCatalogCache, saveModelCatalogCache } from '../src/model-catalog-cache.js'
import { openaiCodexProvider, openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { contextModelGroups } from '../src/settings-contract.js'

const base = [{
  id: 'gpt-base', name: 'GPT Base', api: 'openai-codex-responses', provider: 'openai-codex',
  baseUrl: 'https://chatgpt.com/backend-api', reasoning: true, input: ['text'],
  cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 128_000,
}]

test('without a successful account catalog there are no models, and the bundled list is never offered', () => {
  const catalog = createOfficialModelCatalog({ baseModels: () => base })
  assert.deepEqual(catalog.getModels(), [])
  assert.deepEqual(catalog.getModels(base), [])
  assert.equal(catalog.status().source, 'unavailable')
})

test('a signed-out refresh returns to idle instead of remaining in progress', async () => {
  const catalog = createOfficialModelCatalog({ baseModels: () => base, async getAuth() { return undefined } })
  assert.equal(await catalog.refresh(), false)
  assert.deepEqual(catalog.status(), { source: 'unavailable', refresh: 'idle' })
})

const remote = (overrides = {}) => ({
  slug: 'gpt-next', display_name: 'GPT Next', description: 'Current account model',
  supported_reasoning_levels: [{ effort: 'low', description: 'Low' }, { effort: 'max', description: 'Max' }],
  visibility: 'list', supported_in_api: true, priority: 10, support_verbosity: true,
  default_verbosity: 'medium', context_window: 400_000, input_modalities: ['text', 'image'],
  service_tiers: [{ id: 'priority', name: 'Fast', description: 'Priority' }],
  ...overrides,
})

const RETIREMENT_SECONDS = 1792004400
const CATALOG_NOW = Date.UTC(2026, 8, 29)

test('snake_case retirement notices use directory display names without changing model identity or visibility', () => {
  const models = parseOfficialModelCatalog({ models: [
    remote({
      slug: 'gpt-5.5', display_name: 'GPT-5.5', description: 'Current account model', priority: 30,
      retirement_at: RETIREMENT_SECONDS, upgrade: { model: 'gpt-5.6-sol' },
      migration_markdown: '[Switch now](https://example.invalid/migrate)',
    }),
    remote({ slug: 'gpt-5.6-sol', display_name: 'GPT-5.6 Sol', priority: 20 }),
    remote({ slug: 'hidden-retiring', visibility: 'hide', retirement_at: RETIREMENT_SECONDS }),
  ] }, CATALOG_NOW)

  assert.deepEqual(models.map(model => model.id), ['gpt-5.6-sol', 'gpt-5.5'])
  const retiring = models[1]
  assert.equal(retiring.id, 'gpt-5.5')
  assert.equal(retiring.name, 'GPT-5.5 (retires 2026-10-14)')
  assert.equal(retiring.priority, 30)
  assert.equal(retiring.description, 'Current account model\nRetires on 2026-10-14 (UTC). Switch to GPT-5.6 Sol to keep working.')
  assert.deepEqual(retiring.retirement, { at: RETIREMENT_SECONDS * 1000, upgradeTo: 'gpt-5.6-sol' })
  assert.equal(retiring.description.includes('migration_markdown'), false)
  assert.equal(retiring.description.includes('Switch now'), false)
})

test('camelCase retirement notices use upgradeInfo and add only the notice when description is absent', () => {
  const [retiring] = parseOfficialModelCatalog({ models: [
    remote({
      slug: 'legacy-model', display_name: 'Legacy Model', description: null,
      retirementAt: RETIREMENT_SECONDS, upgradeInfo: { model: 'replacement-model' },
      migrationMarkdown: '**Switch** [to the new model](https://example.invalid/migrate).',
    }),
  ] }, CATALOG_NOW)

  assert.equal(retiring.description, 'Retires on 2026-10-14 (UTC). Switch to replacement-model to keep working.')
  assert.deepEqual(retiring.retirement, { at: RETIREMENT_SECONDS * 1000, upgradeTo: 'replacement-model' })
  assert.equal(retiring.description.includes('**Switch**'), false)
  assert.equal(retiring.description.includes('example.invalid'), false)
})

test('retirement targets support string upgrades, snake_case upgrade_info, and date-only notices', () => {
  const [stringUpgrade] = parseOfficialModelCatalog({ models: [
    remote({ slug: 'string-upgrade', description: '', retirement_at: RETIREMENT_SECONDS,
      upgrade: 'not-in-directory', migration_markdown: '[Do not show](https://example.invalid)' }),
  ] }, CATALOG_NOW)
  assert.equal(stringUpgrade.description, 'Retires on 2026-10-14 (UTC). Switch to not-in-directory to keep working.')
  assert.deepEqual(stringUpgrade.retirement, { at: RETIREMENT_SECONDS * 1000, upgradeTo: 'not-in-directory' })

  const [infoUpgrade] = parseOfficialModelCatalog({ models: [
    remote({ slug: 'info-upgrade', retirement_at: RETIREMENT_SECONDS, upgrade_info: { model: 'next-model' } }),
    remote({ slug: 'next-model', display_name: 'Next Model' }),
  ] }, CATALOG_NOW)
  assert.equal(infoUpgrade.description, 'Current account model\nRetires on 2026-10-14 (UTC). Switch to Next Model to keep working.')
  assert.deepEqual(infoUpgrade.retirement, { at: RETIREMENT_SECONDS * 1000, upgradeTo: 'next-model' })

  const [dateOnly] = parseOfficialModelCatalog({ models: [
    remote({ slug: 'date-only', description: undefined, retirementAt: RETIREMENT_SECONDS,
      migrationMarkdown: 'Never use this server-provided migration copy.' }),
  ] }, CATALOG_NOW)
  assert.equal(dateOnly.description, 'Retires on 2026-10-14 (UTC).')
  assert.deepEqual(dateOnly.retirement, { at: RETIREMENT_SECONDS * 1000, upgradeTo: undefined })
  assert.equal(dateOnly.description.includes('server-provided'), false)
})

test('online model lists receive the notice while catalog metadata preserves retirement fields', async () => {
  const catalog = createOfficialModelCatalog({
    baseModels: () => base,
    now: () => CATALOG_NOW,
    getAuth: async () => ({ auth: { apiKey: 'test-token' } }),
    readCredential: async () => ({ type: 'oauth', access: 'test-token', accountId: 'test-account' }),
    fetch: async () => Response.json({ models: [
      remote({
        slug: 'gpt-5.5', display_name: 'GPT-5.5', retirement_at: RETIREMENT_SECONDS,
        upgrade: 'gpt-5.6-sol', priority: 25,
      }),
      remote({ slug: 'gpt-5.6-sol', display_name: 'GPT-5.6 Sol', priority: 30 }),
    ] }),
  })
  await catalog.refresh()

  const retiring = catalog.getModels(base).find(model => model.id === 'gpt-5.5')
  assert.equal(retiring.id, 'gpt-5.5')
  assert.equal(retiring.name, 'GPT-5.5 (retires 2026-10-14)')
  assert.equal(retiring.description, 'Current account model\nRetires on 2026-10-14 (UTC). Switch to GPT-5.6 Sol to keep working.')
  assert.deepEqual(catalog.metadata('gpt-5.5').retirement, { at: RETIREMENT_SECONDS * 1000, upgradeTo: 'gpt-5.6-sol' })
  assert.equal(catalog.metadata('gpt-5.5').priority, 25)
})

test('expired or invalid retirement timestamps produce no notice and never throw', () => {
  const invalidValues = [
    remote({ slug: 'missing' }),
    remote({ slug: 'undefined', retirement_at: undefined }),
    remote({ slug: 'null', retirement_at: null }),
    remote({ slug: 'string', retirement_at: String(RETIREMENT_SECONDS) }),
    remote({ slug: 'negative', retirement_at: -1 }),
    remote({ slug: 'nan', retirement_at: Number.NaN }),
    remote({ slug: 'null-camel', retirementAt: null }),
  ]
  for (const value of invalidValues) {
    assert.doesNotThrow(() => retirementNotice(value, CATALOG_NOW))
    assert.equal(retirementNotice(value, CATALOG_NOW), undefined)
    const [model] = parseOfficialModelCatalog({ models: [value] }, CATALOG_NOW)
    assert.equal(model.description, 'Current account model')
    assert.equal('retirement' in model, false)
  }

  const expired = remote({ slug: 'expired', retirement_at: Date.UTC(2026, 8, 28) / 1000 })
  assert.doesNotThrow(() => retirementNotice(expired, CATALOG_NOW))
  assert.equal(retirementNotice(expired, CATALOG_NOW), undefined)
  const [model] = parseOfficialModelCatalog({ models: [expired] }, CATALOG_NOW)
  assert.equal(model.description, 'Current account model')
  assert.equal('retirement' in model, false)
})

test('catalog commit and account clearing notify host observers, failed and unchanged refreshes do not', async () => {
  let notices = 0, status = 200
  const catalog = createOfficialModelCatalog({
    baseModels: () => base,
    getAuth: async () => ({ auth: { apiKey: 'test' } }),
    readCredential: async () => ({ type: 'oauth', access: 'test', accountId: 'test' }),
    onUpdated: () => notices++,
    fetch: async () => status === 200 ? Response.json({ models: [remote()] }) : new Response(null, { status }),
  })
  await catalog.refresh()
  assert.equal(notices, 1)
  status = 304
  await catalog.refresh()
  status = 500
  await assert.rejects(catalog.refresh())
  assert.equal(notices, 1)
  catalog.clear()
  assert.equal(notices, 2)
})

test('unsupported catalog capabilities are diagnostic-only and follow catalog lifetime', async () => {
  let unchanged = false
  const catalog = createOfficialModelCatalog({
    baseModels: () => base,
    getAuth: async () => ({ auth: { apiKey: 'test-token' } }),
    readCredential: async () => ({ type: 'oauth', access: 'test-token', accountId: 'test-account' }),
    fetch: async () => unchanged ? new Response(null, { status: 304 }) : Response.json({ models: [remote({
      supported_reasoning_levels: [{ effort: 'max' }, { effort: 'ultra' }, { effort: 'private text' }],
      input_modalities: ['text', 'image', 'audio', null],
      additional_speed_tiers: ['fast', 'burst', 'https://private.invalid'],
    })] }, { headers: { etag: 'revision-one' } }),
  })
  await catalog.refresh()
  const expected = [{ model: 'gpt-next', reasoning: ['ultra'], inputs: ['audio'], speeds: ['burst'] }]
  assert.deepEqual(catalog.capabilityGaps(), expected)
  const [model] = catalog.getModels([])
  assert.deepEqual(model.input, ['text', 'image'])
  assert.equal(model.thinkingLevelMap.ultra, undefined)
  assert.equal(model.unsupported, undefined)
  const copy = catalog.capabilityGaps()
  copy[0].inputs.push('video')
  assert.deepEqual(catalog.capabilityGaps(), expected)
  unchanged = true
  await catalog.refresh()
  assert.deepEqual(catalog.capabilityGaps(), expected)
  catalog.clear()
  assert.deepEqual(catalog.capabilityGaps(), [])
})

test('official model catalog filters hidden entries and preserves advertised capabilities', () => {
  const models = parseOfficialModelCatalog({ models: [
    remote(),
    remote({ slug: 'hidden', visibility: 'hide' }),
  ] })
  assert.equal(models.length, 1)
  assert.deepEqual(models[0], {
    id: 'gpt-next', name: 'GPT Next', description: 'Current account model', priority: 10,
    input: ['text', 'image'], contextWindow: 400_000, reasoning: true, supportsReasoningEffortUpdates: false,
    thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: null, high: null, xhigh: null, max: 'max' },
    supportVerbosity: true, defaultVerbosity: 'medium', serviceTiers: [{ id: 'priority', name: 'Fast', description: 'Priority' }], supportsFast: true, supportsUltrafast: false,
  })
})

test('effort-update support requires an explicit account capability and survives refresh changes', async () => {
  for (const value of [true, false, undefined, 'true', 1]) {
    const [entry] = parseOfficialModelCatalog({ models: [remote({ supports_reasoning_effort_updates: value })] })
    assert.equal(entry.supportsReasoningEffortUpdates, value === true)
  }
  let supported = true
  const catalog = createOfficialModelCatalog({ baseModels: () => base,
    getAuth: async () => ({ auth: { apiKey: 'fixture' } }), readCredential: async () => ({ type: 'oauth', access: 'fixture', accountId: 'fixture' }),
    fetch: async () => Response.json({ models: [remote({ supports_reasoning_effort_updates: supported })] }),
  })
  await catalog.refresh()
  assert.equal(catalog.getModels()[0].supportsReasoningEffortUpdates, true)
  assert.equal(catalog.metadata('gpt-next').supportsReasoningEffortUpdates, true)
  supported = false
  await catalog.refresh()
  assert.equal(catalog.getModels()[0].supportsReasoningEffortUpdates, false)
  catalog.clear()
  assert.equal(catalog.metadata('gpt-next'), undefined)
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

test('Reserve is a labeled last-choice experiment only when advertised by the account', () => {
  const models = parseOfficialModelCatalog({ models: [
    remote({ slug: 'gpt-reserve', visibility: 'hide', priority: 999, input_modalities: ['text'] }),
    remote({ slug: 'other-hidden', visibility: 'hide' }),
    remote(),
  ] })
  assert.deepEqual(models.map(model => model.id), ['gpt-next', 'gpt-reserve'])
  assert.equal(models[1].name, 'GPT-Reserve (Experimental)')
  assert.deepEqual(models[1].input, ['text'])
  assert.equal(models[1].thinkingLevelMap.max, 'max')
  assert.equal(parseOfficialModelCatalog({ models: [remote()] }).some(model => model.id === 'gpt-reserve'), false)
  assert.equal(parseOfficialModelCatalog({ models: [remote({ slug: 'gpt-reserve', visibility: 'disabled' })] }).length, 0)
})

test('Astra from the official catalog reaches DSH with the selected context window', async () => {
  const astraContext = { context_window: 272_000, max_context_window: 872_000 }
  const catalog = createOfficialModelCatalog({
    baseModels: () => openaiCodexProvider().getModels(),
    async getAuth() { return { auth: { apiKey: 'test-token' } } },
    async readCredential() { return { type: 'oauth', access: 'test-token', accountId: 'test-account' } },
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
      piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(),
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
  assert.equal(await contextWindow(), 1_000_000, 'Extended follows the new explicit official catalog maximum')
})

test('new Codex models appear from the account catalog with supported reasoning and context', async () => {
  const catalog = createOfficialModelCatalog({
    baseModels: () => openaiCodexProvider().getModels(),
    async getAuth() { return { auth: { apiKey: 'test-token' } } },
    async readCredential() { return { type: 'oauth', access: 'test-token', accountId: 'test-account' } },
    async fetch() {
      return Response.json({ models: [
        remote({ slug: 'gpt-6-sol', display_name: 'GPT-6-Sol', priority: 2,
          context_window: 272_000, max_context_window: 872_000,
          supported_reasoning_levels: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map(effort => ({ effort })),
        }),
        remote({ slug: 'gpt-6-luna', display_name: 'GPT-6-Luna', priority: 3,
          context_window: 272_000, max_context_window: 872_000,
          supported_reasoning_levels: ['low', 'medium', 'high', 'xhigh', 'max'].map(effort => ({ effort })),
        }),
      ] })
    },
  })
  await catalog.refresh()
  const provider = openaiCodexSubscriptionProvider({ catalog, resolveContextMode: () => 'extended' })
  assert.deepEqual(provider.getModels().map(model => [model.id, model.contextWindow]), [
    ['gpt-6-sol', 872_000], ['gpt-6-luna', 872_000],
  ])
  assert.deepEqual(contextModelGroups(catalog.getModels([])).map(row => row.key), ['gpt-6-sol', 'gpt-6-luna'])
  assert.equal(catalog.metadata('gpt-6-luna').thinkingLevelMap.max, 'max')
  assert.equal(catalog.metadata('gpt-6-sol').thinkingLevelMap.ultra, undefined)
  assert.equal(catalog.metadata('gpt-6-sol').supportsFast, true)
})

test('a restored catalog resolves gpt-6-luna while its background refresh remains pending', async t => {
  const accountId = `catalog-cache-test-${randomUUID()}`
  const cacheDirectory = join(process.cwd(), '.artifacts')
  await mkdir(cacheDirectory, { recursive: true })
  t.after(() => clearModelCatalogCache(accountId, { directory: cacheDirectory }))
  const catalogResponse = { models: [
    remote({ slug: 'gpt-6-sol', display_name: 'GPT-6 Sol', priority: 2 }),
    remote({ slug: 'gpt-6-luna', display_name: 'GPT-6 Luna', priority: 3 }),
  ] }
  const options = {
    baseModels: () => openaiCodexProvider().getModels(),
    cacheDirectory,
    now: () => CATALOG_NOW,
    async getAuth() { return { auth: { apiKey: 'cache-test-token' } } },
    async readCredential() { return { type: 'oauth', access: 'cache-test-token', accountId } },
  }
  const online = createOfficialModelCatalog({ ...options, fetch: async () => Response.json(catalogResponse) })
  await online.refresh()
  await online.flushCache()
  const persisted = await loadModelCatalogCache(accountId, {
    directory: cacheDirectory,
    now: CATALOG_NOW,
    parseCatalog: parseOfficialModelCatalog,
  })
  assert.deepEqual(persisted.rawCatalog, catalogResponse)
  assert.equal(online.metadata('gpt-6-luna').thinkingLevelMap.max, 'max')

  let fetchStarted = false
  const restarted = createOfficialModelCatalog({
    ...options,
    timeoutMs: 60_000,
    fetch: async () => {
      fetchStarted = true
      return new Promise(() => {})
    },
  })
  assert.equal(await restarted.initialize(), true)
  assert.deepEqual(restarted.status(), { source: 'cached', refresh: 'idle' })
  const provider = openaiCodexSubscriptionProvider({ catalog: restarted })
  const adapter = new PiAiAdapter({
    profiles: () => new Map([['openai-codex', {
      provider: 'openai-codex', displayName: 'ChatGPT subscription',
      piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(),
    }]]),
    resolveApiKey: async () => { throw new Error('model resolution must not send a request') },
  })
  const pendingRefresh = restarted.refresh()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fetchStarted, true)
  assert.equal((await adapter.resolveModel('openai-codex', 'gpt-6-luna')).context.contextWindow, 400_000)
  assert.equal(restarted.metadata('gpt-6-luna').thinkingLevelMap.max, 'max')
  restarted.clear()
  await assert.rejects(pendingRefresh)
})

test('a late response from the previous account cannot replace the selected account catalog', async t => {
  const accountA = `catalog-account-a-${randomUUID()}`
  const accountB = `catalog-account-b-${randomUUID()}`
  const cacheDirectory = join(process.cwd(), '.artifacts')
  await mkdir(cacheDirectory, { recursive: true })
  t.after(() => Promise.all([
    clearModelCatalogCache(accountA, { directory: cacheDirectory }),
    clearModelCatalogCache(accountB, { directory: cacheDirectory }),
  ]))
  let accountId = accountA
  let releaseOldFetch
  let markOldFetchStarted
  const oldFetchStarted = new Promise(resolve => { markOldFetchStarted = resolve })
  let fetchCount = 0
  const catalog = createOfficialModelCatalog({
    baseModels: () => openaiCodexProvider().getModels(),
    cacheDirectory,
    now: () => CATALOG_NOW,
    async getAuth() { return { auth: { apiKey: 'account-switch-token' } } },
    async readCredential() { return { type: 'oauth', access: 'account-switch-token', accountId } },
    async fetch() {
      fetchCount += 1
      if (fetchCount === 1) {
        markOldFetchStarted()
        return new Promise(resolve => { releaseOldFetch = resolve })
      }
      return Response.json({ models: [remote({ slug: 'account-b-model' })] })
    },
  })

  await catalog.initialize()
  const oldRefresh = catalog.refresh()
  await oldFetchStarted
  const oldRefreshRejected = assert.rejects(oldRefresh)
  accountId = accountB
  catalog.clear()
  await catalog.initialize()
  await catalog.refresh()
  releaseOldFetch(Response.json({ models: [remote({ slug: 'account-a-model' })] }))
  await oldRefreshRejected
  await new Promise(resolve => setImmediate(resolve))
  await catalog.flushCache()

  assert.deepEqual(catalog.getModels().map(model => model.id), ['account-b-model'])
  assert.deepEqual(await loadModelCatalogCache(accountB, {
    directory: cacheDirectory,
    now: CATALOG_NOW,
    parseCatalog: parseOfficialModelCatalog,
  }), { rawCatalog: { models: [remote({ slug: 'account-b-model' })] } })
  assert.equal(await loadModelCatalogCache(accountA, {
    directory: cacheDirectory,
    now: CATALOG_NOW,
    parseCatalog: parseOfficialModelCatalog,
  }), undefined)
})

test('a changed credential is revalidated and restores only the new account cache', async t => {
  const accountA = `catalog-refresh-account-a-${randomUUID()}`
  const accountB = `catalog-refresh-account-b-${randomUUID()}`
  const cacheDirectory = join(process.cwd(), '.artifacts')
  await mkdir(cacheDirectory, { recursive: true })
  const keepAlive = setInterval(() => {}, 1_000)
  t.after(() => clearInterval(keepAlive))
  t.after(() => Promise.all([
    clearModelCatalogCache(accountA, { directory: cacheDirectory }),
    clearModelCatalogCache(accountB, { directory: cacheDirectory }),
  ]))
  await saveModelCatalogCache(accountA, { rawCatalog: { models: [remote({ slug: 'gpt-6-luna' })] } }, {
    directory: cacheDirectory,
    now: CATALOG_NOW,
    parseCatalog: parseOfficialModelCatalog,
  })
  const accountBCatalog = { models: [remote({ slug: 'gpt-6-orbit' })] }
  await saveModelCatalogCache(accountB, { rawCatalog: accountBCatalog }, {
    directory: cacheDirectory,
    now: CATALOG_NOW,
    parseCatalog: parseOfficialModelCatalog,
  })
  let credentialReads = 0
  let catalog
  let notifyAccountB
  let markReplacementFetchStarted
  const accountBCached = new Promise(resolve => { notifyAccountB = resolve })
  const replacementFetchStarted = new Promise(resolve => { markReplacementFetchStarted = resolve })
  catalog = createOfficialModelCatalog({
    baseModels: () => openaiCodexProvider().getModels(),
    cacheDirectory,
    now: () => CATALOG_NOW,
    async getAuth() { return { auth: { apiKey: 'refresh-account-token' } } },
    readCredential() {
      credentialReads += 1
      const selectedAccount = credentialReads === 1 ? accountA : accountB
      return { type: 'oauth', access: 'refresh-account-token', accountId: selectedAccount }
    },
    onUpdated() { if (catalog?.metadata('gpt-6-orbit')) notifyAccountB() },
    async fetch() {
      markReplacementFetchStarted()
      return new Promise(() => {})
    },
  })

  await catalog.initialize()
  const previousRefresh = catalog.refresh()
  const rejected = assert.rejects(previousRefresh)
  await accountBCached
  await replacementFetchStarted

  assert.deepEqual(catalog.getModels().map(model => model.id), ['gpt-6-orbit'])
  assert.equal(catalog.status().source, 'cached')
  catalog.clear()
  await rejected
})

test('cache filesystem errors do not block a valid remote catalog', async t => {
  const accountId = `catalog-cache-error-${randomUUID()}`
  const cacheDirectory = join(process.cwd(), '.artifacts', `cache-parent-${randomUUID()}`)
  await mkdir(join(process.cwd(), '.artifacts'), { recursive: true })
  await writeFile(cacheDirectory, 'occupied path')
  t.after(() => rm(cacheDirectory, { force: true }))
  const cacheErrors = []
  const catalog = createOfficialModelCatalog({
    baseModels: () => openaiCodexProvider().getModels(),
    cacheDirectory,
    now: () => CATALOG_NOW,
    onCacheError(error) { cacheErrors.push(error) },
    async getAuth() { return { auth: { apiKey: 'cache-error-token' } } },
    async readCredential() { return { type: 'oauth', access: 'cache-error-token', accountId } },
    async fetch() { return Response.json({ models: [remote({ slug: 'gpt-6-luna' })] }) },
  })

  assert.equal(await catalog.initialize(), true)
  assert.equal(await catalog.refresh(), true)
  await catalog.flushCache()
  assert.deepEqual(catalog.getModels().map(model => model.id), ['gpt-6-luna'])
  assert.deepEqual(catalog.status(), { source: 'online', refresh: 'ok' })
  assert.ok(cacheErrors.length >= 1, 'cache write fails safely; Windows may report the parent path read as ENOENT')
})

test('an unchanged 304 response notifies DSH when the catalog source becomes online', async t => {
  const accountId = `catalog-notify-304-${randomUUID()}`
  const cacheDirectory = join(process.cwd(), '.artifacts')
  await mkdir(cacheDirectory, { recursive: true })
  t.after(() => clearModelCatalogCache(accountId, { directory: cacheDirectory }))
  const cachedCatalog = { models: [remote({ slug: 'gpt-6-luna' })] }
  await saveModelCatalogCache(accountId, { rawCatalog: cachedCatalog, etag: 'etag-cached' }, {
    directory: cacheDirectory,
    now: CATALOG_NOW,
    parseCatalog: parseOfficialModelCatalog,
  })
  let updates = 0
  let notifiedStatus
  const catalog = createOfficialModelCatalog({
    baseModels: () => openaiCodexProvider().getModels(),
    cacheDirectory,
    now: () => CATALOG_NOW,
    onUpdated() { updates += 1; notifiedStatus = catalog.status() },
    async getAuth() { return { auth: { apiKey: 'catalog-304-token' } } },
    async readCredential() { return { type: 'oauth', access: 'catalog-304-token', accountId } },
    async fetch() { return new Response(null, { status: 304, headers: { etag: 'etag-revalidated' } }) },
  })

  await catalog.initialize()
  assert.equal(updates, 1)
  assert.equal(catalog.status().source, 'cached')
  assert.equal(await catalog.refresh(), false)
  assert.equal(catalog.status().source, 'online')
  await catalog.flushCache()
  assert.equal(updates, 2)
  assert.deepEqual(notifiedStatus, { source: 'online', refresh: 'ok' })
})

test('an old credential read failure cannot change the new account refresh state', async () => {
  const accountA = `catalog-credential-a-${randomUUID()}`
  const accountB = `catalog-credential-b-${randomUUID()}`
  let rejectOldCredential
  let markOldReadStarted
  const oldReadStarted = new Promise(resolve => { markOldReadStarted = resolve })
  let credentialReads = 0
  const catalog = createOfficialModelCatalog({
    baseModels: () => openaiCodexProvider().getModels(),
    async getAuth() { return { auth: { apiKey: 'credential-race-token' } } },
    readCredential() {
      credentialReads += 1
      if (credentialReads === 1) {
        markOldReadStarted()
        return new Promise((_, reject) => { rejectOldCredential = reject })
      }
      return { type: 'oauth', access: 'credential-race-token', accountId: accountB }
    },
    async fetch() { return Response.json({ models: [remote({ slug: 'account-b-model' })] }) },
  })

  const oldRefresh = catalog.refresh()
  await oldReadStarted
  const oldRefreshRejected = assert.rejects(oldRefresh)
  catalog.clear()
  await catalog.refresh()
  rejectOldCredential(new Error('stale account credential read failed'))
  await oldRefreshRejected

  assert.deepEqual(catalog.getModels().map(model => model.id), ['account-b-model'])
  assert.deepEqual(catalog.status(), { source: 'online', refresh: 'ok' })
})

test('cached models remain active after a failed refresh and a later success updates memory and disk', async t => {
  const accountId = `catalog-retry-test-${randomUUID()}`
  const cacheDirectory = join(process.cwd(), '.artifacts')
  await mkdir(cacheDirectory, { recursive: true })
  t.after(() => clearModelCatalogCache(accountId, { directory: cacheDirectory }))
  const cachedCatalog = { models: [remote({ slug: 'gpt-6-luna' })] }
  await saveModelCatalogCache(accountId, { rawCatalog: cachedCatalog, etag: 'etag-old' }, {
    directory: cacheDirectory,
    now: CATALOG_NOW,
    parseCatalog: parseOfficialModelCatalog,
  })
  let fetchCount = 0
  let notifyRemoteUpdate
  const remoteUpdate = new Promise(resolve => { notifyRemoteUpdate = resolve })
  let recoveredUpdateCount = 0
  let notifyRecoveredUpdate
  const recoveredOnlineUpdate = new Promise(resolve => { notifyRecoveredUpdate = resolve })
  const keepAlive = setInterval(() => {}, 1_000)
  t.after(() => clearInterval(keepAlive))
  let catalog
  catalog = createOfficialModelCatalog({
    baseModels: () => openaiCodexProvider().getModels(),
    cacheDirectory,
    now: () => CATALOG_NOW,
    retryDelaysMs: [5],
    async getAuth() { return { auth: { apiKey: 'retry-test-token' } } },
    async readCredential() { return { type: 'oauth', access: 'retry-test-token', accountId } },
    onUpdated() {
      if (catalog?.metadata('gpt-6-orbit')) {
        recoveredUpdateCount += 1
        if (recoveredUpdateCount === 1) notifyRemoteUpdate()
        if (recoveredUpdateCount === 2) notifyRecoveredUpdate()
      }
    },
    async fetch() {
      fetchCount += 1
      return fetchCount === 1 || fetchCount === 3
        ? new Response('', { status: 503 })
        : Response.json({ models: [remote({ slug: 'gpt-6-orbit', display_name: 'GPT-6 Orbit' })] }, { headers: { etag: 'etag-new' } })
    },
  })

  await catalog.initialize()
  assert.deepEqual(catalog.getModels().map(model => model.id), ['gpt-6-luna'])
  assert.deepEqual(catalog.status(), { source: 'cached', refresh: 'idle' })
  await assert.rejects(catalog.refresh(), /HTTP 503/u)
  assert.deepEqual(catalog.getModels().map(model => model.id), ['gpt-6-luna'])
  assert.deepEqual(catalog.status(), { source: 'cached', refresh: 'failed' })
  await remoteUpdate
  assert.deepEqual(catalog.getModels().map(model => model.id), ['gpt-6-orbit'])
  assert.equal(catalog.metadata('gpt-6-orbit').name, 'GPT-6 Orbit')
  assert.equal(catalog.status().source, 'online')
  await catalog.flushCache()
  assert.deepEqual((await loadModelCatalogCache(accountId, {
    directory: cacheDirectory,
    now: CATALOG_NOW,
    parseCatalog: parseOfficialModelCatalog,
  })), { rawCatalog: { models: [remote({ slug: 'gpt-6-orbit', display_name: 'GPT-6 Orbit' })] }, etag: 'etag-new' })
  await assert.rejects(catalog.refresh(), /HTTP 503/u)
  assert.deepEqual(catalog.status(), { source: 'online', refresh: 'failed' })
  await recoveredOnlineUpdate
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fetchCount, 4)
  assert.deepEqual(catalog.status(), { source: 'online', refresh: 'ok' })
})

test('a temporary credential mismatch keeps the cached catalog and schedules a refresh retry', async t => {
  const accountId = `catalog-credential-retry-${randomUUID()}`
  const cacheDirectory = join(process.cwd(), '.artifacts')
  await mkdir(cacheDirectory, { recursive: true })
  t.after(() => clearModelCatalogCache(accountId, { directory: cacheDirectory }))
  await saveModelCatalogCache(accountId, { rawCatalog: { models: [remote({ slug: 'gpt-6-luna' })] } }, {
    directory: cacheDirectory,
    now: CATALOG_NOW,
    parseCatalog: parseOfficialModelCatalog,
  })
  let credentialsAvailable = true
  let catalog
  const timers = []
  const retryResolved = new Promise(resolve => {
    catalog = createOfficialModelCatalog({
      baseModels: () => openaiCodexProvider().getModels(),
      cacheDirectory,
      now: () => CATALOG_NOW,
      retryDelaysMs: [5],
      setTimeout(callback, delay) {
        const timer = { callback, delay, cleared: false, unref() {} }
        timers.push(timer)
        return timer
      },
      clearTimeout(timer) { timer.cleared = true },
      onUpdated() { if (catalog?.status().source === 'online') resolve() },
      async getAuth() { return { auth: { apiKey: 'credential-retry-token' } } },
      async readCredential() {
        return credentialsAvailable
          ? { type: 'oauth', access: 'credential-retry-token', accountId }
          : { type: 'oauth', access: 'stale-token', accountId }
      },
      async fetch() { return Response.json({ models: [remote({ slug: 'gpt-6-orbit' })] }) },
    })
  })

  await catalog.initialize()
  credentialsAvailable = false
  await assert.rejects(catalog.refresh(), /credentials are unavailable/)
  assert.deepEqual(catalog.getModels().map(model => model.id), ['gpt-6-luna'])
  assert.deepEqual(catalog.status(), { source: 'cached', refresh: 'failed' })
  const retry = timers.find(timer => timer.delay === 5)
  assert.ok(retry)
  credentialsAvailable = true
  retry.callback()
  await retryResolved
  assert.deepEqual(catalog.getModels().map(model => model.id), ['gpt-6-orbit'])
  assert.deepEqual(catalog.status(), { source: 'online', refresh: 'ok' })
  catalog.clear()
})

test('catalog refresh is conditional, keeps the last good result, and never exposes credentials', async () => {
  const requests = []
  let mode = 'fresh'
  const catalog = createOfficialModelCatalog({
    baseModels: () => base,
    async getAuth() { return { auth: { apiKey: 'secret-token' } } },
    async readCredential() { return { type: 'oauth', access: 'secret-token', accountId: 'secret-account' } },
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

test('catalog timeout rejects even when an injected request ignores abort and drops its late result', async t => {
  const keepAlive = setInterval(() => {}, 1_000)
  t.after(() => clearInterval(keepAlive))
  let resolveFetch
  const catalog = createOfficialModelCatalog({
    baseModels: () => base,
    timeoutMs: 10,
    async getAuth() { return { auth: { apiKey: 'test-token' } } },
    async readCredential() { return { type: 'oauth', access: 'test-token', accountId: 'test-account' } },
    async fetch() {
      return new Promise(resolve => { resolveFetch = resolve })
    },
  })

  await assert.rejects(catalog.refresh(), /timed out/u)
  resolveFetch(Response.json({ models: [remote({ slug: 'late-model' })] }))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(catalog.revision(), 0)
  assert.deepEqual(catalog.getModels(), [], "the late result is dropped and nothing stands in for it")
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
    async readCredential() { return { type: 'oauth', access: 'test-token', accountId: 'test-account' } },
    async fetch() {
      return new Promise(resolve => fetches.push(resolve))
    },
  })

  const old = catalog.refresh()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fetches.length, 1)
  now = 10
  catalog.clear()
  await assert.rejects(old)
  const replacement = catalog.refresh()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(timers.filter(timer => !timer.cleared).length, 1, 'only the replacement refresh deadline remains active')
  assert.equal(timers[0].cleared, true)
  advanceTo(50)
  assert.equal(fetches.length, 2)
  fetches[1](Response.json({ models: [remote({ slug: 'replacement-model' })] }))
  assert.equal(await replacement, true)
  fetches[0](Response.json({ models: [remote({ slug: 'late-old-model' })] }))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(catalog.getModels(base)[0].id, 'replacement-model')
})

test('catalog support state distinguishes fallback, successful refresh, and retained online data after failure', async () => {
  let fail = true
  const catalog = createOfficialModelCatalog({
    baseModels: () => base,
    getAuth: async () => ({ auth: { apiKey: 'test-token' } }),
    readCredential: async () => ({ type: 'oauth', access: 'test-token', accountId: 'test-account' }),
    fetch: async () => fail ? new Response('', { status: 403 }) : Response.json({ models: [remote()] }),
  })
  assert.deepEqual(catalog.status(), { source: 'unavailable', refresh: 'idle' })
  const failed = catalog.refresh()
  assert.equal(catalog.status().refresh, 'refreshing')
  await assert.rejects(failed, /HTTP 403/)
  assert.deepEqual(catalog.status(), { source: 'unavailable', refresh: 'failed' })
  fail = false
  await catalog.refresh()
  assert.deepEqual(catalog.status(), { source: 'online', refresh: 'ok' })
  fail = true
  await assert.rejects(catalog.refresh(), /HTTP 403/)
  assert.deepEqual(catalog.status(), { source: 'online', refresh: 'failed' })
  catalog.clear()
  assert.deepEqual(catalog.status(), { source: 'unavailable', refresh: 'idle' })
})

test('the real HTTP catalog shape nests an ISO retirement date under upgrade', () => {
  const models = parseOfficialModelCatalog({ models: [
    remote({
      slug: 'gpt-5.5', display_name: 'GPT-5.5', description: 'Legacy coding model.', priority: 12,
      upgrade: {
        model: 'gpt-5.6-sol',
        migration_markdown: 'GPT-5.5 retires on October 14, 2026. Switch to GPT-5.6 Sol to continue working in Codex.',
        retirement_at: '2026-10-14T19:00:00Z',
      },
    }),
    remote({ slug: 'gpt-5.6-sol', display_name: 'GPT-5.6 Sol', priority: 30, upgrade: null }),
    remote({ slug: 'bad-date', upgrade: { model: 'x', retirement_at: 'soon' } }),
    remote({ slug: 'numeric-string', upgrade: { model: 'x', retirement_at: '1792004400' } }),
  ] }, CATALOG_NOW)

  const retiring = models.find(model => model.id === 'gpt-5.5')
  assert.equal(retiring.description, 'Legacy coding model.\nRetires on 2026-10-14 (UTC). Switch to GPT-5.6 Sol to keep working.')
  assert.equal(retiring.name, 'GPT-5.5 (retires 2026-10-14)')
  assert.equal(retiring.id, 'gpt-5.5')
  assert.equal(retiring.retirement.at, Date.UTC(2026, 9, 14, 19))
  assert.equal(retiring.retirement.upgradeTo, 'gpt-5.6-sol')
  assert.equal(models.find(model => model.id === 'gpt-5.6-sol').retirement, undefined)
  assert.equal(models.find(model => model.id === 'bad-date').retirement, undefined)
  assert.equal(models.find(model => model.id === 'numeric-string').retirement, undefined)
})

test('an unchanged catalog drops a retirement notice once its date has passed', async () => {
  let now = Date.UTC(2026, 9, 1)
  let status = 200
  let notices = 0
  const catalog = createOfficialModelCatalog({
    baseModels: () => base,
    now: () => now,
    getAuth: async () => ({ auth: { apiKey: 'test-token' } }),
    readCredential: async () => ({ type: 'oauth', access: 'test-token', accountId: 'test-account' }),
    onUpdated: () => notices++,
    fetch: async () => status === 304
      ? new Response(null, { status: 304 })
      : Response.json({ models: [remote({
        slug: 'gpt-5.5', display_name: 'GPT-5.5',
        upgrade: { model: 'gpt-5.6-sol', retirement_at: '2026-10-14T19:00:00Z' },
      })] }, { headers: { etag: 'rev-1' } }),
  })
  await catalog.refresh()
  assert.equal(catalog.getModels([])[0].name, 'GPT-5.5 (retires 2026-10-14)')
  assert.equal(notices, 1)

  status = 304
  await catalog.refresh()
  assert.equal(catalog.getModels([])[0].name, 'GPT-5.5 (retires 2026-10-14)')
  assert.equal(notices, 1)

  now = Date.UTC(2026, 9, 15)
  const revision = catalog.revision()
  await catalog.refresh()
  const [model] = catalog.getModels([])
  assert.equal(model.name, 'GPT-5.5')
  assert.equal(model.id, 'gpt-5.5')
  assert.equal(catalog.metadata('gpt-5.5').retirement, undefined)
  assert.equal(notices, 2)
  assert.equal(catalog.revision(), revision + 1)
})

test('Ultrafast is offered only for models whose account catalog lists it, and is not reported as unsupported', () => {
  const models = parseOfficialModelCatalog({ models: [
    remote({ slug: 'gpt-6-astra', service_tiers: [
      { id: 'priority', name: 'Fast', description: '' }, { id: 'ultrafast', name: 'Ultrafast', description: '' },
    ] }),
    remote({ slug: 'gpt-6-luna' }),
    remote({ slug: 'gpt-6-sol', service_tiers: [{ id: 'priority', name: 'Fast', description: '' }, { id: 'turbo', name: 'Turbo', description: '' }] }),
  ] })
  const byId = Object.fromEntries(models.map(model => [model.id, model]))
  assert.equal(byId['gpt-6-astra'].supportsUltrafast, true)
  assert.equal(byId['gpt-6-astra'].supportsFast, true)
  assert.equal(byId['gpt-6-astra'].unsupported?.speeds, undefined)
  assert.equal(byId['gpt-6-luna'].supportsUltrafast, false)
  assert.equal(byId['gpt-6-sol'].supportsUltrafast, false)
  assert.deepEqual(byId['gpt-6-sol'].unsupported.speeds, ['turbo'])
})

test('official reviewer follows the account catalog, overrides and low effort', async () => {
  const { officialReviewModel } = await import('../src/model-catalog.js')
  const levels = efforts => efforts.map(effort => ({ effort }))
  const catalog = { models: [
    { slug: 'gpt-6-sol', visibility: 'list' },
    { slug: 'gpt-6-astra', visibility: 'list', auto_review_model_override: 'astra-review' },
    { slug: 'codex-auto-review', visibility: 'hide', supported_reasoning_levels: levels(['low', 'medium']), default_reasoning_level: 'medium' },
    { slug: 'astra-review', visibility: 'hide', supported_reasoning_levels: levels(['medium']), default_reasoning_level: 'medium' },
  ] }
  assert.deepEqual(officialReviewModel(catalog, 'gpt-6-sol'), { id: 'codex-auto-review', effort: 'low' })
  assert.deepEqual(officialReviewModel(catalog, 'gpt-6-astra'), { id: 'astra-review', effort: 'medium' })
  assert.equal(officialReviewModel({ models: [{ slug: 'gpt-6-sol' }] }, 'gpt-6-sol'), undefined)
  assert.equal(officialReviewModel(undefined, 'gpt-6-sol'), undefined)
})

test('a failed first catalog read is retried on its own, and stops once the list is there (#187)', async () => {
  const timers = []
  let calls = 0
  const catalog = createOfficialModelCatalog({
    baseModels: () => base,
    retryDelaysMs: [5, 10],
    setTimeout: (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer },
    clearTimeout: timer => { timer.cleared = true },
    getAuth: async () => ({ auth: { apiKey: 'test-token' } }),
    readCredential: async () => ({ type: 'oauth', access: 'test-token', accountId: 'test-account' }),
    fetch: async () => ++calls < 3 ? new Response('', { status: 403 }) : Response.json({ models: [remote()] }),
  })
  const settle = () => new Promise(resolve => setImmediate(resolve))
  const fire = delay => { const timer = timers.find(item => item.delay === delay && !item.cleared); timer.cleared = true; timer.callback() }
  await assert.rejects(catalog.refresh(), /HTTP 403/)
  assert.equal(catalog.getModels().length, 0)
  fire(5); await settle(); await settle()
  assert.equal(calls, 2)
  fire(10); await settle(); await settle()
  assert.equal(calls, 3)
  assert.equal(catalog.getModels().length, 1)
  assert.equal(catalog.status().source, 'online')
  assert.equal(timers.filter(item => item.delay === 5 || item.delay === 10).every(item => item.cleared), true)
})
