import test from 'node:test'
import assert from 'node:assert/strict'
import { cohortDependencies, vendorDependencies, pinOfficialCohort } from '../.github/scripts/pin-official-cohort.mjs'

test('official vendor services retain their declared generation', () => {
  assert.deepEqual(vendorDependencies({ dependencies: {
    '@deepseek-ai/cordis': '^4.0.2',
    '@deepseek-ai/cordis-plugin-hmr': '^1.0.17',
    '@deepseek-ai/cosmokit': '~1.8.3',
    '@deepseek-ai/dsh': '^0.1.5-rc.2',
    'unrelated': '^1.0.0',
  } }), [['@deepseek-ai/cordis', '4.0.2'], ['@deepseek-ai/cordis-plugin-hmr', '1.0.17'], ['@deepseek-ai/cosmokit', '1.8.3']])
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
