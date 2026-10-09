import assert from 'node:assert/strict'
import test from 'node:test'
import { capabilityPatch, readCapabilitySettings, quotaWarning } from '../src/capability-settings.js'
import { contextModelGroups, clampModelContext } from '../src/settings-contract.js'
import { createPreferenceController } from '../src/preference-controller.js'
import { createCodexSearchProvider } from '../src/codex-search.js'

test('future model contexts preserve catalog defaults and enforce explicit maxima', () => {
  const rows = contextModelGroups([{ id: 'future-model', name: 'Future', contextWindow: 272000, maxContextWindow: 872000 }])
  assert.deepEqual(rows, [{ key: 'future-model', label: 'Future', default: 272000, maximum: 872000 }])
  assert.equal(clampModelContext(1000000, rows[0].maximum), 872000)
  assert.equal(clampModelContext(undefined, rows[0].maximum, rows[0].default), 272000)
  assert.equal(clampModelContext(128000, 64000), 64000)
})

test('capability updates reject malformed settings and normalize domain spelling', () => {
  assert.equal(readCapabilitySettings().searchMode, 'live')
  assert.deepEqual(capabilityPatch({ searchDomains: ['Example.COM', 'example.com'] }), { searchDomains: ['example.com'] })
  for (const patch of [{ searchMode: 'indexed' }, { quotaAlerts: 'always' }, { customContextModels: { model: -1 } }, { customContextModels: JSON.parse('{"__proto__":400000}') }, { searchDomains: ['https://example.com'] }, { searchDomains: ['*.example.com'] }, { searchDomains: Array(21).fill('example.com') }]) assert.throws(() => capabilityPatch(patch))
})

test('dynamic contexts migrate legacy values and accept object writes through the host', async () => {
  let value = { customContextGpt54: 500000, writable: true }
  const catalog = { contextModels: contextModelGroups([{ id: 'gpt-5.4', contextWindow: 272000 }, { id: 'future', contextWindow: 300000, maxContextWindow: 900000 }]), fastModels: ['future'] }
  const controller = createPreferenceController({ async call(_channel, method, patch) { if (method === 'preferences/update') value = { ...value, ...structuredClone(patch) }; return { ok: true, value: { ...value, ...catalog } } } })
  await controller.load()
  assert.equal(controller.getSnapshot().customContextWindows['gpt-5.4'], 500000)
  assert.equal(controller.getSnapshot().customContextWindows.future, 300000)
  await controller.set({ customContextModels: { future: 800000 } })
  assert.equal(controller.getSnapshot().error, false)
  assert.equal(controller.getSnapshot().customContextWindows.future, 800000)
  assert.equal(controller.getSnapshot().customContextWindows['gpt-5.4'], 500000)
  assert.deepEqual(controller.getSnapshot().fastModels, ['future'])
  controller.dispose()
})

test('quota warnings exclude stale, reset and code-review windows', () => {
  const now = 1800000000000
  const usage = { fetchedAt: now, rateLimits: [{ id: 'codex', windows: [{ windowSeconds: 18000, remainingPercent: 49, resetsAt: now / 1000 + 30 }] }, { id: 'code_review', windows: [{ remainingPercent: 0 }] }] }
  assert.equal(quotaWarning(usage, 'important', now), undefined)
  assert.equal(quotaWarning(usage, 'early', now).remainingPercent, 49)
  assert.equal(quotaWarning(usage, 'off', now), undefined)
  assert.equal(quotaWarning(usage, 'early', now + 31000), undefined)
  assert.equal(quotaWarning({ ...usage, fetchedAt: now - 301000 }, 'early', now), undefined)
  assert.equal(quotaWarning({ ...usage, fetchedAt: now + 1 }, 'early', now), undefined)
})

test('a rejected write can retry the intended value', async () => {
  let accepted = false
  let loads = 0
  let value = { searchMode: 'live', writable: true }
  const controller = createPreferenceController({ async call(_channel, method, patch) {
    if (method === 'preferences/status') { loads++; return { ok: true, value } }
    if (!accepted) throw new Error('write failed')
    value = { ...value, ...patch }
    return { ok: true, value }
  } })
  await controller.load()
  await controller.set({ searchMode: 'disabled' })
  assert.equal(controller.getSnapshot().searchMode, 'live')
  assert.equal(controller.getSnapshot().error, true)
  accepted = true
  await controller.retry()
  assert.equal(loads, 1, 'retry writes the failed preference instead of reloading')
  assert.equal(controller.getSnapshot().searchMode, 'disabled')
  assert.equal(controller.getSnapshot().error, false)
  controller.dispose()
})

test('search settings control the request and filter domains without suffix confusion', async () => {
  let preferences = { searchMode: 'disabled' }
  let authCalls = 0
  const bodies = []
  const provider = createCodexSearchProvider({
    resolvePreferences: () => preferences,
    async getAuth() { authCalls++; return { auth: { apiKey: 'fixture' } } },
    async readCredential() { return { type: 'oauth', access: 'fixture', accountId: 'fixture' } },
    async fetch(url, init) { bodies.push(JSON.parse(init.body)); return Response.json({ results: ['example.com', 'docs.example.com', 'evilexample.com', 'example.com.evil.org'].map(host => ({ url: `https://${host}/`, title: host })) }) },
  })
  await assert.rejects(provider.search({ query: 'query' }), /disabled/)
  assert.equal(authCalls, 0)
  preferences = { searchMode: 'cached', searchDomains: ['example.com'] }
  assert.deepEqual((await provider.search({ query: 'query' })).sources.map(source => source.title), ['example.com', 'docs.example.com'])
  assert.equal(bodies[0].settings.external_web_access, false)
  preferences = { searchMode: 'live' }
  assert.equal((await provider.search({ query: 'query' })).sources.length, 4)
  assert.equal(bodies[1].settings.external_web_access, true)
})
