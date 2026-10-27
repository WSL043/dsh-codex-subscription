import test from 'node:test'
import assert from 'node:assert/strict'
import { Session, appendPluginRecord } from '@deepseek-ai/dsh-session'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { ultraCatalogPreset } from '../src/ultra-effort.js'
import { createUltraExecutionPreset, ULTRA_POLICY_RECORD } from '../src/ultra-execution.js'
import { withDefaultReasoningEffort } from '../src/default-reasoning-effort.js'
import { openaiCodexProvider, openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { createReasoningBridge } from '../src/subscription-reasoning.js'

const user = text => ({ role: 'user', content: [{ type: 'text', text }] })
const info = id => ({ id, reasoning: { defaultEffort: 'medium', efforts: ['low','medium','high','max'].map(id => ({ id, name: id })) } })
const fixtureBlock = { type: 'text', text: 'synthetic answer' }
const wireModel = { id: 'fixture', provider: 'openai-codex', api: 'openai-codex-responses', baseUrl: 'https://chatgpt.com/backend-api', reasoning: true }

function fixture({ cache = false, canDelegate = true, hasRecord = true, hasGuard = true, restored } = {}) {
  const listeners = new Map(), guards = [], wires = []
  let preference = 'auto', current, delegateAvailable = canDelegate, effective = 'max', tool = { name: 'subagent' }
  const session = restored ?? new Session('ultra-fixture')
  const tools = { guard(fn) { guards.push(fn); return () => { const index = guards.indexOf(fn); if (index >= 0) guards.splice(index, 1) } }, get: name => name === 'subagent' ? tool : undefined }
  if (!hasGuard) delete tools.guard
  const agent = { session, ctx: { tools } }; current = agent
  const ctx = { get: name => name === 'tools' ? tools : undefined, on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name) } }
  const ultra = createUltraExecutionPreset({
    catalog: { metadata: id => id === 'fixture' ? { ultra: { effectiveEffort: effective } } : undefined },
    resolveAgent: () => current, defaultEffort: () => preference,
    delegations: () => delegateAvailable ? [{ name: 'subagent', definition: tool }] : [],
    ...(hasRecord ? { record: appendPluginRecord } : {}),
  })
  const dispose = ultra.install(ctx)
  const reasoning = cache ? createReasoningBridge({ enabled: () => true, supportsModel: () => true, accountScope: async () => 'synthetic-account', resolveSession: () => session, now: () => session.header.createdAt }) : undefined
  reasoning?.sessionCreated(session)
  const native = {
    async resolveModel(_provider, model) { return info(model) },
    async prepareCall(provider, model) { return { model: info(model), stream: options => native.stream(options) } },
    async *stream(options) {
      const payload = { model: options.model, instructions: 'fixture instructions', input: options.messages.map(({ role, content }) => ({ role, content })), reasoning: { effort: options.reasoningEffort ?? 'medium' } }
      wires.push(ultra.preparePayload(reasoning?.preparePayload(payload, { ...wireModel, id: options.model }) ?? payload))
      yield { type: 'block-end', index: 0, block: fixtureBlock }
      yield { type: 'finish', reason: { kind: 'stop' }, replayState: { response: { untouched: true }, blocks: [] } }
    },
  }
  const wrap = adapter => withDefaultReasoningEffort(ultra.wrapAdapter(reasoning?.wrapAdapter(adapter) ?? adapter), { preference: () => preference })
  const adapter = wrap(native)
  const request = async (effort, { model = 'fixture', turn = 1, signal = new AbortController().signal } = {}) => {
    const config = { provider: 'openai-codex', model, ...(effort === undefined ? {} : { reasoningEffort: effort }) }
    const result = await listeners.get('agent/request')({ agent, signal, turn }, async () => config)
    assert.equal(result, config, 'the durable user selection must not be replaced with its wire effort')
    return config
  }
  const drain = async stream => { const events = []; for await (const event of stream) events.push(event); return events.at(-1) }
  const run = async (effort, messages = [user('fixture')], extra = {}) => {
    const config = await request(effort, extra)
    return drain(adapter.stream({ ...config, messages, sessionId: session.id, ...extra }))
  }
  return { ultra, agent, session, listeners, guards, wires, adapter, request, run, drain, wrap, dispose,
    preference: value => { preference = value }, delegates: value => { delegateAvailable = value }, effort: value => { effective = value }, replaceTool: () => { tool = { name: 'subagent' } }, current: value => { current = value } }
}

