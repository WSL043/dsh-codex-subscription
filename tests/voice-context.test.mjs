import assert from 'node:assert/strict'
import test from 'node:test'
import { createVoiceContextRecorder } from '../src/voice-context.js'

function fixture() {
  const persisted = [], inbox = [], messages = []
  const agent = { status: 'idle', session: { deriveMessages: () => messages, append() { throw new Error('The loop owns the message surface') } },
    inbox: { nextStep: inbox, nextTurn: [] }, inject(message) { inbox.push(message) } }
  let flushes = 0, successful = true
  const recorder = createVoiceContextRecorder({ resolveAgent: async () => agent,
    flushSession: async () => { flushes++; if (successful) persisted.splice(0, persisted.length, ...structuredClone(inbox)); return successful } })
  return { agent, recorder, messages, inbox, persisted, flushes: () => flushes, fail: () => { successful = false } }
}

test('a first voice note waits in the durable inbox without starting a turn or preceding the system prompt', async () => {
  const f = fixture()
  assert.equal(await f.recorder.record('t1', 'Confirmed transcript', 'call1'), true)
  assert.equal(f.messages.length, 0)
  assert.equal(f.agent.status, 'idle')
  assert.equal(f.persisted[0].id, 'call1')
  assert.equal(f.persisted[0].source.kind, 'codex-subscription-voice')
  assert.equal(f.flushes(), 1)
})

test('recovery recognizes queued and consumed voice checkpoints without inserting duplicates', async () => {
  const f = fixture()
  await f.recorder.record('t1', 'Confirmed transcript', 'call1')
  const restarted = createVoiceContextRecorder({ resolveAgent: async () => ({ ...f.agent, inbox: { nextStep: structuredClone(f.persisted) } }), flushSession: async () => true })
  assert.deepEqual(await restarted.recordedIds('t1', new Set(['call1', 'missing'])), new Set(['call1']))
  await f.recorder.record('t1', 'Confirmed transcript', 'call1')
  assert.equal(f.inbox.length, 1)
  f.messages.push(f.inbox.shift())
  assert.deepEqual(await f.recorder.recordedIds('t1', new Set(['call1'])), new Set(['call1']))
  await f.recorder.record('t1', 'Confirmed transcript', 'call1')
  assert.equal(f.inbox.length, 0)
})

test('unflushed notes remain recoverable and running steps finish before a note is admitted', async () => {
  const f = fixture()
  f.agent.status = 'running'
  f.agent.whenIdle = async () => { assert.equal(f.inbox.length, 0); f.agent.status = 'idle' }
  f.fail()
  assert.equal(await f.recorder.record('t1', 'Confirmed transcript', 'call1'), false)
  assert.equal(f.inbox.length, 1)
  assert.equal(await f.recorder.recordedIds('t1', new Set(['call1'])), undefined)
  f.agent.status = 'running'
  delete f.agent.whenIdle
  assert.equal(await f.recorder.record('t1', 'Keep pending', 'call2'), false)
  assert.equal(f.inbox.length, 1)
})
