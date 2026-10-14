import assert from 'node:assert/strict'
import test from 'node:test'
import { createDshRemoteControl } from '../src/remote-control-dsh.js'

function fixture(commands) {
  const session = { id: 's1', meta: { createdAt: 1_000_000, cwd: 'C:/w' }, deriveMessages: () => [], usage: undefined }
  const agent = { session, options: {}, whenIdle: async () => {} }
  const controller = {
    resolveAgent: async id => id === 's1' ? { agent } : { error: {} },
    list: async () => ({ items: [] }),
    cancel: () => {},
    modelCatalog: async () => ({ default: { provider: 'openai-codex', model: 'gpt-6' }, groups: [] }),
  }
  const bridge = createDshRemoteControl({ controller: () => controller, agents: () => ({}), userAgent: 'x/1', commands: () => commands })
  const events = []
  const notify = async (method, params) => { events.push([method, params]) }
  const settled = async () => { for (let index = 0; index < 20; index += 1) await new Promise(resolve => setImmediate(resolve)) }
  return { bridge, events, notify, settled, session }
}

const registry = execute => ({ find: (_agent, name) => name === 'compact' ? {} : undefined, execute })
const names = events => events.map(([method]) => method)

test('compacting from the phone runs as its own turn and shows the context-compacted row', async () => {
  const calls = []
  const { bridge, events, notify, settled } = fixture(registry(async (agent, line, attachments, signal) => { calls.push([agent.session.id, line, attachments.length, signal instanceof AbortSignal]); return { commandId: 'c1', result: { kind: 'success', text: 'Compacted 2 history items (~900 tokens).', sourceEventSeq: 9 } } }))
  assert.deepEqual(await bridge.methods['thread/compact/start']({ threadId: 's1' }, { notify }), {})
  await settled()
  assert.deepEqual(calls, [['s1', '/compact', 0, true]])
  assert.deepEqual(names(events).filter(method => method !== 'thread/tokenUsage/updated'), ['turn/started', 'thread/status/changed', 'item/started', 'item/completed', 'turn/completed', 'thread/status/changed'])
  const item = events.find(([method]) => method === 'item/started')[1].item
  assert.equal(item.type, 'contextCompaction')
  assert.equal(events.find(([method]) => method === 'turn/completed')[1].turn.status, 'completed')
  assert.equal(events.at(-1)[1].status.type, 'idle')
})

test('nothing to compact completes the turn without a compaction row', async () => {
  const { bridge, events, notify, settled } = fixture(registry(async () => ({ commandId: 'c1', result: { kind: 'success', text: 'No compactable history yet.' } })))
  await bridge.methods['thread/compact/start']({ threadId: 's1' }, { notify })
  await settled()
  assert.equal(names(events).includes('item/started'), false)
  assert.equal(events.find(([method]) => method === 'turn/completed')[1].turn.status, 'completed')
})

test('a compaction DSH refuses reaches the phone as an error and a failed turn', async () => {
  const { bridge, events, notify, settled } = fixture(registry(async () => ({ commandId: 'c1', result: { kind: 'error', text: 'Compaction is unavailable because this process has an active compaction, or the agent is not idle.' } })))
  await bridge.methods['thread/compact/start']({ threadId: 's1' }, { notify })
  await settled()
  const error = events.find(([method]) => method === 'error')[1]
  assert.match(error.error.message, /not idle/u)
  assert.equal(events.find(([method]) => method === 'turn/completed')[1].turn.status, 'failed')
})

test('interrupting a compaction cancels it and does not report an error', async () => {
  let observed
  const { bridge, events, notify, settled } = fixture(registry((_agent, _line, _attachments, signal) => new Promise((_, reject) => { observed = signal; signal.addEventListener('abort', () => reject(new Error('cancelled'))) })))
  await bridge.methods['thread/compact/start']({ threadId: 's1' }, { notify })
  await assert.rejects(() => bridge.methods['thread/compact/start']({ threadId: 's1' }, { notify }), /already running/u)
  bridge.methods['turn/interrupt']({ threadId: 's1' }, {})
  await settled()
  assert.equal(observed.aborted, true)
  assert.equal(names(events).includes('error'), false)
  assert.equal(events.find(([method]) => method === 'turn/completed')[1].turn.status, 'interrupted')
})

test('a DSH without on-demand compaction says so instead of pretending', async () => {
  const { bridge, notify } = fixture({ find: () => undefined, execute: async () => undefined })
  await assert.rejects(() => bridge.methods['thread/compact/start']({ threadId: 's1' }, { notify }), /cannot compact/u)
})
