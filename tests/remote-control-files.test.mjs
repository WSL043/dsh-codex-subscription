import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createDshRemoteControl } from '../src/remote-control-dsh.js'
import { fuzzyScore, searchFiles } from '../src/remote-control-files.js'

test('the fuzzy matcher needs every letter in order and prefers runs and file names', () => {
  assert.equal(fuzzyScore('zz', 'src/a.js'), undefined)
  assert.ok(fuzzyScore('abc', 'abc.js').score > fuzzyScore('abc', 'a-x-b-y-c.js').score)
  assert.deepEqual(fuzzyScore('abc', 'a-b-c').indices, [0, 2, 4])
})

test('the phone can search files under a conversation folder, once or while typing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rc-search-'))
  try {
    await mkdir(join(root, 'src'))
    await mkdir(join(root, 'node_modules'))
    await mkdir(join(root, '.git'))
    await writeFile(join(root, 'src', 'remote-control.js'), 'x')
    await writeFile(join(root, 'README.md'), 'x')
    await writeFile(join(root, 'node_modules', 'remote.js'), 'x')
    await writeFile(join(root, '.git', 'config'), 'x')
    const bridge = createDshRemoteControl({
      controller: () => ({ list: async () => ({ items: [{ sessionId: 's1', cwd: root, blank: false }] }) }), userAgent: 'x/1',
    })
    const result = await bridge.methods.fuzzyFileSearch({ query: 'rctl', roots: [root] }, {})
    assert.equal(result.files[0].path, 'src/remote-control.js')
    assert.equal(result.files[0].fileName, 'remote-control.js')
    assert.equal(result.files[0].matchType, 'file')
    assert.equal(result.files[0].indices.length, 4)
    assert.deepEqual((await bridge.methods.fuzzyFileSearch({ query: 'remote', roots: [root] }, {})).files.map(file => file.path), ['src/remote-control.js'], 'node_modules is skipped')
    assert.deepEqual((await bridge.methods.fuzzyFileSearch({ query: 'readme', roots: [tmpdir()] }, {})).files, [], 'a folder outside the conversations is not searched')
    const notes = []
    await bridge.methods['fuzzyFileSearch/sessionStart']({ sessionId: 'q1', roots: [root] }, { notify: async (method, params) => { notes.push([method, params]) } })
    await bridge.methods['fuzzyFileSearch/sessionUpdate']({ sessionId: 'q1', query: 'read' }, {})
    assert.deepEqual(notes.map(([method]) => method), ['fuzzyFileSearch/sessionUpdated', 'fuzzyFileSearch/sessionCompleted'])
    assert.equal(notes[0][1].files[0].path, 'README.md')
    await bridge.methods['fuzzyFileSearch/sessionStop']({ sessionId: 'q1' }, {})
    assert.deepEqual(await searchFiles({ roots: [root], query: 'x', folders: [] }), [])
  } finally { await rm(root, { recursive: true, force: true }) }
})
