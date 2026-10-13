import assert from 'node:assert/strict'
import test from 'node:test'
import { createDshRemoteControl, occurrence } from '../src/remote-control-dsh.js'

const messages = [
  { role: 'user', id: 'u1', content: [{ type: 'text', text: 'Please fix the flaky login test' }] },
  { role: 'assistant', id: 'a1', content: [{ type: 'text', text: 'The login test waits on a timer.\nI replaced it with an event.' }] },
  { role: 'user', id: 'u2', content: [{ type: 'text', text: 'thanks' }] },
  { role: 'assistant', id: 'a2', content: [{ type: 'text', text: 'Anytime. Login is stable now.' }] },
]

function fixture({ searchable = true } = {}) {
  const session = { id: 's1', meta: { createdAt: 1_000_000, cwd: 'C:/w' }, deriveMessages: () => messages }
  const searches = []
  const controller = {
    resolveAgent: async id => id === 's1' ? { agent: { session, options: {} } } : { error: {} },
    list: async () => ({ items: [
      { sessionId: 's1', updatedAt: 3_000_000, running: false, blank: false, cwd: 'C:/w', projections: { values: { title: 'Flaky test' } } },
      { sessionId: 's2', updatedAt: 2_000_000, running: false, blank: false, cwd: 'C:/w', projections: { values: { title: 'Release notes' } } },
      { sessionId: 's3', updatedAt: 1_000_000, running: false, blank: false, cwd: 'C:/w', projections: { values: { title: 'Billing' } } },
    ] }),
    modelCatalog: async () => ({ default: { provider: 'openai-codex', model: 'gpt-6' }, groups: [] }),
    search: async request => {
      searches.push(request.query)
      if (!searchable) throw new Error('session search is unavailable')
      return { items: request.query === 'login' ? [{ sessionId: 's3', snippet: 'the invoice login was reset' }] : [], hasMore: false }
    },
  }
  const bridge = createDshRemoteControl({
    controller: () => controller, agents: () => ({}), userAgent: 'x/1',
    usageProfile: () => ({ read: async () => ({ available: true, lifetimeTokens: 900, peakDailyTokens: 50, currentStreakDays: 2, longestStreakDays: 7, longestRunningTurnSeconds: 60, days: [{ date: '2026-10-13', tokens: 40 }] }) }),
  })
  return { bridge, searches }
}

test('thread/list and thread/search find a conversation by its title or by what was said in it', async () => {
  const { bridge, searches } = fixture()
  assert.deepEqual((await bridge.methods['thread/list']({ searchTerm: 'release' }, {})).data.map(entry => entry.id), ['s2'])
  assert.deepEqual((await bridge.methods['thread/list']({ searchTerm: 'login' }, {})).data.map(entry => entry.id), ['s3'], 'a message hit lists the conversation')
  const found = await bridge.methods['thread/search']({ searchTerm: 'login' }, {})
  assert.deepEqual(found.data.map(hit => [hit.thread.id, hit.snippet]), [['s3', 'the invoice login was reset']])
  const byTitle = await bridge.methods['thread/search']({ searchTerm: 'flaky' }, {})
  assert.deepEqual(byTitle.data.map(hit => hit.thread.id), ['s1'])
  assert.ok(byTitle.data[0].snippet.length > 0, 'a title hit still carries a passage to show')
  assert.equal(found.nextCursor, null)
  assert.ok(searches.includes('login'))
  await assert.rejects(() => bridge.methods['thread/search']({ searchTerm: '  ' }, {}), /searchTerm/u)
})

test('searching still works on titles when DSH has no message search', async () => {
  const { bridge } = fixture({ searchable: false })
  assert.deepEqual((await bridge.methods['thread/search']({ searchTerm: 'billing' }, {})).data.map(hit => hit.thread.id), ['s3'])
  assert.deepEqual((await bridge.methods['thread/list']({ searchTerm: 'login' }, {})).data, [], 'no message hit and no title hit')
})

test('thread/searchOccurrences lists each message with the term, with cursors that match thread/turns/list', async () => {
  const { bridge } = fixture()
  const found = await bridge.methods['thread/searchOccurrences']({ threadId: 's1', searchTerm: 'login' }, {})
  assert.deepEqual(found.data.map(hit => [hit.itemId, hit.turnCursor]), [['u1', '1'], ['a1:0', '1'], ['a2:0', '0']])
  for (const hit of found.data) assert.equal(hit.snippet.slice(hit.snippetMatchRange.start, hit.snippetMatchRange.end).toLowerCase(), 'login')
  assert.equal(found.nextCursor, null)
  assert.deepEqual((await bridge.methods['thread/searchOccurrences']({ threadId: 's1', searchTerm: 'nothing-here' }, {})).data, [])
  await assert.rejects(() => bridge.methods['thread/searchOccurrences']({ threadId: 'missing', searchTerm: 'x' }, {}), /not found/iu)
})

test('a passage is cut around the match with the range counted inside it', () => {
  const text = `${'a '.repeat(80)}NEEDLE   in\nthe haystack ${'b '.repeat(80)}`
  const hit = occurrence(text, 'needle')
  assert.ok(hit.snippet.startsWith('…') && hit.snippet.endsWith('…'))
  assert.equal(hit.snippet.slice(hit.snippetMatchRange.start, hit.snippetMatchRange.end), 'NEEDLE')
  assert.equal(occurrence('short', 'zzz'), undefined)
  assert.equal(occurrence('Find me', 'find').snippetMatchRange.start, 0)
})

test('account/usage/read and currentTime/read answer from the usage profile and the clock', async () => {
  const { bridge } = fixture()
  const usage = await bridge.methods['account/usage/read'](null, {})
  assert.deepEqual(usage.summary, { lifetimeTokens: 900, peakDailyTokens: 50, longestRunningTurnSec: 60, currentStreakDays: 2, longestStreakDays: 7 })
  assert.deepEqual(usage.dailyUsageBuckets, [{ startDate: '2026-10-13', tokens: 40 }])
  const bare = createDshRemoteControl({ controller: () => undefined, userAgent: 'x/1' })
  assert.deepEqual(await bare.methods['account/usage/read']({}, {}), { summary: { lifetimeTokens: null, peakDailyTokens: null, longestRunningTurnSec: null, currentStreakDays: null, longestStreakDays: null }, dailyUsageBuckets: null })
  const now = Math.floor(Date.now() / 1000)
  assert.ok(Math.abs((await bridge.methods['currentTime/read']({ threadId: 's1' }, {})).currentTimeAt - now) <= 2)
})
