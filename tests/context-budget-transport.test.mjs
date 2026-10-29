import assert from 'node:assert/strict'
import test from 'node:test'
import { zstdDecompressSync } from 'node:zlib'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { openaiCodexProvider, openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { createCompactionBridge } from '../src/subscription-compaction.js'

test('the real adapter/provider shares one effective budget and preserves per-call output reservations', async t => {
  const previous = globalThis.fetch, wires = []
  globalThis.fetch = async (_url, init) => {
    const compressed = new Headers(init.headers).get('content-encoding') === 'zstd'
    wires.push(JSON.parse(compressed ? zstdDecompressSync(init.body).toString() : Buffer.from(init.body).toString()))
    const item = { type: 'message', id: 'msg_budget', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }
    const events = [
      { type: 'response.created', response: { id: 'resp_budget' } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'ok' },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.done', response: { id: 'resp_budget', status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11 } } },
    ]
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }
  t.after(() => { globalThis.fetch = previous })
  const base = openaiCodexProvider().getModels()[0]
  const raw = { ...base, id: 'gpt-6.1-sol', contextWindow: 500000, maxTokens: 128000 }
  let cloud = true
  const compaction = createCompactionBridge({ enabled: () => cloud, accountScope: async () => 'synthetic-account' })
  const provider = openaiCodexSubscriptionProvider({ compaction, catalog: { getModels: () => [raw], metadata: () => ({ effectiveContextWindowPercent: 95 }) } })
  const configured = new Map()
  const profiles = new Map([['openai-codex', { provider: 'openai-codex', piProvider: provider, configuredMaxTokens: configured, modelErrors: new Map(), transport: 'sse', streamIdleTimeoutMs: 3000 }]])
  const jwt = `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } })).toString('base64url')}.fake`
  const adapter = compaction.wrapAdapter(new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => jwt }))
  const info = await adapter.resolveModel('openai-codex', raw.id)
  assert.equal(info.context.contextWindow, 475000)
  assert.equal(info.defaultMaxTokens, undefined, 'advertised output capacity must not become a reservation')
  const options = { provider: 'openai-codex', model: raw.id, messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply ok.' }] }] }
  const run = async (extra, call = adapter) => {
    const events = []
    for await (const event of call.stream({ ...options, ...extra })) events.push(event)
    assert.equal(events.at(-1)?.type, 'finish')
    assert.equal(wires.at(-1).max_output_tokens, undefined, 'local reserves must not introduce an unsupported subscription output cap')
    return wires.at(-1).context_management?.[0].compact_threshold
  }
  assert.equal(await run({}), 380000)
  assert.equal(await run({ maxTokens: 128000 }), 281464)
  assert.equal(await run({ maxTokens: 64000 }), 345464)
  assert.equal(await run({}), 380000, 'the previous request must not leak its reservation')
  configured.set(raw.id, 128000)
  assert.equal(await run({}), 281464, 'an explicitly configured default must be reserved too')
  assert.equal(await run({ maxTokens: 64000 }), 345464, 'the request overrides the configured default')
  const call = await adapter.prepareCall('openai-codex', raw.id)
  configured.set(raw.id, 64000)
  assert.equal(await run({}, call), 281464, 'a prepared call keeps its frozen output reservation')
  const start = wires.length
  await Promise.all([run({ maxTokens: 128000 }), run({ maxTokens: 64000 })])
  assert.deepEqual(wires.slice(start).map(wire => wire.context_management[0].compact_threshold).sort((a, b) => a - b), [281464, 345464], 'concurrent requests keep separate output reserves')
  assert.equal(raw.contextWindow, 500000)
  cloud = false
  assert.equal(await run({}), undefined)
})
