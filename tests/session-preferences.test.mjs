import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openaiCodexProvider, openaiCodexSubscriptionProvider } from '../src/pi-ai-runtime.js'
import { createSessionPreferences, inheritedCodexSpeed } from '../src/session-preferences.js'

const standard = { speedMode: 'standard', outputVerbosity: 'default' }
const fast = { speedMode: 'fast', outputVerbosity: 'low' }
const metadata = id => ({ supportsFast: id === 'eligible', supportVerbosity: id !== 'no-verbosity', defaultVerbosity: 'medium' })
const session = (id, createdAt, lineage) => ({ id, header: { id, createdAt, ...lineage } })

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'codex-session-preferences-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let settings = standard
  const agents = new Map()
  const boot = (now, root = directory) => {
    const store = createSessionPreferences({ directory: root, defaults: () => settings, now: () => now,
      parentSpeed: id => inheritedCodexSpeed(agents.get(id), store.forRequest, metadata) })
    store.initialize()
    return store
  }
  return { boot, agents, settings: value => { settings = value }, directory }
}

function captureRequests(store, sessions) {
  const native = openaiCodexProvider()
  const provider = openaiCodexSubscriptionProvider({
    resolveConversationPreferences: options => store.forRequest(sessions.get(options.sessionId)),
    catalog: { metadata },
    providerFactory: () => ({ ...native, streamSimple(model, _context, options) {
      return {
        async *[Symbol.asyncIterator]() { yield { type: 'done', wire: await options.onPayload({ input: [] }, model) } },
        result: async () => ({ stopReason: 'stop' }),
      }
    } }),
  })
  return async (id, model = 'eligible') => {
    for await (const event of provider.streamSimple({ id: model }, { messages: [] }, { sessionId: id })) {
      return { tier: event.wire.service_tier, verbosity: event.wire.text?.verbosity }
    }
  }
}

test('concurrent Codex request bodies use their own session preferences and capability checks', async t => {
  const { boot, settings } = await fixture(t)
  let store = boot(10)
  const a = session('a', 11), b = session('b', 12), c = session('c', 13)
  store.created(a)
  store.created(b)
  store.update(a, fast)
  settings({ speedMode: 'fast', outputVerbosity: 'high' })
  store.created(c)
  const sessions = new Map([a, b, c].map(value => [value.id, value]))
  const run = captureRequests(store, sessions)
  assert.deepEqual(await Promise.all([run('a'), run('b'), run('c'), run('a', 'no-verbosity')]), [
    { tier: 'priority', verbosity: 'low' }, { tier: undefined, verbosity: 'medium' },
    { tier: 'priority', verbosity: 'high' }, { tier: undefined, verbosity: undefined },
  ])
  store = boot(20)
  for (const value of [a, b, c]) store.created(structuredClone(value))
  assert.deepEqual(await Promise.all(['a', 'b'].map(id => captureRequests(store, sessions)(id))), [
    { tier: 'priority', verbosity: 'low' }, { tier: undefined, verbosity: 'medium' },
  ])
})

test('a DSH child snapshots its Codex parent’s effective speed, not the global default', async t => {
  const { boot, agents } = await fixture(t)
  const store = boot(10)
  const a = session('parent', 11)
  store.created(a)
  store.update(a, fast)
  let model = 'eligible', provider = 'openai-codex'
  a.requestHeader = () => ({ config: { model, provider } })
  agents.set(a.id, { session: a })
  const child = id => session(id, 12, { origin: 'subagent', parentSession: a.id })
  const first = child('inherits'), second = child('parent-ineligible'), other = child('parent-other-provider')
  const fork = session('ordinary-fork', 12, { parentSession: a.id, isSeeded: true })
  store.created(first)
  store.created(fork)
  model = 'not-eligible'
  store.created(second)
  provider = 'other-provider'
  store.created(other)
  store.update(a, standard)
  const run = captureRequests(store, new Map([first, second, other, fork].map(value => [value.id, value])))
  assert.deepEqual(await Promise.all([run(first.id), run(first.id, 'not-eligible'), run(second.id), run(other.id), run(fork.id)]), [
    { tier: 'priority', verbosity: 'medium' }, { tier: undefined, verbosity: 'medium' },
    { tier: undefined, verbosity: 'medium' }, { tier: undefined, verbosity: 'medium' }, { tier: undefined, verbosity: 'medium' },
  ])
})

test('only explicitly following sessions track future profile defaults, including after restart (#278)', async t => {
  const { boot, settings } = await fixture(t)
  let store = boot(10)
  const following = session('follows', 11), fixed = session('fixed-standard', 11)
  store.created(following); store.created(fixed)
  store.update(following, { speedMode: 'default', outputVerbosity: 'low' })
  settings({ speedMode: 'fast', outputVerbosity: 'high' })
  assert.equal(store.current(following).speedMode, 'default')
  assert.equal(store.forRequest(following).speedMode, 'fast')
  assert.equal(store.forRequest(following).outputVerbosity, 'low')
  assert.equal(store.forRequest(fixed).speedMode, 'standard')
  store = boot(20)
  store.created(following); store.created(fixed)
  assert.equal(store.forRequest(following).speedMode, 'fast')
  assert.equal(store.forRequest(fixed).speedMode, 'standard')
  const release = store.temporary('standard', following)
  assert.equal(store.forRequest(following).speedMode, 'standard')
  release()
  settings(standard)
  assert.equal(store.forRequest(following).speedMode, 'standard')
  assert.equal(store.current(following).speedMode, 'default')
})

test('profile sidecars do not collide, and a temporary tier never replaces a saved preference', async t => {
  const { boot, directory } = await fixture(t)
  const store = boot(10), otherProfile = boot(10, join(directory, 'other-profile'))
  const a = session('../session-id', 11), b = session('b', 11)
  store.created(a)
  store.created(b)
  otherProfile.created(a)
  const release = store.temporary('fast', a)
  assert.deepEqual(store.forRequest(a), { ...standard, speedMode: 'fast' })
  assert.deepEqual(store.forRequest(b), standard)
  assert.deepEqual(store.current(a), standard)
  store.update(a, { speedMode: 'ultrafast', outputVerbosity: 'high' })
  release()
  assert.deepEqual(store.forRequest(a), { speedMode: 'ultrafast', outputVerbosity: 'high' })
  assert.deepEqual(otherProfile.forRequest(a), standard)
})