test('Ultra follows the official catalog override and fallback order without becoming a wire level', () => {
  for (const [levels, override, expected] of [
    [['high','max','ultra'], 'high', 'high'], [['high','max','ultra'], undefined, 'max'],
    [['high','xhigh','ultra'], undefined, 'xhigh'], [['high','xhigh','ultra'], 'ultra', 'xhigh'],
    [['high','xhigh','ultra'], 'low', 'xhigh'], [['ultra'], undefined, 'medium'],
  ]) assert.deepEqual(ultraCatalogPreset({ supported_reasoning_levels: levels.map(effort => ({ effort })), multi_agent_reasoning_effort: override }), { effectiveEffort: expected })
  assert.equal(ultraCatalogPreset({ supported_reasoning_levels: [{ effort: 'max' }] }), undefined)
  assert.equal(ultraCatalogPreset({ supported_reasoning_levels: [{ effort: 'ultra' }, { effort: 'unknown' }] }), undefined)
})

test('missing native record/guard capability and non-advertised models do not expose Ultra', async () => {
  const h = fixture({ hasRecord: false })
  assert.equal(h.ultra.available(), false)
  assert.ok(!(await h.adapter.resolveModel('openai-codex', 'fixture')).reasoning.efforts.some(x => x.id === 'ultra'))
  h.preference('ultra'); await h.run(undefined); assert.equal(h.wires[0].reasoning.effort, 'medium')
  await assert.rejects(h.request('ultra'), /does not advertise/)
  h.dispose()
  const oldHost = fixture({ hasGuard: false })
  oldHost.preference('ultra'); await oldHost.run(undefined)
  assert.equal(oldHost.wires[0].reasoning.effort, 'medium')
  assert.equal(oldHost.ultra.available(), false)
  oldHost.dispose()
})

test('global Ultra default falls back on unsupported models and presets without delegation tools', async () => {
  const h = fixture(); h.preference('ultra')
  await h.run(undefined, undefined, { model: 'limited' }); assert.equal(h.wires.at(-1).reasoning.effort, 'medium')
  h.delegates(false)
  await h.run(undefined); assert.equal(h.wires.at(-1).reasoning.effort, 'medium')
  assert.equal(h.ultra.snapshot(h.agent), undefined)
  await assert.rejects(h.request('ultra'), /does not advertise|subagent tool/)
  h.dispose()
})

test('requested Ultra is durably distinct from real effort and activates only native delegation', async () => {
  const h = fixture(); await h.run('ultra')
  assert.deepEqual(h.ultra.snapshot(h.agent), { version: 1, provider: 'openai-codex', model: 'fixture', requestedEffort: 'ultra', effectiveEffort: 'max', delegationPolicy: 'proactive', tools: ['subagent'], turn: 1, active: true })
  assert.equal(h.wires[0].reasoning.effort, 'max')
  assert.match(h.wires[0].instructions, /DSH Ultra.*max.*Proactively delegate/s)
  const record = h.session.snapshotEvents().find(e => e.type === ULTRA_POLICY_RECORD)
  assert.equal(record.ignorable, true); assert.equal(record.data.requestedEffort, 'ultra')
  assert.equal(h.guards[0]({ name: 'subagent', agent: h.agent }), undefined)
  h.replaceTool()
  assert.match(h.guards[0]({ name: 'subagent', agent: h.agent }), /changed after/)
  h.dispose(); assert.equal(h.guards.length, 0)
})

test('ordinary selection removes proactive policy; cancellation and turn completion deny late delegations', async () => {
  const h = fixture(), abort = new AbortController()
  await h.run('ultra', undefined, { signal: abort.signal })
  abort.abort()
  assert.equal(h.ultra.snapshot(h.agent).active, false)
  assert.match(h.guards[0]({ name: 'subagent', agent: h.agent }), /inactive or cancelled/)
  await h.run('high', undefined, { turn: 2 })
  assert.equal(h.ultra.snapshot(h.agent), undefined)
  assert.equal(h.wires.at(-1).instructions, 'fixture instructions')
  assert.equal(h.wires.at(-1).reasoning.effort, 'high')
  await h.run('ultra', undefined, { turn: 3 })
  h.listeners.get('session/event')(h.session, { type: 'turn/end', data: { turn: 3 } })
  assert.equal(h.ultra.snapshot(h.agent).active, false)
  assert.match(h.guards[0]({ name: 'subagent', agent: h.agent }), /inactive/)
  h.dispose()
})

test('unbound direct requests cannot turn an effort alias into ungoverned proactive execution', async () => {
  const h = fixture()
  await assert.rejects(h.drain(h.adapter.stream({ provider: 'openai-codex', model: 'fixture', sessionId: h.session.id, reasoningEffort: 'ultra', messages: [user('fixture')] })), /matching live DSH request/)
  await h.run('ultra')
  h.current({ session: { id: 'other-session' } })
  await assert.rejects(h.drain(h.adapter.stream({ provider: 'openai-codex', model: 'fixture', sessionId: h.session.id, reasoningEffort: 'ultra', messages: [user('fixture')] })), /matching live DSH request/)
  h.dispose()
})

