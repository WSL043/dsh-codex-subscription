import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import { createRemoteHistorySource } from '../src/remote-history-source.js'

// CI uses the installed public session SDK. A packed-host acceptance run can
// select that host's SDK tree without opening credentials or private logs.
const runtime = process.env.DSH_REMOTE_HISTORY_RUNTIME
const requireSdk = runtime ? createRequire(resolve(runtime, 'package.json')) : createRequire(import.meta.url)
const native = requireSdk('@deepseek-ai/dsh-session')
let catalog
try { catalog = requireSdk('@deepseek-ai/dsh-session-format-catalog/message-projections') }
catch (error) { if (runtime || !['MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED'].includes(error.code)) throw error }
const user = (id, text, source = { kind: 'user' }) => ({ id, role: 'user', source, content: [{ type: 'text', text }] })
function fixture(projections = []) {
  const id = 'remote-history-fixture'
  const session = native.Session.create(id, undefined, { ...native.Session.create(id).header, cwd: resolve('history-fixture') }, undefined, projections)
  const events = []
  const append = (...args) => { const event = session.append(...args); events.push(event); return event }
  return { id, session, events, append }
}
function reader(header, events, { projections = [], duringObserve, duringFold } = {}) {
  const counts = { disposed: 0, observed: 0, folded: 0, options: [] }
  const observation = () => ({ header, events, source: 'prepared', cursor: events.at(-1)?.seq ?? -1, inheritedEventCount: 0,
    [Symbol.dispose]() { counts.disposed++ } })
  const query = { async observeSession(id, options) { assert.equal(id, header.id); counts.observed++; counts.options.push(options); const lease = observation(); duringObserve?.(); return lease } }
  const source = createRemoteHistorySource({ query: () => query, loadModule: id => id === '@deepseek-ai/dsh-session'
    ? { foldSurface(...args) { counts.folded++; const result = native.foldSurface(...args); duringFold?.(); return result }, deriveEventMessage: native.deriveEventMessage }
    : { currentSessionMessageProjections: projections } })
  return { source, counts }
}

test('native surface replacement returns the current compacted messages, never the shadowed originals', async () => {
  const f = fixture()
  f.append('user/message', user('original', 'Original prompt'), { surfaceOp: 'append' })
  f.append('assistant/message', { turn: 0, step: 0, stream: [], message: { id: 'answer', role: 'assistant', content: [{ type: 'text', text: 'Original answer' }] } }, { surfaceOp: 'append' })
  f.append('user/message', user('summary', 'Compacted summary', { kind: 'compact-checkpoint', compactionId: 'fixture-compaction' }), {
    surfaceOp: { op: 'replace', startSeq: 0, endSeq: 1 }, sourceEventSeqs: [0, 1],
  })
  f.append('user/message', user('next', 'Continue'), { surfaceOp: 'append' })
  const events = Object.freeze([...f.events])
  const { source, counts } = reader(f.session.header, events)
  const signal = new AbortController().signal
  const result = await source.read(f.id, { signal })
  assert.deepEqual(result.messages, f.session.deriveMessages())
  assert.deepEqual(result.messages.map(message => message.id), ['summary', 'next'])
  assert.equal(result.events, events)
  assert.equal(result.cursor, 3)
  assert.equal(result.source, 'prepared')
  assert.deepEqual(counts.options, [{ signal, projectionMode: 'none' }])
  assert.equal(counts.disposed, 1)
  const again = await source.read(f.id)
  assert.equal(again.messages, result.messages, 'reuse immutable prepared derivations')
  assert.equal(counts.folded, 1)
  assert.equal(counts.disposed, 2)
})

test('native first-party image projection is replayed without rewriting original event data', { skip: !catalog }, async () => {
  const projections = catalog.currentSessionMessageProjections
  const f = fixture(projections)
  f.append('user/message', { ...user('picture', 'Look'), content: [{ type: 'image', attachment: { attachmentId: 'sha256:fixture', mediaType: 'image/png', bytes: 3 } }] }, { surfaceOp: 'append' })
  f.append('image/offload', { targets: [{ seq: 0, imageIndexes: [0] }] })
  const { source, counts } = reader(f.session.header, Object.freeze([...f.events]), { projections })
  const result = await source.read(f.id)
  assert.deepEqual(result.messages, f.session.deriveMessages())
  assert.equal(result.messages[0].content[0].offloaded, true)
  assert.equal(f.events[0].data.content[0].offloaded, undefined)
  assert.equal(counts.disposed, 1)
})

