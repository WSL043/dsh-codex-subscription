import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import config from '../tsdown.config.mjs'

const featureNames = ['client.sketch.js', 'client.image-viewer.js']
const main = config.find(value => value.outputOptions?.entryFileNames === 'client.js')
const imports = main.plugins.find(value => value.name === 'dsh-client-feature-imports')

test('feature imports use the host async module seam in both CJS compiler forms', () => {
  for (const fileName of featureNames) {
    for (const expression of [`import("./${fileName}")`, `Promise.resolve().then(() => require('./${fileName}'))`]) {
      for (const dynamicImports of [[`./${fileName}`], []]) {
        const output = imports.renderChunk(`const load = () => ${expression};`, { dynamicImports }, { format: 'cjs' })
        assert.equal(String(output), `const load = () => require.async("./${fileName}");`)
      }
    }
  }
  assert.throws(() => imports.renderChunk('unexpected compiler output', { dynamicImports: ['./client.sketch.js'] }, { format: 'cjs' }), /no supported generated expression/)
})

test('feature resolution is package-local and unsupported static shared chunks fail the build', () => {
  const importer = fileURLToPath(new URL('../src/sketch-workspace.jsx', import.meta.url))
  assert.deepEqual(imports.resolveId('./client-sketch.jsx', importer), { id: './client.sketch.js', external: true })
  assert.equal(imports.resolveId('./sketch-document.js', importer), null)
  assert.equal(imports.resolveId('react', importer), null)
  assert.throws(() => imports.generateBundle({}, { bad: { type: 'chunk', imports: ['./client.shared.js'] } }), /must not synchronously import/)
  assert.throws(() => imports.generateBundle({}, { bad: { type: 'chunk', imports: [], code: 'import("./client.sketch.js")' } }), /must use the host async chunk loader/)
  assert.doesNotThrow(() => imports.generateBundle({}, { fine: { type: 'chunk', imports: ['react'] } }))
  for (const value of config.filter(value => value.platform === 'browser')) assert.equal(value.outputOptions.codeSplitting, false)
})

test('emitted feature artifacts register lazily under one plugin owner with usable source maps', async () => {
  for (const fileName of ['client.js', ...featureNames]) {
    const source = await readFile(new URL(`../lib/${fileName}`, import.meta.url), 'utf8')
    const registrations = []
    const context = vm.createContext({ window: { __ModuleLoader__: { load: value => registrations.push(value) } } })
    new vm.Script(source, { filename: fileName }).runInContext(context)
    assert.equal(registrations.length, 1)
    assert.equal(registrations[0].id, 'dsh-codex-subscription')
    assert.equal(typeof registrations[0].factory, 'function')
    assert.equal(registrations[0].chunk, fileName === 'client.js' ? undefined : fileName)
    assert.equal(/\brequire\(['"]\.\/client\.[^'"]+['"]\)/u.test(source), false, `${fileName} contains an unsupported synchronous relative chunk require`)
    assert.equal(/\bimport\(['"]\.\/client\.[^'"]+['"]\)/u.test(source), false, `${fileName} bypasses the host chunk loader with native import()`)
    if (fileName === 'client.js') {
      for (const featureName of featureNames) assert.ok(source.includes(`require.async("./${featureName}")`), `initial client must use host async loading for ${featureName}`)
    }
    const map = JSON.parse(await readFile(new URL(`../lib/${fileName}.map`, import.meta.url), 'utf8'))
    assert.ok(map.sources.length > 0)
    assert.equal(map.sourcesContent.length, map.sources.length)
  }
  const entryMap = JSON.parse(await readFile(new URL('../lib/client.js.map', import.meta.url), 'utf8'))
  assert.ok(!entryMap.sources.some(source => /sketch-studio|subscription-image-viewer\.jsx/u.test(source)), 'heavy feature implementation must stay out of the initial client')
})