test('prepared calls preserve the resolved model snapshot; stale new preparation rejects safely', async () => {
  const h = fixture(); await h.request('ultra')
  const call = await h.adapter.prepareCall('openai-codex', 'fixture')
  assert.match(call.model.reasoning.efforts.at(-1).name, /DSH parallel.*max/)
  h.effort('high')
  await h.drain(call.stream({ provider: 'openai-codex', model: 'fixture', sessionId: h.session.id, reasoningEffort: 'ultra', messages: [user('fixture')] }))
  assert.equal(h.wires[0].reasoning.effort, 'max')
  await assert.rejects(h.drain(h.adapter.stream({ provider: 'openai-codex', model: 'fixture', sessionId: h.session.id, reasoningEffort: 'ultra', messages: [user('fixture')] })), /matching live DSH request/)
  h.dispose()
})

test('cache-preserving reasoning records native effort when switching into and out of Ultra', async () => {
  const h = fixture({ cache: true }), firstUser = user('first')
  const first = await h.run('high', [firstUser])
  const assistant = finish => ({ role: 'assistant', content: [fixtureBlock], source: { provider: 'openai-codex', model: 'fixture', kind: 'model', replayState: finish.replayState } })
  const second = await h.run('ultra', [firstUser, assistant(first), user('second')], { turn: 2 })
  assert.equal(h.wires.at(-1).reasoning.effort, 'high')
  assert.deepEqual(h.wires.at(-1).input.filter(item => item.type === 'configuration_update').map(item => item.reasoning.effort), ['max'])
  await h.run('high', [firstUser, assistant(first), user('second'), assistant(second), user('third')], { turn: 3 })
  assert.deepEqual(h.wires.at(-1).input.filter(item => item.type === 'configuration_update').map(item => item.reasoning.effort), ['max', 'high'])
  assert.equal(h.wires.at(-1).instructions, 'fixture instructions')
  assert.ok(!JSON.stringify(h.wires).includes('"effort":"ultra"'))
  h.dispose()
})

test('restart and committed native compaction revalidate Ultra instead of restoring live permissions', async () => {
  const h = fixture()
  const config = await h.request('ultra')
  h.session.append('request/header', { header: { config }, reason: 'initial' })
  const original = h.session.append('user/message', { turn: 0, ...user('original'), id: 'original', source: { kind: 'user' } }, { surfaceOp: 'append' })
  const restored = new Session(h.session.id, h.session.snapshotEvents(), h.session.header)
  h.dispose()
  const next = fixture({ restored })
  assert.equal(restored.requestHeader().config.reasoningEffort, 'ultra')
  assert.equal(next.ultra.snapshot(next.agent), undefined)
  await assert.rejects(next.drain(next.adapter.stream({ ...config, sessionId: restored.id, messages: restored.deriveMessages() })), /matching live DSH request/)
  restored.append('user/message', { turn: 1, ...user('compacted summary'), id: 'summary', source: { kind: 'compact-checkpoint', compactionId: 'ultra-compact-fixture' } }, {
    surfaceOp: { op: 'replace', startSeq: original.seq, endSeq: original.seq }, sourceEventSeqs: [original.seq],
  })
  assert.ok(restored.surface.contentGeneration > 0)
  assert.equal(restored.requestHeader().config.reasoningEffort, 'ultra')
  await next.run(restored.requestHeader().config.reasoningEffort, restored.deriveMessages(), { turn: 2 })
  assert.equal(next.wires[0].reasoning.effort, 'max')
  assert.match(next.wires[0].instructions, /Proactively delegate/)
  assert.equal(next.ultra.snapshot(next.agent).turn, 2)
  assert.deepEqual(restored.deriveMessages().map(message => message.id), ['summary'])
  next.dispose()
})

test('titles, native compaction and approval review receive native effort without the proactive policy', async () => {
  const h = fixture(); await h.run('ultra')
  for (const options of [
    { purpose: 'session-title', messages: [user('title')] },
    { purpose: 'compaction', messages: [user('compress the transcript')] },
    { messages: [{ role: 'system', content: [{ type: 'text', text: 'REVIEW_POLICY\nYou are the final authorization reviewer' }] }, user('review')] },
  ]) {
    await h.drain(h.adapter.stream({ provider: 'openai-codex', model: 'fixture', sessionId: h.session.id, reasoningEffort: 'ultra', ...options }))
    assert.equal(h.wires.at(-1).reasoning.effort, 'max')
    assert.equal(h.wires.at(-1).instructions, 'fixture instructions')
  }
  h.effort('none'); await h.run('ultra', undefined, { turn: 2 })
  assert.equal(h.wires.at(-1).reasoning.effort, 'none')
  h.dispose()
})

