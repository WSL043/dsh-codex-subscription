import test from 'node:test'
import assert from 'node:assert/strict'
import { exportSketchAgentFile } from '../src/sketch-agent-export.js'
import { createSketchOperationGate } from '../src/sketch-operation-gate.js'

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('agent export excludes concurrent export and file work through blob serialization', async () => {
  const gate = createSketchOperationGate(), encoded = deferred(), bytes = deferred(), states = []
  const options = { gate, working: state => states.push(state), report() {}, exportFile: () => encoded.promise }
  const first = exportSketchAgentFile('psd', options)
  assert.equal(gate.running, true)
  await assert.rejects(exportSketchAgentFile('png', options), /being edited/)
  assert.equal(await gate.run(() => assert.fail('manual operation must wait'), options), false)
  assert.equal(gate.running, true)
  encoded.resolve({ extension: 'psd', blob: { type: 'image/vnd.adobe.photoshop', arrayBuffer: () => bytes.promise } })
  await Promise.resolve()
  assert.equal(gate.running, true)
  bytes.resolve(Uint8Array.from([0, 127, 128, 255]).buffer)
  assert.deepEqual(await first, { extension: 'psd', mediaType: 'image/vnd.adobe.photoshop', base64: 'AH+A/w==' })
  assert.equal(gate.running, false)
  assert.deepEqual(states, [true, false])
})

test('failed codec and failed blob read preserve the cause and release the editor', async () => {
  for (const stage of ['codec', 'blob']) {
    const gate = createSketchOperationGate(), failure = Error(`${stage} failure`), errors = [], states = []
    const options = {
      gate, working: state => states.push(state), report: error => errors.push(error),
      exportFile: async () => {
        if (stage === 'codec') throw failure
        return { extension: 'png', blob: { arrayBuffer: async () => { throw failure } } }
      }
    }
    await assert.rejects(exportSketchAgentFile('png', options), error => error === failure)
    assert.equal(errors.at(-1), failure)
    assert.equal(gate.running, false)
    assert.deepEqual(states, [true, false])
    options.exportFile = async () => ({ extension: 'png', blob: new Blob(['ok'], { type: 'image/png' }) })
    assert.equal((await exportSketchAgentFile('png', options)).base64, 'b2s=')
  }
})

test('busy editor rejects export without touching the codec or busy state', async () => {
  await assert.rejects(exportSketchAgentFile('draft', {
    gate: createSketchOperationGate(), blocked: true,
    exportFile: () => assert.fail('codec started'), working: () => assert.fail('busy changed'), report() {}
  }), /being edited/)
})
