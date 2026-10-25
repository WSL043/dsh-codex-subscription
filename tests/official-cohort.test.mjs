import test from 'node:test'
import assert from 'node:assert/strict'
import { cohortDependencies, vendorDependencies, pinOfficialCohort } from '../.github/scripts/pin-official-cohort.mjs'
import { projectTestDependencies, TEST_DEPENDENCIES } from '../.github/scripts/prepare-official-test-dependencies.mjs'

test('official vendor services retain their declared generation', () => {
  assert.deepEqual(vendorDependencies({ dependencies: {
    '@deepseek-ai/cordis': '^4.0.2',
    '@deepseek-ai/cordis-plugin-hmr': '^1.0.17',
    '@deepseek-ai/cosmokit': '~1.8.3',
    '@deepseek-ai/dsh': '^0.1.5-rc.2',
    'unrelated': '^1.0.0',
  } }), [['@deepseek-ai/cordis', '4.0.2'], ['@deepseek-ai/cordis-plugin-hmr', '1.0.17'], ['@deepseek-ai/cosmokit', '1.8.3']])
})

test('a prerelease vendor range pins to that exact prerelease', () => {
  assert.deepEqual(vendorDependencies({ dependencies: {
    '@deepseek-ai/cordis': '~4.0.5-alpha.1',
    '@deepseek-ai/cosmokit': '^1.8.3',
  } }), [['@deepseek-ai/cordis', '4.0.5-alpha.1'], ['@deepseek-ai/cosmokit', '1.8.3']])
  assert.throws(() => vendorDependencies({ dependencies: { '@deepseek-ai/cordis': '>=4' } }), /Unsupported official vendor range/)
})