test('the actual PiAiAdapter receives the resolved native effort, including prepared dispatch', async () => {
  const h = fixture(), sent = []
  const base = openaiCodexProvider().getModels().find(model => model.reasoning && model.thinkingLevelMap?.max === 'max')
  assert.ok(base)
  const provider = { ...openaiCodexSubscriptionProvider({ catalog: { getModels: () => [{ ...base, id: 'fixture' }] } }), streamSimple(model, _context, options) { sent.push(options.reasoning); throw Error('synthetic stop before networking') } }
  const native = new PiAiAdapter({ profiles: () => new Map([['openai-codex', { provider: 'openai-codex', piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(), streamIdleTimeoutMs: 1000 }]]), resolveApiKey: async () => 'synthetic-token' })
  const adapter = h.wrap(native)
  await h.request('ultra')
  const call = await adapter.prepareCall('openai-codex', 'fixture')
  assert.ok(call.model.reasoning.efforts.some(e => e.id === 'ultra'))
  await h.drain(call.stream({ provider: 'openai-codex', model: 'fixture', sessionId: h.session.id, reasoningEffort: 'ultra', messages: [user('fixture')] }))
  assert.deepEqual(sent, ['max'])
  h.dispose()
})

// This ABI acceptance uses the existing installed runtime, not a downloaded SDK.
if (process.env.DSH_REMOTE_HISTORY_RUNTIME) test('installed rc3 native request/initiator/guard contracts preserve exact Agent identity', async () => {
  const requireSdk = createRequire(resolve(process.env.DSH_REMOTE_HISTORY_RUNTIME, 'package.json'))
  const { Context } = requireSdk('@deepseek-ai/cordis')
  const { AgentRegistry, agentEvents } = requireSdk('@deepseek-ai/dsh-agent')
  const { SystemPrompt } = requireSdk('@deepseek-ai/dsh-system-prompt')
  const { ToolRuntime } = requireSdk('@deepseek-ai/dsh-tools')
  const { createScope } = requireSdk('@deepseek-ai/dsh-scope')
  const nativeSession = requireSdk('@deepseek-ai/dsh-session')
  const ctx = new Context()
  const ownedPlugins = []
  for (const plugin of [SystemPrompt, AgentRegistry, ToolRuntime]) { const fiber = ctx.plugin(plugin); ownedPlugins.push(fiber); await fiber }
  const agent = { id: 'ultra-native-fixture', session: new nativeSession.Session('ultra-native-fixture') }, owned = createScope(ctx, agent)
  agent.ctx = owned.ctx
  let entered = 0, observed
  const definition = { name: 'ultra_fixture_tool', description: 'synthetic native guard test', parameters: {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute(_args, exec) { entered++; observed = exec.agent; return 'synthetic' } }
  const unregister = ctx.get('tools').register(definition)
  const config = Object.freeze({ provider: 'openai-codex', model: 'fixture', reasoningEffort: 'ultra' })
  const unlisten = ctx.on('agent/request', async (event, next) => { assert.equal(event.agent, agent); assert.equal(ctx.get('agents').currentInitiator(), agent); assert.equal(await next(), config); return config })
  const ultra = createUltraExecutionPreset({ catalog: { metadata: () => ({ ultra: { effectiveEffort: 'max' } }) }, resolveAgent: () => ctx.get('agents').currentInitiator(), delegations: () => [{ name: definition.name, definition }], record: nativeSession.appendPluginRecord })
  const disposeUltra = ultra.install(ctx), requestAbort = new AbortController()
  const execute = () => ctx.get('tools').execute({ name: definition.name, arguments: {}, callId: 'synthetic-call', signal: new AbortController().signal, agent })
  try {
    const returned = await ctx.get('agents').withInitiator(agent, () => agentEvents(ctx, agent).waterfall('agent/request', { turn: 1, step: 0, signal: requestAbort.signal }, () => Promise.resolve(config)))
    assert.equal(returned, config)
    assert.equal((await execute()).isError, false)
    assert.equal(observed, agent); assert.equal(entered, 1)
    const deny = ctx.get('tools').guard(() => 'existing global permission denial')
    try { assert.equal((await execute()).isError, true); assert.equal(entered, 1) } finally { deny() }
    requestAbort.abort()
    assert.equal((await execute()).isError, true); assert.equal(entered, 1)
  } finally { disposeUltra(); unlisten(); unregister(); await owned.dispose(); for (const fiber of ownedPlugins.reverse()) await fiber.dispose() }
})
