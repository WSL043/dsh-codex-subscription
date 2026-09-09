import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSubscriptionViewerRequest, SubscriptionImageViewerService } from '../src/subscription-image-viewer.js'

test('normalizes an internal viewer request without importing optional plugins', () => {
  const invoke = async () => {}
  const value = normalizeSubscriptionViewerRequest({
    items: [
      { id: 'a', src: 'blob:a', name: 'A', width: 120, height: 80 },
      { src: '', name: 'ignored' },
      {
        src: 'blob:b',
        download: { pendingLabel: 'Preparing', errorLabel: 'Retry', onInvoke: invoke },
        actions: [{ label: 'Edit', onInvoke: invoke, closeOnSuccess: true }],
      },
    ],
    index: 9,
  })
  assert.equal(value.items.length, 2)
  assert.equal(value.index, 1)
  assert.equal(value.items[1].name, 'Image 3')
  assert.deepEqual(value.items[1].download, {
    pendingLabel: 'Preparing', errorLabel: 'Retry', onInvoke: invoke,
  })
  assert.deepEqual(value.items[1].actions, [{
    id: 'action-1', label: 'Edit', pendingLabel: 'Edit', errorLabel: 'Edit', closeOnSuccess: true, onInvoke: invoke,
  }])
})

test('keeps annotations by image across close and reopen', () => {
  const service = new SubscriptionImageViewerService()
  const opener = { focus() {} }
  const annotation = { id: 'note-1', x: 0.4, y: 0.6, note: 'Keep this detail' }

  assert.equal(service.open({ items: [{ id: 'image-a', src: 'blob:a' }], opener }), true)
  service.setAnnotations('image-a', [annotation])
  service.close()
  assert.equal(service.open({ items: [{ id: 'image-a', src: 'blob:a' }], opener }), true)

  const copy = service.getAnnotationsSnapshot()
  assert.deepEqual(copy['image-a'], [annotation])
  copy['image-a'][0].note = 'mutated copy'
  assert.equal(service.getAnnotationsSnapshot()['image-a'][0].note, annotation.note)
})

test('uses each unnamed image source as its annotation identity', () => {
  const service = new SubscriptionImageViewerService()
  const annotation = { id: 'note-a', x: 0.25, y: 0.75, note: 'A only' }

  assert.equal(service.open({ items: [{ src: 'blob:a' }] }), true)
  const firstId = service.getSnapshot().items[0].id
  service.setAnnotations(firstId, [annotation])
  service.close()

  assert.equal(service.open({ items: [{ src: 'blob:b' }] }), true)
  const secondId = service.getSnapshot().items[0].id
  assert.equal(firstId, 'blob:a')
  assert.equal(secondId, 'blob:b')
  assert.notEqual(firstId, secondId)
  assert.equal(service.getAnnotationsSnapshot()[secondId], undefined)
})

test('emits one change for open and one for close without exposing global viewer state', () => {
  const service = new SubscriptionImageViewerService()
  let changes = 0
  service.subscribe(() => { changes += 1 })
  assert.equal(service.open({ items: [{ src: 'blob:a' }] }), true)
  service.close()
  assert.equal(changes, 2)
  assert.equal(globalThis.nativeImageViewer, undefined)
})
