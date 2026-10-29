import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath, pathToFileURL } from 'node:url'
import config from '../tsdown.config.mjs'

const featureNames = ['client.sketch.js', 'client.image-viewer.js']
const main = config.find(value => value.outputOptions?.entryFileNames === 'client.js')
const imports = main.plugins.find(value => value.name === 'dsh-client-feature-imports')
const featureBuilds = config.filter(value => featureNames.includes(value.outputOptions?.entryFileNames))
const rebuildNotice = value => value.plugins.find(plugin => plugin.name === 'dsh-client-feature-rebuild-notice')

async function temporaryBuild(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-client-chunk-rebuild-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

function nativeModuleEntry() {
  // The integration runner may supply an existing official host; ordinary
  // delivery checks do not install a new host just to run this optional test.
  const explicit = process.env.DSH_NATIVE_CLIENT_MODULES_ENTRY
  if (explicit) return explicit.startsWith('file:') ? explicit : pathToFileURL(resolve(explicit)).href
  try { return import.meta.resolve('@deepseek-ai/dsh-client-modules') } catch { return undefined }
}

test('dependency source labels and maps do not depend on an external pnpm store path', () => {
  const stable = 'node_modules/.pnpm/synthetic@1.0.0/node_modules/synthetic/index.js'
  const outside = `../../another-checkout/${stable}`
  const transform = main.plugins.find(value => value.name === 'dsh-client-portable-source-paths')
  const code = `//#region ${outside}\nconst original = 'unchanged';\n//#endregion`
  assert.equal(String(transform.renderChunk(code)), code.replace(outside, stable))
  assert.equal(main.outputOptions.sourcemapPathTransform(outside), stable)
  assert.equal(main.outputOptions.sourcemapPathTransform(outside.replaceAll('/', '\\')), stable)
  assert.equal(main.outputOptions.sourcemapPathTransform('../src/client.jsx'), '../src/client.jsx')
})

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
    assert.equal(/\/\/#region (?:\.\.\/)+[^\n]*node_modules/u.test(source), false, `${fileName} exposes an external dependency location`)
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
    assert.ok(!map.sources.some(source => /(?:\.\.\/)+.*node_modules/u.test(source)), 'dependency map paths must be portable')
  }
  const entryMap = JSON.parse(await readFile(new URL('../lib/client.js.map', import.meta.url), 'utf8'))
  assert.ok(!entryMap.sources.some(source => /sketch-studio|subscription-image-viewer\.jsx/u.test(source)), 'heavy feature implementation must stay out of the initial client')
})

test('completed independent features publish through the unchanged entry metadata without future timestamps', async t => {
  const directory = await temporaryBuild(t), entry = join(directory, 'client.js')
  const source = '// unchanged entry\n'
  await writeFile(entry, source)
  const past = new Date(Date.now() - 2000)
  await utimes(entry, past, past)
  assert.equal(featureBuilds.length, 2)
  let before = (await stat(entry)).mtimeMs
  for (const feature of featureBuilds) {
    await rebuildNotice(feature).writeBundle({ dir: directory })
    const after = (await stat(entry)).mtimeMs
    assert.ok(after > before, 'a feature-only write must change the entry generation')
    assert.ok(after <= Date.now(), 'publication must not invent a future mtime')
    assert.equal(await readFile(entry, 'utf8'), source)
    before = after
  }
  await Promise.all(featureBuilds.map(feature => rebuildNotice(feature).writeBundle({ dir: directory })))
  assert.ok((await stat(entry)).mtimeMs > before)
  assert.equal(await readFile(entry, 'utf8'), source)
})

test('feature publication does not create an entry that a clean build has not written yet', async t => {
  const directory = await temporaryBuild(t)
  await Promise.all(featureBuilds.map(feature => rebuildNotice(feature).writeBundle({ dir: directory })))
  await assert.rejects(stat(join(directory, 'client.js')), error => error.code === 'ENOENT')
})

