import test from 'node:test'
import assert from 'node:assert/strict'
import { createSubagentTokens } from '../src/subagent-auth.js'
import { createSubagentBackendSwitcher, presetEntries, subagentConfigListener, SUBAGENT_PROVIDER, subagentThreadPolicy } from '../src/subagent-backend.js'
import { Context } from '@deepseek-ai/cordis'

test('subscription subagent pins account and serializes concurrent token rotation', async () => {
  let current = { type: 'oauth', accountId: 'a', access: 'old' }
  let rotations = 0
  let tail = Promise.resolve()
  const store = { read: async () => current, modify: (_, fn) => {
    const next = tail.then(async () => current = await fn(current)); tail = next.catch(() => {}); return next
  } }
  const tokens = await createSubagentTokens({ store, resolveAuth: async () => {}, signal: new AbortController().signal,
    refresh: async value => { rotations++; return { ...value, access: 'new' } } })
  const results = await Promise.all([tokens('a'), tokens('a')])
  assert.equal(rotations, 1)
  assert.deepEqual(results[0], { accessToken: 'new', chatgptAccountId: 'a' })
  current = { ...current, accountId: 'b' }
  await assert.rejects(tokens(), /authorization failed/)
  await assert.rejects(tokens('b'), /authorization failed/)
})

const childFeatures = Object.fromEntries(['apps', 'plugins', 'plugin_sharing', 'remote_plugin', 'tool_suggest', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'computer_use', 'in_app_browser'].map(name => [name, false]))
test('subagent policy takes parent model effort and sandbox, never user Codex defaults', () => {
  assert.deepEqual(subagentThreadPolicy({ session: { requestHeader: () => ({ config: {
    provider: 'openai-codex', model: 'gpt-5.6-luna', reasoningEffort: 'max',
  } }) } }, { mode: 'read-only' }), {
    model: 'gpt-5.6-luna', modelProvider: 'openai', approvalPolicy: 'never', sandbox: 'read-only',
    config: { features: childFeatures, model_reasoning_effort: 'max' },
  })
  assert.throws(() => subagentThreadPolicy({}, {}), /sandbox/)
})

function entry(provider, extra = {}) {
  return { options: { name: '@deepseek-ai/dsh-tool-subagent' }, fiber: {
    config: { provider, ...extra }, async update(value, transient) { assert.equal(transient, true); this.config = value },
  } }
}

