import test from 'node:test'
import assert from 'node:assert/strict'
import { createSketchSessionState } from '../src/sketch-session-state.js'
import { createSketchDocumentLifecycle } from '../src/sketch-document-lifecycle.js'
import { createSketchOperationGate } from '../src/sketch-operation-gate.js'

const deferred = () => {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}
function fixture(store) {
  const state = createSketchSessionState()
  const lifecycle = createSketchDocumentLifecycle(state, {
    sessionId: 'test',
    t: (key) => key,
    store,
    cache: { current: new Map() },
    schedule() {},
    checkpoint() {},
    setSelection() {},
    setTextEdit() {},
    setRecovered() {},
    decodeImages: async () => {}
  })
  return { state, ...lifecycle }
}

test('save captures its snapshot and preserves edits made while storage is pending', async () => {
  const wait = deferred()
  let row
  const f = fixture(async (_, value) => {
    row = value
    await wait.promise
  })
  f.state.dirty.current = true
  const saving = f.save('Original')
  f.state.doc.current.layers[0].name = 'Changed'
  f.state.documentRevision.current++
  wait.resolve()
  await saving
  assert.notEqual(row.doc.layers[0].name, 'Changed')
  assert.equal(f.state.dirty.current, true)
  assert.equal(f.state.saved.current.name, 'Original')
})

test('completion of an old document save cannot mark a replacement document saved', async () => {
  const wait = deferred()
  const f = fixture(() => wait.promise)
  const saving = f.save('Old')
  f.replace(createSketchSessionState().doc.current, new Map(), null)
  wait.resolve()
  await saving
  assert.equal(f.state.saved.current, null)
})

test('clearing blank recovery cannot clear a newer edit dirty flag', async () => {
  const wait = deferred()
  const f = fixture(() => wait.promise)
  f.state.dirty.current = true
  const saving = f.saveChanges()
  f.state.documentRevision.current++
  wait.resolve()
  await saving
  assert.equal(f.state.dirty.current, true)
})

test('failed save preserves current document and prevents new-document replacement', async () => {
  const f = fixture(async () => {
    throw Error('Disk failed')
  })
  f.state.saved.current = { id: 'original', name: 'Original' }
  f.state.dirty.current = true
  const original = f.state.doc.current
  await assert.rejects(f.fresh(), /Disk failed/)
  assert.equal(f.state.doc.current, original)
  assert.equal(f.state.dirty.current, true)
})

test('successful replacement resets history, selection identity and dirty state', async () => {
  const f = fixture(async () => {})
  f.state.undo.current.push({})
  f.state.redo.current.push({})
  const original = f.state.documentId.current
  f.replace(createSketchSessionState().doc.current, new Map(), {
    id: 'loaded',
    name: 'Loaded'
  })
  assert.notEqual(f.state.documentId.current, original)
  assert.equal(f.state.undo.current.length, 0)
  assert.equal(f.state.redo.current.length, 0)
  assert.equal(f.state.saved.current.id, 'loaded')
})

test('shared operation gate rejects same-event duplicate actions and releases after failure', async () => {
  const gate = createSketchOperationGate(),
    wait = deferred(),
    busy = [],
    errors = []
  const options = {
    working: (x) => busy.push(x),
    report: (x) => errors.push(x)
  }
  const first = gate.run(() => wait.promise, options)
  assert.equal(gate.running, true)
  let duplicate = false
  assert.equal(
    await gate.run(() => {
      duplicate = true
    }, options),
    false
  )
  assert.equal(duplicate, false)
  wait.resolve()
  assert.equal(await first, true)
  assert.equal(gate.running, false)
  assert.equal(
    await gate.run(() => {
      throw Error('Failed')
    }, options),
    false
  )
  assert.match(errors.at(-1).message, /Failed/)
  assert.equal(await gate.run(() => {}, options), true)
  assert.deepEqual(busy, [true, false, true, false, true, false])
})

test('operation gate preserves blocked editor state without starting work', async () => {
  const gate = createSketchOperationGate()
  assert.equal(
    await gate.run(() => assert.fail('started'), {
      blocked: true,
      working: () => assert.fail('changed busy'),
      report() {}
    }),
    false
  )
})

test('late recovery cannot replace edits or a cancelled view', async () => {
  for (const cancelled of [true, false]) {
    const wait = deferred()
    const f = fixture(() => wait.promise)
    const original = f.state.doc.current
    const restoring = f.restore(() => !cancelled)
    if (!cancelled) {
      f.state.documentRevision.current++
      f.state.dirty.current = true
    }
    wait.resolve({ doc: createSketchSessionState().doc.current })
    await restoring
    assert.equal(f.state.doc.current, original)
  }
})

test('recovery takes precedence over archived saved draft and remains unsaved', async () => {
  const actions = []
  const recovered = createSketchSessionState().doc.current
  recovered.layers[0].name = 'Recovered'
  const f = fixture(async (action) => {
    actions.push(action)
    return { doc: recovered }
  })
  f.state.restoreId.current = 'archive'
  await f.restore()
  assert.deepEqual(actions, ['recover'])
  assert.equal(f.state.doc.current.layers[0].name, 'Recovered')
  assert.equal(f.state.saved.current, null)
  assert.equal(f.state.dirty.current, true)
  assert.equal(f.state.restoreId.current, null)
})
