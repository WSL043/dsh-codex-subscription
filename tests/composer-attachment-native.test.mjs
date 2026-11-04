import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeComposerAttachments, nativeComposerProps, needsSubscriptionImageEnhancement } from '../src/composer-attachment-native.js'

test('basic image browsing stays with DSH while annotation and subscription edits opt into the enhancement', () => {
  assert.equal(needsSubscriptionImageEnhancement({imageViewer:true,imageEditing:false,imageAnnotations:false}),false)
  assert.equal(needsSubscriptionImageEnhancement({imageViewer:true,imageEditing:true,imageAnnotations:false}),true)
  assert.equal(needsSubscriptionImageEnhancement({imageViewer:true,imageEditing:false,imageAnnotations:true}),true)
  assert.equal(needsSubscriptionImageEnhancement({imageViewer:false,imageEditing:true,imageAnnotations:true}),false)
})

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