test('cohort resolves vendor transitives and rejects conflicting identities', async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const root = await mkdtemp(join(tmpdir(), 'cohort-test-'))
  try {
    const dependencies = {
      '@deepseek-ai/dsh': { '@deepseek-ai/cordis': '^4.0.2' },
      '@deepseek-ai/cordis': { '@deepseek-ai/cosmokit': '^1.8.3' },
    }
    await pinOfficialCohort(root, '0.1.5-rc.2', async (name, version) => ({ name, version, dependencies: dependencies[name] }))
    const result = JSON.parse(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8'))
    assert.equal(result.overrides['@deepseek-ai/cosmokit'], '1.8.3')
    await assert.rejects(pinOfficialCohort(root, '0.1.5-rc.2', async (name, version) => ({ name, version: 'bad' })), /identity mismatch/)
    dependencies['@deepseek-ai/cordis']['@deepseek-ai/cordis'] = '^4.0.4'
    await assert.rejects(pinOfficialCohort(root, '0.1.5-rc.2', async (name, version) => ({ name, version, dependencies: dependencies[name] })), /Conflicting official cohort/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('official acceptance pins matching cohort dependencies without changing independently versioned packages', () => {
  assert.deepEqual(cohortDependencies({ dependencies: {
    '@deepseek-ai/dsh-web-app': '^0.1.5-rc.2',
    '@deepseek-ai/dsh-home-paths': '0.1.1-rc.2',
    '@deepseek-ai/cordis': '^4.0.2',
    '@deepseek-ai/dsh-other': '^0.1.5-rc.3',
  }, optionalDependencies: { '@deepseek-ai/dsh-tool-fs': '~0.1.5-rc.2' } }, '0.1.5-rc.2'),
  ['@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-tool-fs'])
})

test('acceptance keeps its generated workspace overrides active', async () => {
  const {readFile} = await import('node:fs/promises')
  const script = await readFile(new URL('../.github/scripts/accept-official-release.ps1', import.meta.url), 'utf8')
  assert.match(script, /pin-official-cohort\.mjs/)
  assert.doesNotMatch(script, /--ignore-workspace/)
})

test('official behavior test dependencies retain the checkout lock graph and exact roots', async () => {
  const { readFile } = await import('node:fs/promises')
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const lockfile = await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8')
  const projected = projectTestDependencies(manifest, lockfile)
  assert.deepEqual(Object.keys(projected.manifest.dependencies), TEST_DEPENDENCIES)
  assert.equal(projected.lockfile.slice(projected.lockfile.indexOf('\npackages:\n')), lockfile.slice(lockfile.indexOf('\npackages:\n')))
  assert.ok(!projected.manifest.dependencies['@deepseek-ai/dsh-llm'])
  assert.throws(() => projectTestDependencies({ ...manifest, devDependencies: { ...manifest.devDependencies, react: '99.0.0' } }, lockfile), /not locked/)
  const smoke = await readFile(new URL('../.github/scripts/accept-official-release.ps1', import.meta.url), 'utf8')
  assert.match(smoke, /prepare-official-test-dependencies\.mjs/)
  assert.match(smoke, /--dir \$testDependenciesRoot[\s\S]*?install --frozen-lockfile --ignore-scripts/)
  assert.match(smoke, /test-official-runtime\.mjs'\) \$runnerRoot \$testDependenciesRoot/)
})

test('official runtime probe works with a release checkout that has no root node_modules', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { spawnSync } = await import('node:child_process')
  const root = await mkdtemp(join(tmpdir(), 'official-release-layout-'))
  try {
    const source = join(root, 'checkout'), runner = join(root, 'official'), deps = join(root, 'test-dependencies')
    for (const path of ['.github/scripts', 'scripts', 'src', 'tests']) await mkdir(join(source, path), { recursive: true })
    const versions = Object.fromEntries(TEST_DEPENDENCIES.map(name => [name, '1.0.0']))
    await writeFile(join(source, 'package.json'), JSON.stringify({ type: 'module', dependencies: versions }))
    await writeFile(join(source, 'cordis.patch.yml'), '')
    await writeFile(join(source, 'scripts/test-groups.mjs'), `export const testFiles=()=>['tests/resolution.test.mjs']`)
    await writeFile(join(source, '.github/scripts/test-official-runtime.mjs'), await readFile(new URL('../.github/scripts/test-official-runtime.mjs', import.meta.url)))
    for (const name of TEST_DEPENDENCIES) {
      const dir = join(deps, 'node_modules', name)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name, version: versions[name], type: 'module', exports: './index.js' }))
      await writeFile(join(dir, 'index.js'), `export default 'locked-test-${name}'`)
    }
    const official = join(runner, 'node_modules/.pnpm/node_modules/@deepseek-ai/dsh-llm')
    await mkdir(official, { recursive: true })
    await writeFile(join(official, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-llm', type: 'module', exports: './index.js' }))
    await writeFile(join(official, 'index.js'), `export default 'official-cohort'`)
    await writeFile(join(source, 'tests/resolution.test.mjs'), `import assert from 'node:assert/strict';\n${TEST_DEPENDENCIES.map((name, i) => `import dep${i} from '${name}';assert.equal(dep${i},'locked-test-${name}');`).join('\n')}\nimport official from '@deepseek-ai/dsh-llm';assert.equal(official,'official-cohort');`)
    await assert.rejects(access(join(source, 'node_modules')))
    const result = spawnSync(process.execPath, [join(source, '.github/scripts/test-official-runtime.mjs'), runner, deps], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.deepEqual(await readdir(join(runner, 'node_modules/.pnpm')), ['node_modules'], 'the temporary probe is cleaned up')
    await assert.rejects(access(join(source, 'node_modules')), undefined, 'the checkout stays without dependencies')
    await writeFile(join(deps, 'node_modules/react/package.json'), JSON.stringify({ name: 'react', version: '9.9.9' }))
    const wrong = spawnSync(process.execPath, [join(source, '.github/scripts/test-official-runtime.mjs'), runner, deps], { encoding: 'utf8' })
    assert.notEqual(wrong.status, 0)
    assert.match(wrong.stderr, /Locked test dependency mismatch: react/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
