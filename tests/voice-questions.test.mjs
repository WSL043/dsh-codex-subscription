import assert from 'node:assert/strict'
import test from 'node:test'
import { createVoiceQuestions } from '../src/voice-questions.js'
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

const question = { id: 'where', question: 'Which city?' }

test('free-text questions retain the final user transcript and ignore generated guesses', async () => {
  const spoken = []
  const voice = createVoiceQuestions({ speak: question => spoken.push(question.id) })
  const answer = voice.ask({ questions: [question, { id: 'why', question: 'Why?' }] })
  assert.equal(voice.consume('a guessed city', { delegation: true }), true)
  assert.deepEqual(spoken, ['where'])
  voice.consume('東京都です。')
  voice.consume('東京都です', { delegation: true })
  assert.deepEqual(spoken, ['where', 'why'])
  voice.consume('Parce que je connais la ville.')
  assert.deepEqual(await answer, { answers: [
    { id: 'where', selected: [], custom: '東京都です。' },
    { id: 'why', selected: [], custom: 'Parce que je connais la ville.' },
  ] })
})

test('choice and confirmation requests require the screen even when voice is available', async () => {
  const voice = createVoiceQuestions({ speak: () => assert.fail('screen question was sent to the voice model') })
  for (const request of [{ ...question, options: [{ label: 'Tokyo' }] }, { ...question, intent: { kind: 'approval' } }]) {
    await assert.rejects(voice.ask({ questions: [request] }), /DSH answer form/u)
    assert.equal(voice.active, false)
  }
})

test('canceling or losing voice releases the outstanding question and its listener', async () => {
  const voice = createVoiceQuestions({ speak: () => true })
  const control = new AbortController()
  const pending = voice.ask({ questions: [question], signal: control.signal })
  control.abort(new Error('Task canceled'))
  await assert.rejects(pending, /Task canceled/)
  assert.equal(voice.active, false)
  const next = voice.ask({ questions: [question] })
  voice.close()
  await assert.rejects(next, /connection closed/)
})

test('a failed send or a silent voice model releases the question for the normal DSH answerer', async () => {
  const unavailable = createVoiceQuestions({ speak: () => false })
  await assert.rejects(unavailable.ask({ questions: [question] }), /Could not send/u)
  assert.equal(unavailable.active, false)
  const silent = createVoiceQuestions({ speak: () => true, deliveryMs: 10 })
  const waiting = silent.ask({ questions: [question] })
  silent.heardReply('I have a question for you.')
  await Promise.all([assert.rejects(waiting, /No voice response/u), new Promise(resolve => setTimeout(resolve, 20))])
  assert.equal(silent.active, false)
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

test('a new reply becomes audible after barge-in even with no silent gap between outputs', () => {
  const changes = []
  const gate = createBargeInGate({ changed: value => changes.push(value), interrupt() {} })
  const sample = (now, mic, replyEpoch) => gate.sample({ now, mic, output: .4, replyEpoch })
  sample(0, .4, 4)
  sample(130, .4, 4)
  sample(200, 0, 4)
  sample(850, 0, 4)
  assert.deepEqual(changes, [true])
  sample(880, 0, 5)
  assert.deepEqual(changes, [true, false])
})
