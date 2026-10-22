import test from 'node:test'
import assert from 'node:assert/strict'
import { zstdDecompressSync } from 'node:zlib'
import { Session } from '@deepseek-ai/dsh-session'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { openaiCodexProvider, openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { createReasoningBridge } from '../src/subscription-reasoning.js'
import { createCompactionBridge } from '../src/subscription-compaction.js'
import { REASONING_STATE_KEY } from '../src/reasoning-updates.js'

const user = text => ({ role: 'user', content: [{ type: 'text', text }] })
const jwt = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } })).toString('base64url')}.fake`
const sse = events => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
function reply(index) {
  const item = { type: 'message', id: `msg_${index}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }
  return new Response(sse([
    { type: 'response.created', response: { id: `resp_${index}` } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'ok' },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.done', response: { id: `resp_${index}`, status: 'completed', output: [item], usage: { input_tokens: 20, input_tokens_details: { cached_tokens: 8 }, output_tokens: 1, total_tokens: 21 } } },
  ]), { headers: { 'content-type': 'text/event-stream' } })
}
function fixture(t, { enabled = true, cloud = false, reject = false } = {}) {
  const previousFetch = globalThis.fetch, wires = [], headers = [], diagnostics = []
  globalThis.fetch = async (_url, init) => {
    const requestHeaders = new Headers(init.headers)
    const raw = requestHeaders.get('content-encoding') === 'zstd' ? zstdDecompressSync(init.body).toString() : Buffer.from(init.body).toString()
    wires.push(JSON.parse(raw)); headers.push(requestHeaders)
    return reject && wires.at(-1).input.some(item => item.type === 'configuration_update')
      ? new Response(JSON.stringify({ error: { message: 'Unsupported configuration_update parameter' } }), { status: 400 }) : reply(wires.length)
  }
  t.after(() => { globalThis.fetch = previousFetch })
  const native = openaiCodexProvider(), base = native.getModels().find(model => model.id === 'gpt-6.1-sol') ?? native.getModels()[0]
  const model = { ...base, id: 'gpt-6.1-sol', name: 'Synthetic Sol descriptor', reasoning: true }
  const reasoning = createReasoningBridge({ enabled: () => enabled, cloud: () => cloud, accountScope: async () => 'synthetic-account', diagnostic: reason => diagnostics.push(reason) })
  const compaction = createCompactionBridge({ enabled: () => cloud, accountScope: async () => 'synthetic-account' })
  const provider = openaiCodexSubscriptionProvider({ reasoning, compaction, catalog: { getModels: () => [model], metadata: () => ({ supportsFast: true }) }, resolveSpeedMode: () => 'fast', resolveOutputVerbosity: () => 'low', resolveReasoningSummary: () => 'concise' })
  const profiles = new Map([['openai-codex', { provider: 'openai-codex', piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(), transport: 'sse', cacheRetention: 'short', streamIdleTimeoutMs: 3000 }]])
  const target = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => jwt })
  const adapter = reasoning.wrapAdapter(compaction.wrapAdapter(target))
  const create = id => reasoning.sessionCreated(Session.create(id))
  const run = async (messages, effort = 'medium', id = 'new-session', signal) => {
    const events = [], content = []
    for await (const event of adapter.stream({ provider: 'openai-codex', model: model.id, messages, sessionId: id, reasoningEffort: effort, signal })) {
      events.push(event); if (event.type === 'block-end') content[event.index] = event.block
    }
    const finish = events.at(-1)
    return { finish, events, message: { role: 'assistant', content: content.filter(Boolean), source: { kind: 'model', provider: 'openai-codex', model: model.id, replayState: finish?.replayState } } }
  }
  return { reasoning, wires, headers, diagnostics, create, run }
}

test('real PiAiAdapter/provider path persists local metadata but never sends it to the service', async t => {
  const f = fixture(t); f.create('new-session')
  const controller = new AbortController()
  const first = await f.run([user('first')], 'medium', 'new-session', controller.signal)
  assert.equal(first.finish.reason.kind, 'stop', JSON.stringify(first.finish))
  assert.ok(first.finish.replayState.response[REASONING_STATE_KEY])
  const history = [user('first'), JSON.parse(JSON.stringify(first.message)), user('second')]
  const second = await f.run(history, 'high')
  assert.equal(second.finish.reason.kind, 'stop', JSON.stringify(second.finish))
  assert.equal(f.wires[1].reasoning.effort, 'medium')
  assert.equal(f.wires[1].input.find(item => item.type === 'configuration_update').reasoning.effort, 'high')
  assert.equal(f.wires[1].reasoning.summary, 'concise')
  assert.equal(f.wires[1].text.verbosity, 'low')
  assert.equal(f.wires[1].service_tier, 'priority')
  assert.equal(f.wires[1].prompt_cache_key, f.wires[0].prompt_cache_key)
  assert.equal(f.headers[1].get('chatgpt-account-id'), 'synthetic-account')
  assert.equal(f.wires[1].store, false)
  assert.ok(!JSON.stringify(f.wires[1]).includes(REASONING_STATE_KEY))
  assert.ok(!JSON.stringify(f.wires[1]).includes('"baseline"'))
  assert.deepEqual(second.finish.replayState.blocks.map(item => item.type), ['text'])
  assert.equal(first.finish.replayState.response.provider, 'openai-codex')
  assert.equal(first.finish.replayState.response.model, 'gpt-6.1-sol')
  const fork = await f.run([user('first'), first.message, user('fork')], 'low', 'fork-session')
  assert.equal(fork.finish.reason.kind, 'stop')
  assert.equal(f.wires[2].reasoning.effort, 'medium')
  assert.equal(f.wires[2].prompt_cache_key, 'fork-session', 'cache-key ownership remains with the provider')
  assert.equal(f.wires[2].input.find(item => item.type === 'configuration_update').reasoning.effort, 'low')
})

test('real path keeps default-off and cloud behavior, with no hidden setting mutation', async t => {
  for (const mode of [{ enabled: false }, { cloud: true }]) {
    const f = fixture(t, mode); f.create('new-session')
    const first = await f.run([user('first')])
    await f.run([user('first'), first.message, user('second')], 'high')
    assert.equal(f.wires[1].reasoning.effort, 'high')
    assert.ok(!f.wires[1].input.some(item => item.type === 'configuration_update'))
    assert.equal(first.finish.replayState.response[REASONING_STATE_KEY], undefined)
    assert.equal(f.wires[1].context_management !== undefined, mode.cloud === true)
  }
})

test('service parameter rejection is not rewritten as transport failure and is not retried', async t => {
  const f = fixture(t, { reject: true }); f.create('new-session')
  const first = await f.run([user('first')])
  const history = [user('first'), first.message, user('next')]
  const result = await f.run(history, 'high')
  assert.equal(result.finish.reason.kind, 'error')
  assert.equal(result.finish.reason.failure.code, 'PI_AI_ERROR')
  assert.equal(f.wires.length, 2)
  assert.equal(result.finish.replayState, undefined)
  const conflict = await f.run(history, 'low')
  assert.equal(conflict.finish.reason.failure.code, 'PI_AI_ERROR')
  assert.match(conflict.finish.reason.failure.message, /same input/u)
  assert.equal(f.wires.length, 2, 'a local bridge conflict must not dispatch another request')
})