const nativeEntry = nativeModuleEntry()
test('an official host versions feature-only rebuilds and invalidates previously loaded chunks', {
  skip: !nativeEntry && 'No official client-modules package installed; set DSH_NATIVE_CLIENT_MODULES_ENTRY to its existing lib/index.js',
}, async t => {
  const { ClientModuleRegistry } = await import(nativeEntry)
  const clientSource = await readFile(new URL('./client.js', nativeEntry), 'utf8')
  for (const fileName of featureNames) await t.test(fileName, async t => {
    const directory = await temporaryBuild(t), entry = join(directory, 'client.js')
    const ownerId = 'client-chunk-rebuild-fixture'
    const source = `window.__ModuleLoader__.load({id:'${ownerId}',factory:require=>({load:()=>require.async('./${fileName}')})});`
    const featureSource = value => `window.__ModuleLoader__.load({id:'${ownerId}',chunk:'${fileName}',factory:()=>({value:'${value}'})});`
    await writeFile(entry, source)
    await writeFile(join(directory, fileName), featureSource('before'))
    const past = new Date(Date.now() - 2000)
    await utimes(entry, past, past)
    // Use the official registry/loader methods with one synthetic artifact,
    // without constructing a Service, running DSH or opening a network port.
    const registry = Object.create(ClientModuleRegistry.prototype)
    for (const key of ['table', 'sources', 'pkgMeta', 'responses', 'batchResponses', 'previousBatchResponses']) registry[key] = new Map()
    registry.rebuildListeners = new Set(); registry.graphListeners = new Set()
    registry.readSourceMap = () => undefined
    registry.table.set(ownerId, {
      entry: { id: ownerId, rev: 'initial', external: [], inject: [] },
      meta: { clientPath: entry, external: [], inject: [], immediately: false }, bundle: Buffer.from(source),
    })
    const firstRevision = registry.rebuilt(ownerId)
    const row = registry.graph().entries.find(value => value.id === ownerId)
    let events = 0
    registry.onRebuilt(() => { events++ })
    let bootstrap
    const browser = vm.createContext({ window: { __ModuleLoader__: { load: value => { bootstrap = value } } } })
    new vm.Script(clientSource).runInContext(browser)
    const bootstrapExports = bootstrap.factory(() => assert.fail('unexpected bootstrap dependency'))
    const target = { mode: 'queue', pendingQueue: [] }
    browser.window.__ModuleLoader__ = target
    let loads = 0
    const modules = new bootstrapExports.ClientModuleSystem({
      manifest: { rev: firstRevision, plugins: [], modules: [{ ...row, inject: [], external: [], initialUrl: row.url }] },
      staticModules: {}, bootstrapModule: { id: '@deepseek-ai/dsh-client-modules', exports: bootstrapExports }, registrationTarget: target,
      loadBundle: async url => {
        loads++
        const response = await registry.bundleResource('GET', url)
        assert.equal(response.status, 200)
        new vm.Script(Buffer.from(response.body).toString()).runInContext(browser)
      },
    })
    const owner = await modules.import(ownerId)
    assert.equal((await owner.load()).value, 'before')
    const firstLoads = loads
    await writeFile(join(directory, fileName), featureSource('after'))
    assert.equal(registry.rebuilt(ownerId), firstRevision, 'negative control: the host observes entry metadata, not unannounced feature writes')
    assert.equal(events, 0)
    assert.equal((await owner.load()).value, 'before')
    assert.equal(loads, firstLoads)
    const build = featureBuilds.find(value => value.outputOptions.entryFileNames === fileName)
    await rebuildNotice(build).writeBundle({ dir: directory })
    const nextRevision = registry.rebuilt(ownerId)
    assert.notEqual(nextRevision, firstRevision)
    assert.equal(events, 1)
    assert.equal(await readFile(entry, 'utf8'), source)
    modules.invalidate(ownerId, nextRevision)
    assert.equal((await owner.load()).value, 'after')
    assert.equal(loads, firstLoads + 1)
  })
})