test('mutable observations are not cached across appended events', async () => {
  const f = fixture()
  f.append('user/message', user('first', 'One'), { surfaceOp: 'append' })
  const { source, counts } = reader(f.session.header, f.events)
  assert.equal((await source.read(f.id)).messages.length, 1)
  f.append('user/message', user('second', 'Two'), { surfaceOp: 'append' })
  assert.equal((await source.read(f.id)).messages.length, 2)
  assert.equal(counts.folded, 2)
  assert.equal(counts.disposed, 2)
})

test('hidden child sessions and missing working folders are rejected before touching event bodies', async () => {
  for (const header of [{ id: 'private', cwd: 'C:/fixture', origin: 'subagent' }, { id: 'private' }]) {
    let disposed = 0
    const source = createRemoteHistorySource({ query: () => ({ observeSession: async () => ({ header,
      get events() { assert.fail('hidden event body must not be materialized') }, [Symbol.dispose]() { disposed++ },
    }) }), loadModule: id => id === '@deepseek-ai/dsh-session' ? native : { currentSessionMessageProjections: [] } })
    await assert.rejects(source.read(header.id), { code: 'SESSION_QUERY_SESSION_NOT_FOUND' })
    assert.equal(disposed, 1)
  }
})

test('corrupt events propagate and release the lease instead of silently falling back', async () => {
  const f = fixture()
  f.append('user/message', user('first', 'One'), { surfaceOp: 'append' })
  const { source, counts } = reader(f.session.header, Object.freeze([{ ...f.events[0], seq: 99 }]))
  await assert.rejects(source.read(f.id), /not contiguous/)
  assert.equal(counts.disposed, 1)
})

test('cancellation before observing and after an acquired lease preserves the caller reason', async () => {
  const f = fixture()
  const reason = new Error('Caller cancelled history')
  const aborted = new AbortController(); aborted.abort(reason)
  const before = reader(f.session.header, [])
  await assert.rejects(before.source.read(f.id, { signal: aborted.signal }), error => error === reason)
  assert.equal(before.counts.observed, 0)
  for (const phase of ['duringObserve', 'duringFold']) {
    const controller = new AbortController()
    const current = reader(f.session.header, [], { [phase]: () => controller.abort(reason) })
    await assert.rejects(current.source.read(f.id, { signal: controller.signal }), error => error === reason)
    assert.equal(current.counts.disposed, 1)
  }
})

test('only missing public capabilities return legacy fallback; not-found and initialization errors propagate', async () => {
  assert.equal(await createRemoteHistorySource({ query: () => undefined }).read('x'), undefined)
  assert.equal(await createRemoteHistorySource({ query: () => ({}) }).read('x'), undefined)
  let observed = 0
  const query = () => ({ observeSession() { observed++; assert.fail('unavailable SDK must not observe') } })
  const missing = createRemoteHistorySource({ query, loadModule: id => { throw Object.assign(new Error(`Cannot find module '${id}'`), { code: 'MODULE_NOT_FOUND' }) } })
  assert.equal(await missing.read('x'), undefined)
  assert.equal(observed, 0)
  const broken = new Error('SDK initialization failed')
  await assert.rejects(createRemoteHistorySource({ query, loadModule: () => { throw broken } }).read('x'), error => error === broken)
  const nestedMissing = Object.assign(new Error("Cannot find module 'broken-sdk-dependency'"), { code: 'MODULE_NOT_FOUND' })
  await assert.rejects(createRemoteHistorySource({ query, loadModule: () => { throw nestedMissing } }).read('x'), error => error === nestedMissing)
  const notFound = Object.assign(new Error('No such source'), { code: 'SESSION_QUERY_SESSION_NOT_FOUND' })
  await assert.rejects(createRemoteHistorySource({ query: () => ({ observeSession() { throw notFound } }),
    loadModule: id => id === '@deepseek-ai/dsh-session' ? native : { currentSessionMessageProjections: [] },
  }).read('missing'), error => error === notFound)
})
