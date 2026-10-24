import assert from 'node:assert/strict'
import test from 'node:test'
import { createEndVoiceCallTool, withEndCallTool } from '../src/voice-tools.js'

test('the end-call tool hangs up only the conversation that has a call', async () => {
  const stopped = []
  const tool = createEndVoiceCallTool({ end: id => stopped.push(id), isActive: id => id === 'a' })
  assert.equal(tool.name, 'end_voice_call')
  assert.deepEqual(await tool.execute({}, { agent: { id: 'b' } }), { ended: false, message: 'There is no voice call running in this conversation.' })
  assert.deepEqual(await tool.execute({}, { agent: { id: 'a' } }), { ended: true, message: 'The voice call is ending; it closes once the voice has finished speaking. Say a short goodbye.' })
  assert.deepEqual(stopped, ['a'])
})

test('the tool exists only while a desktop call is open', async () => {
  let registered = 0
  let disposed = 0
  const calls = new Set()
  const voice = withEndCallTool({ start: async ({ sessionId }) => { calls.add(sessionId); return { answer: 'x' } }, stop: id => calls.delete(id), status: id => ({ active: calls.has(id) }) }, () => { registered += 1; return () => { disposed += 1 } })
  await voice.start({ sessionId: 'a' })
  await voice.start({ sessionId: 'b' })
  assert.equal(registered, 1)
  voice.stop('a')
  assert.equal(disposed, 0)
  voice.stop('b')
  assert.equal(disposed, 1)
})

test('the desktop wrapper forwards speech interruption to the active call', async () => {
  const interrupted = []
  const voice = withEndCallTool({ interrupt: id => { interrupted.push(id); return true } }, () => {})
  assert.equal(voice.interrupt('a'), true)
  assert.deepEqual(interrupted, ['a'])
})

test('an idle native window releases its end-call tool, and stale media stops do not close a new call', async () => {
  let ended, disposed=0
  const wrapped=withEndCallTool({start:async()=>({}),onStop:callback=>{ended=callback},stop:()=>false,status:()=>({active:true})},()=>()=>{disposed++})
  await wrapped.start({sessionId:'s'})
  wrapped.stop('s','old-media')
  assert.equal(disposed,0)
  ended('s')
  assert.equal(disposed,1)
})