for (const modern of [false, true]) test(`config waterfall preserves owner, next and restoration on ${modern ? 'new' : 'legacy'} Cordis events`, async () => {
  const ctx = new Context()
  const dormant = { options: { name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn' } } }
  const switcher = createSubagentBackendSwitcher({ entries: () => [dormant], prepare: async () => {} })
  const off = ctx.on('internal/config', subagentConfigListener(switcher), { global: true })
  let calls = 0
  const resolve = (item, config) => {
    const next = () => { calls++; return config }
    return modern ? ctx.waterfall('internal/config', item.fiber, next) : ctx.waterfall(item.fiber, 'internal/config', config, next)
  }
  try {
    const spawn = entry('spawn'), fork = entry('fork'), custom = entry('spawn', { persona: 'custom' }), unrelated = entry('spawn')
    for (const item of [spawn, fork, custom]) item.fiber.entry = item
    unrelated.fiber.entry = { options: { name: 'unrelated' } }
    const original = spawn.fiber.config
    assert.equal(resolve(spawn, original), original, 'default backend passes the original through')
    await switcher.select('codex')
    spawn.fiber.config = resolve(spawn, original)
    assert.equal(spawn.fiber.config.provider, SUBAGENT_PROVIDER)
    for (const item of [fork, custom, unrelated]) assert.equal(resolve(item, item.fiber.config), item.fiber.config)
    assert.equal(calls, 5, 'each middleware continuation runs exactly once')
    await switcher.select('dsh')
    assert.deepEqual(spawn.fiber.config, original)
  } finally { off(); await switcher.dispose() }
})
test('explicit child route overrides inheritance without silently changing effort or permissions', () => {
  const parent = { session: { requestHeader: () => ({config: {provider:'openai-codex',model:'gpt-6-astra',reasoningEffort:'ultra'}}) } }
  const policy = {mode:'read-only'}
  const chosen = subagentThreadPolicy(parent, policy, {provider:'openai-codex',model:'gpt-5.6-luna',reasoningEffort:'low'})
  assert.equal(chosen.model, 'gpt-5.6-luna')
  assert.equal(chosen.config.model_reasoning_effort, 'low')
  assert.equal(chosen.sandbox, 'read-only')
  assert.deepEqual(subagentThreadPolicy(parent,policy,{model:'gpt-5.6-luna'}).config,{ features: childFeatures })
  const other = {session:{requestHeader:()=>({config:{provider:'deepseek',model:'deepseek'}})}}
  assert.throws(()=>subagentThreadPolicy(other,policy), /Select an openai-codex model/)
  assert.equal(subagentThreadPolicy(other,policy,{provider:'openai-codex',model:'gpt-5.6-luna'}).model,'gpt-5.6-luna')
  assert.throws(()=>subagentThreadPolicy(parent,policy,{provider:'deepseek',model:'deepseek'}), /require the openai-codex/)
  assert.throws(()=>subagentThreadPolicy(parent,policy,{sandbox:'danger-full-access'}), /Unsupported Codex child option/)
})
test('backend switches independent tool and restores it without changing fork or custom tools', async () => {
  const spawn = entry('spawn'), fork = entry('fork'), custom = entry('spawn', { persona: 'custom' })
  const switcher = createSubagentBackendSwitcher({ entries: () => [spawn, fork, custom], prepare: async () => {} })
  await switcher.select('codex')
  assert.equal(spawn.fiber.config.provider, SUBAGENT_PROVIDER)
  assert.equal(spawn.fiber.config.modelSelectionSettings, true)
  assert.equal(fork.fiber.config.provider, 'fork')
  assert.equal(custom.fiber.config.provider, 'spawn')
  await switcher.select('dsh')
  assert.deepEqual(spawn.fiber.config, { provider: 'spawn' })
  await switcher.select('codex')
  await switcher.dispose()
  assert.deepEqual(spawn.fiber.config, { provider: 'spawn' })
  await assert.rejects(switcher.select('codex'), /unavailable/)
})
test('failed persistence restores tool configuration', async () => {
  const spawn = entry('spawn')
  const switcher = createSubagentBackendSwitcher({ entries: () => [spawn], prepare: async () => {}, persist: async () => { throw Error('disk') } })
  await assert.rejects(switcher.select('codex'), /disk/)
  assert.deepEqual(spawn.fiber.config, { provider: 'spawn' })
})

test('backend restoration preserves edits made while Codex is selected', async () => {
  const spawn = entry('spawn', { toolName: 'before', maxDepth: 2 })
  const switcher = createSubagentBackendSwitcher({ entries: () => [spawn], prepare: async () => {} })
  await switcher.select('codex')
  spawn.fiber.config.toolName = 'after'
  spawn.fiber.config.maxDepth = 7
  await switcher.select('dsh')
  assert.equal(spawn.fiber.config.toolName, 'after')
  assert.equal(spawn.fiber.config.maxDepth, 7)
  await switcher.select('codex')
  spawn.fiber.config.toolName = 'latest'
  await switcher.dispose()
  assert.equal(spawn.fiber.config.toolName, 'latest')
  assert.equal(spawn.fiber.config.maxDepth, 7)
})

test('web preset tools mounted after selection receive the chosen backend', async () => {
  const dormant = { options: { name: '@deepseek-ai/dsh-tool-subagent', disabled: true, config: { provider: 'spawn' } } }
  const switcher = createSubagentBackendSwitcher({ entries: () => [dormant], prepare: async () => {} })
  await switcher.select('codex')
  const mounted = entry('spawn', { toolName: 'subagent' })
  mounted.fiber.entry = mounted
  mounted.fiber.config = switcher.configure(mounted.fiber, mounted.fiber.config)
  assert.equal(mounted.fiber.config.provider, SUBAGENT_PROVIDER)
  await switcher.select('dsh')
  assert.equal(mounted.fiber.config.provider, 'spawn')
  await switcher.dispose()
})

test('preset rows mounted by the DSH 0.2 registry are found, and a host without it yields none', () => {
  const rows = [{ options: { name: '@deepseek-ai/dsh-tool-subagent' } }, { options: { name: 'other' } }]
  const ctx = { get: name => name === 'agentPresets' ? { generations: new Map([['a', { mount: { tree: { entries: () => rows } } }], ['b', {}]]) } : undefined }
  assert.deepEqual(presetEntries(ctx), rows)
  assert.deepEqual(presetEntries({ get: () => undefined }), [])
  assert.deepEqual(presetEntries({ get: () => { throw new Error('boom') } }), [])
  assert.deepEqual(presetEntries({}), [])
})

test('a failed Codex start reports why instead of a bare stream error', async () => {
  const { startFailureReason, authenticatedSubagentChild } = await import('../src/subagent-auth.js')
  assert.equal(startFailureReason('WARNING: helper binaries\nError: failed to initialize sqlite state runtime under X\n'), 'failed to initialize sqlite state runtime under X')
  assert.equal(startFailureReason(''), undefined)
  assert.equal(startFailureReason('plain last line\n'), 'plain last line')
  assert.equal(startFailureReason(`Error: ${'x'.repeat(500)}`).length, 300)
  const { PassThrough } = await import('node:stream')
  const stderr = new PassThrough(), stdout = new PassThrough(), stdin = new PassThrough()
  const failure = new Error('stream closed')
  class Transport {
    constructor() { this.handlers = {} }
    onRequest(handler) { this.handler = handler } onNotification() {} start() {} close() {}
    async request() { throw failure }
  }
  const handlers = []
  const Recording = class extends Transport { constructor(...args) { super(...args); handlers.push(this) } }
  const child = { stdout, stdin, stderr, done: new Promise(() => {}) }
  authenticatedSubagentChild(child, { Transport: Recording, getTokens: async () => ({}), thread: {}, signal: new AbortController().signal })
  stderr.write('Error: failed to initialize sqlite state runtime\n')
  await assert.rejects(handlers[0].handler('initialize', { capabilities: {} }), /Codex subtask could not start: failed to initialize sqlite state runtime/)
})
