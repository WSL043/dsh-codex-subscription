import test from 'node:test'
import assert from 'node:assert/strict'
import { createSubagentTokens } from '../src/subagent-auth.js'
import { createSubagentBackendSwitcher, SUBAGENT_PROVIDER, subagentThreadPolicy } from '../src/subagent-backend.js'

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

test('subagent policy takes parent model effort and sandbox, never user Codex defaults', () => {
  assert.deepEqual(subagentThreadPolicy({ session: { requestHeader: () => ({ config: {
    provider: 'openai-codex', model: 'gpt-5.6-luna', reasoningEffort: 'max',
  } }) } }, { mode: 'read-only' }), {
    model: 'gpt-5.6-luna', modelProvider: 'openai', approvalPolicy: 'never', sandbox: 'read-only',
    config: { model_reasoning_effort: 'max' },
  })
  assert.throws(() => subagentThreadPolicy({}, {}), /sandbox/)
})

function entry(provider, extra = {}) {
  return { options: { name: '@deepseek-ai/dsh-tool-subagent' }, fiber: {
    config: { provider, ...extra }, async update(value, transient) { assert.equal(transient, true); this.config = value },
  } }
}
test('backend switches independent tool and restores it without changing fork or custom tools', async () => {
  const spawn = entry('spawn'), fork = entry('fork'), custom = entry('spawn', { persona: 'custom' })
  const switcher = createSubagentBackendSwitcher({ entries: () => [spawn, fork, custom], prepare: async () => {} })
  await switcher.select('codex')
  assert.equal(spawn.fiber.config.provider, SUBAGENT_PROVIDER)
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
