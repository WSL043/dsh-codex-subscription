import test from 'node:test'
import assert from 'node:assert/strict'
import { withComposerSession, openComposerSession, createSessionOpeners } from '../src/client-session-compat.js'

test('async image work holds the exact retained session until success or failure', async () => {
  let released = 0
  const ctx = { id: 'original' }
  const sessions = { retain(id, options) {
    assert.equal(id, 'original'); assert.equal(options.source, 'controllerOperation')
    return { ready: Promise.resolve(), binding: { ctx }, release() { released++ } }
  } }
  assert.equal(await withComposerSession(sessions, 'original', async current => {
    await Promise.resolve(); assert.equal(released, 0); return current.id
  }), 'original')
  await assert.rejects(withComposerSession(sessions, 'original', () => { throw Error('upload failed') }), /upload failed/)
  assert.equal(released, 2)
  sessions.retain = () => ({ ready: Promise.reject(Error('closed')), release() { released++ } })
  await assert.rejects(withComposerSession(sessions, 'original', () => assert.fail()), /closed/)
  assert.equal(released, 3)
})

test('legacy scope remains supported; navigation follows the available host API', async () => {
  assert.equal(await withComposerSession({ scope: () => ({ id: 1 }) }, 's', ctx => ctx.id), 1)
  const calls = []
  const sessions = { open: id => calls.push('legacy:' + id) }
  openComposerSession(sessions, undefined, 'a')
  openComposerSession(sessions, { openSession: id => calls.push('modern:' + id) }, 'b')
  assert.deepEqual(calls, ['legacy:a', 'modern:b'])
  assert.throws(() => openComposerSession({}, {}, 's'), /unavailable/)
})

test('closing one of two session views restores the remaining sketch opener', () => {
  const openers = createSessionOpeners(), main = () => {}, side = () => {}
  const removeMain = openers.register('s', main), removeSide = openers.register('s', side)
  assert.equal(openers.get('s'), side)
  removeSide(); assert.equal(openers.get('s'), main)
  removeSide(); assert.equal(openers.get('s'), main)
  removeMain(); assert.equal(openers.has('s'), false)
})
