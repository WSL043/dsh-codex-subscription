import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeComposerAttachments, nativeComposerProps } from '../src/composer-attachment-native.js'

test('host attachments remain selectable with old and alpha.2 injected registrations', () => {
  const own = () => {}, host = () => {}
  const old = { component: host, locale: 'conversation' }
  const injected = { ...old, inject: session => ({ readFileDrag: () => session }) }
  for (const entry of [old, injected]) {
    assert.equal(nativeComposerAttachments([{ component: own, locale: 'conversation' }, entry], own), entry)
  }
  assert.equal(nativeComposerAttachments([{ ...old, store: {} }, { ...old, children: {} }], own), undefined)
  assert.equal(nativeComposerAttachments([], own), undefined)
})

test('native dependency injection keeps session identity and owner attachment actions', () => {
  const attachments = [{ id: 'image', previewUrl: 'blob:test' }]
  const remove = () => {}, translate = () => {}, readFileDrag = () => {}
  const props = { sessionId: 'session-a', attachments, remove }
  const entry = { inject: session => { assert.equal(session, 'session-a'); return { readFileDrag } } }
  assert.deepEqual(nativeComposerProps(entry, props, translate), { ...props, readFileDrag, t: translate })
  assert.deepEqual(nativeComposerProps({}, props, translate), { ...props, t: translate })
})
