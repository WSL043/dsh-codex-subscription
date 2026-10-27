import assert from 'node:assert/strict'
import test from 'node:test'
import { createVoiceQuestions, spokenChoice } from '../src/voice-questions.js'
import { createBargeInGate } from '../src/voice-barge-in.js'

test('native barge-in covers brief pauses between spoken words without triggering while idle', () => {
  const changes = []
  let interrupts = 0
  const gate = createBargeInGate({ outputTailMs: 500, interrupt: () => { interrupts++ }, changed: value => changes.push(value) })
  gate.sample({ mic: 0, output: .2, now: 0 })
  gate.sample({ mic: .2, output: 0, now: 60 })
  gate.sample({ mic: .2, output: 0, now: 210 })
  assert.equal(interrupts, 1)
  gate.sample({ mic: 0, output: 0, now: 400 })
  gate.sample({ mic: 0, output: 0, now: 801 })
  assert.deepEqual(changes, [true, false])
  gate.sample({ mic: .2, output: 0, now: 1000 })
  gate.sample({ mic: .2, output: 0, now: 1200 })
  assert.equal(interrupts, 1)
})

const question = { id: 'scope', question: 'Which change?', options: [{ label: 'Only report the time' }, { label: 'Change computer settings' }] }

test('spoken ordinals and labels choose the offered option; uncertainty never submits', () => {
  for (const text of ['第二个', '选第二个', '我选第二个', '第二項', 'second', 'option two', '2番目', '두번째']) {
    assert.deepEqual(spokenChoice(text, question), { id: 'scope', selected: ['Change computer settings'] }, text)
  }
  assert.equal(spokenChoice('我还不确定第二个好不好', question), undefined)
  assert.equal(spokenChoice('第三个', question), undefined)
  assert.equal(spokenChoice('not the second', question), undefined)
  assert.deepEqual(spokenChoice('Change computer settings', question), { id: 'scope', selected: ['Change computer settings'] })
})

test('multiple questions advance separately, free text is retained and repeated ordinals are allowed', async () => {
  const spoken = []
  const voice = createVoiceQuestions({ speak: text => spoken.push(text) })
  const answer = voice.ask({ questions: [question, { ...question, id: 'second' }, { id: 'why', question: 'Why?' }] })
  assert.match(spoken[0], /"number":2/)
  assert.equal(voice.consume('不确定'), true)
  assert.equal(voice.active, true)
  voice.consume('第二个')
  voice.consume('第二个', { delegation: true }) // echoed by the voice model, not another user answer
  voice.consume('第二个')
  voice.consume('Because I want to.')
  assert.deepEqual(await answer, { answers: [
    { id: 'scope', selected: ['Change computer settings'] },
    { id: 'second', selected: ['Change computer settings'] },
    { id: 'why', selected: [], custom: 'Because I want to.' },
  ] })
})

test('canceling or losing voice releases the outstanding question and does not keep its answer listener', async () => {
  const voice = createVoiceQuestions({ speak() {} })
  const control = new AbortController()
  const pending = voice.ask({ questions: [question], signal: control.signal })
  control.abort(new Error('Task canceled'))
  await assert.rejects(pending, /Task canceled/)
  assert.equal(voice.active, false)
  const next = voice.ask({ questions: [question] })
  voice.close()
  await assert.rejects(next, /connection closed/)
})

test('barge-in stops audible playback once, keeps microphone speech and waits for stale output to drain', () => {
  const changes = [], interrupts = []
  const gate = createBargeInGate({ changed: value => changes.push(value), interrupt: () => interrupts.push(true) })
  for (const now of [0, 30, 60]) gate.sample({ mic: .4, output: .4, now })
  gate.sample({ mic: 0, output: .4, now: 90 }) // short noise does not interrupt
  assert.equal(interrupts.length, 0)
  for (const now of [200, 230, 260, 290, 320, 350]) gate.sample({ mic: .4, output: .4, now })
  assert.deepEqual(changes, [true])
  assert.equal(interrupts.length, 1)
  for (const now of [400, 700, 900]) gate.sample({ mic: 0, output: .4, now })
  assert.deepEqual(changes, [true], 'old audio stays inaudible even after the user stops')
  gate.sample({ mic: 0, output: 0, now: 1000 })
  gate.sample({ mic: 0, output: 0, now: 1300 })
  assert.deepEqual(changes, [true, false])
})
