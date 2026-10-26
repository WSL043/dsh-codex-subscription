import assert from 'node:assert/strict'
import test from 'node:test'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { openaiCodexProvider, openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { withDefaultReasoningEffort } from '../src/default-reasoning-effort.js'
import { normalizeDefaultReasoningEffort } from '../src/settings-contract.js'
import { createOfficialModelCatalog, parseOfficialModelCatalog } from '../src/model-catalog.js'
import { createPreferenceController } from '../src/preference-controller.js'

function harness() {
  let preference = 'auto', fallback = 'medium'
  const sent = []
  const base = openaiCodexProvider(), original = base.getModels().find(model => model.id === 'gpt-5.6-luna')
  const levels = ids => Object.fromEntries(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(id => [id, ids.includes(id) ? id : null]))
  const models = [
    { ...original, id: 'limited', thinkingLevelMap: levels(['low', 'medium']) },
    { ...original, id: 'extended', thinkingLevelMap: levels(['low', 'medium', 'high', 'xhigh', 'max']) },
    { ...original, id: 'plain', reasoning: false, thinkingLevelMap: levels([]) },
  ]
  const provider = { ...openaiCodexSubscriptionProvider({ catalog: { getModels: () => models } }), streamSimple(model, _context, options) { sent.push({ model: model.id, reasoning: options.reasoning }); throw Error('controlled synthetic stop') } }
  const profiles = () => new Map([['openai-codex', { provider: 'openai-codex', piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(), streamIdleTimeoutMs: 1000 }]])
  const native = new PiAiAdapter({ profiles, resolveApiKey: async () => 'synthetic-token' })
  const adapter = withDefaultReasoningEffort(native, { preference: () => preference, modelDefault: () => fallback })
  const request = (model, extra = {}) => ({ provider: 'openai-codex', model, messages: [{ role: 'user', content: [{ type: 'text', text: 'synthetic fixture' }] }], ...extra })
  const drain = async stream => { const events = []; for await (const event of stream) events.push(event); return events }
  return { adapter, native, sent, request, drain, choose: value => { preference = value }, fallback: value => { fallback = value } }
}

test('auto follows each legal model default and unsupported preferences fall back instead of throwing', async () => {
  const h = harness()
  assert.equal(normalizeDefaultReasoningEffort('bad'), 'auto')
  assert.deepEqual((await h.adapter.listModels('openai-codex')).map(model => model.id), ['limited', 'extended', 'plain'])
  assert.equal((await h.adapter.resolveModel('openai-codex', 'limited')).reasoning.defaultEffort, 'medium')
  h.choose('xhigh')
  assert.equal((await h.adapter.resolveModel('openai-codex', 'limited')).reasoning.defaultEffort, 'medium')
  assert.equal((await h.adapter.resolveModel('openai-codex', 'extended')).reasoning.defaultEffort, 'xhigh')
  assert.equal((await h.adapter.resolveModel('openai-codex', 'plain')).reasoning, undefined)
  const events = await h.drain(h.adapter.stream(h.request('limited')))
  assert.deepEqual(h.sent.at(-1), { model: 'limited', reasoning: 'medium' }, JSON.stringify(events.at(-1)))
  await h.drain(h.adapter.stream(h.request('extended')))
  assert.equal(h.sent.at(-1).reasoning, 'xhigh')
  await h.drain(h.adapter.stream(h.request('plain')))
  assert.equal(h.sent.at(-1).reasoning, undefined)
})

test('manual effort wins, including manual unsupported effort retaining the official rejection', async () => {
  const h = harness(); h.choose('xhigh')
  await h.drain(h.adapter.stream(h.request('limited', { reasoningEffort: 'low' })))
  assert.equal(h.sent.at(-1)?.reasoning, 'low')
  await assert.rejects(h.drain(h.adapter.stream(h.request('limited', { reasoningEffort: 'xhigh' }))), error => error.code === 'UNSUPPORTED_REASONING_EFFORT')
})

test('prepared calls keep model/default snapshots while subsequent resolutions see settings changes', async t => {
  const h = harness()
  if (typeof h.adapter.prepareCall !== 'function') return t.skip('Host has no prepared calls')
  h.choose('xhigh')
  const call = await h.adapter.prepareCall('openai-codex', 'extended')
  assert.equal(call.model.reasoning.defaultEffort, 'xhigh')
  h.choose('low'); h.fallback('low')
  assert.equal((await h.adapter.resolveModel('openai-codex', 'extended')).reasoning.defaultEffort, 'low')
  await h.drain(call.stream(h.request('extended')))
  assert.equal(h.sent.at(-1)?.reasoning, 'xhigh')
  await h.drain(call.stream(h.request('extended', { reasoningEffort: 'medium' })))
  assert.equal(h.sent.at(-1)?.reasoning, 'medium')
  await h.drain(h.adapter.stream(h.request('extended')))
  assert.equal(h.sent.at(-1)?.reasoning, 'low')
})

test('auto without a catalog default leaves provider-native default and failures unchanged', async () => {
  const h = harness(); h.fallback('unsupported')
  assert.equal((await h.adapter.resolveModel('openai-codex', 'limited')).reasoning.defaultEffort, undefined)
  await h.drain(h.adapter.stream(h.request('limited')))
  assert.equal(h.sent.at(-1)?.reasoning, undefined)
  await assert.rejects(h.drain(h.adapter.stream(h.request('missing'))), error => error.code === 'UNKNOWN_MODEL')
})

test('unrelated providers and older adapters without prepareCall preserve their contracts', async () => {
  const calls = []
  const info = { id: 'legacy', reasoning: { efforts: [{ id: 'low' }] } }
  const native = {
    resolveModel: async () => info,
    listModels: async () => [{ id: 'legacy' }],
    stream(options) { calls.push(options); return (async function* () { yield { type: 'start' } })() },
  }
  const adapter = withDefaultReasoningEffort(native, { preference: () => 'low' })
  assert.equal(adapter.prepareCall, undefined)
  for await (const _ of adapter.stream({ provider: 'openai-codex', model: 'legacy' })) {}
  assert.equal(calls[0].reasoningEffort, 'low')
  const other = { provider: 'other', model: 'legacy' }
  for await (const _ of adapter.stream(other)) {}
  assert.equal(calls[1], other)
  assert.equal(await adapter.resolveModel('other', 'legacy'), info)
})

test('a direct stream freezes the preference at invocation and preserves native cancellation', async () => {
  const h = harness(); h.choose('xhigh')
  const pending = h.adapter.stream(h.request('extended'))
  h.choose('low')
  await h.drain(pending)
  assert.equal(h.sent.at(-1).reasoning, 'xhigh')
  const caller = new AbortController(); caller.abort()
  const outcome = async adapter => {
    try { return (await h.drain(adapter.stream(h.request('limited', { signal: caller.signal })))).at(-1)?.reason }
    catch (error) { return error.code }
  }
  assert.deepEqual(await outcome(h.adapter), await outcome(h.native))
})

test('official catalog keeps only supported defaults, including none mapped to off', async () => {
  const raw = { models: [
    { slug: 'low-default', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }], default_reasoning_level: 'low' },
    { slug: 'off-default', visibility: 'list', supported_reasoning_levels: [{ effort: 'none' }, { effort: 'low' }], default_reasoning_level: 'none' },
    { slug: 'invalid-default', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }], default_reasoning_level: 'xhigh' },
  ] }
  assert.deepEqual(parseOfficialModelCatalog(raw).map(model => model.defaultReasoningEffort), ['low', 'off', undefined])
  const catalog = createOfficialModelCatalog({
    baseModels: () => openaiCodexProvider().getModels(),
    getAuth: async () => ({ auth: { apiKey: 'synthetic-token' } }),
    readCredential: async () => ({ type: 'oauth', access: 'synthetic-token', accountId: 'synthetic-account' }),
    fetch: async () => Response.json(raw),
  })
  await catalog.refresh()
  assert.equal(catalog.metadata('low-default').defaultReasoningEffort, 'low')
  assert.deepEqual(catalog.getModels().map(model => model.defaultReasoningEffort), ['low', 'off', undefined])
})

test('preferences expose auto initially and retain accepted defaults through writes and reload', async () => {
  let value = {}
  const controller = createPreferenceController({ async call(_channel, method, patch) {
    if (method === 'preferences/update') value = { ...value, ...patch }
    return { ok: true, value: { ...value, writable: true } }
  } })
  await controller.load()
  assert.equal(controller.getSnapshot().defaultReasoningEffort, 'auto')
  await controller.set({ defaultReasoningEffort: 'xhigh' })
  assert.equal(controller.getSnapshot().defaultReasoningEffort, 'xhigh')
  await controller.load()
  assert.equal(controller.getSnapshot().defaultReasoningEffort, 'xhigh')
  await controller.set({ defaultReasoningEffort: 'auto' })
  assert.equal(controller.getSnapshot().defaultReasoningEffort, 'auto')
  controller.dispose()
})
