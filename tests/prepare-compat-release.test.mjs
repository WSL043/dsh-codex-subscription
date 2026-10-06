import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  boundedArtifactPaths,
  compareVersions,
  cordisHostOf,
  extractDeepSeekReleaseAgeSelectors,
  hostOf,
  planCompatibilityUpdate,
  rewriteBoundedVersions,
  rewriteReleaseAgeCohort,
  rewriteSubagentRuntime,
  rewriteWorkspaceCohort,
  selectNextUntestedVersion,
} from '../scripts/prepare-compat-release.mjs'

const fixture = () => ({
  compatibility: {
    latestTested: '0.1.0-rc.8',
    supported: ['0.1.0-rc.6', '0.1.0-rc.7', '0.1.0-rc.8'],
  },
  manifest: {
    version: '1.1.4',
    dependencies: { '@deepseek-ai/dsh-home-paths': '0.1.0-rc.8' },
    devDependencies: {
      '@deepseek-ai/dsh-web': '0.1.0-rc.8',
      react: '18.3.1',
    },
    peerDependencies: {
      '@deepseek-ai/dsh-web': '0.1.0-rc.6 || 0.1.0-rc.7 || 0.1.0-rc.8',
      react: '^18.2.0',
    },
  },
})

const previewFixture = (version = '1.11.3') => ({
  compatibility: {
    latestTested: '0.1.1-rc.2',
    supported: ['0.1.1-rc.2'],
    previews: ['0.1.2-alpha.1', '0.1.2-alpha.2'],
  },
  manifest: {
    version,
    dependencies: { '@deepseek-ai/dsh-home-paths': '0.1.1-rc.2' },
    devDependencies: {
      '@deepseek-ai/dsh-web': '0.1.2-alpha.2',
      react: '18.3.1',
    },
    peerDependencies: {
      '@deepseek-ai/dsh-web': '0.1.1-rc.2 || 0.1.2-alpha.1 || 0.1.2-alpha.2',
      react: '^18.2.0',
    },
  },
})

test('queues the oldest untested official registry version', () => {
  const versions = ['0.1.1-rc.2', '0.1.0-rc.8', '0.1.1-rc.1']
  assert.equal(selectNextUntestedVersion(versions, '0.1.0-rc.8'), '0.1.1-rc.1')
  assert.equal(selectNextUntestedVersion(versions, '0.1.1-rc.2'), null)
  assert.ok(compareVersions('0.1.1-rc.1', '0.1.0-rc.8') > 0)
})

test('skips every accepted stable and preview version when selecting compatibility work', () => {
  const versions = ['0.1.1-rc.2', '0.1.2-alpha.1', '0.1.2-alpha.2', '0.1.2-alpha.3']
  assert.equal(selectNextUntestedVersion(versions, previewFixture().compatibility), '0.1.2-alpha.3')
  assert.equal(selectNextUntestedVersion(versions.slice(0, 3), previewFixture().compatibility), null)
})

test('plans preview DSH support as a plugin beta without moving the stable lane', () => {
  const update = planCompatibilityUpdate(previewFixture(), '0.1.2-alpha.3')
  assert.equal(update.pluginVersion, '1.11.4-beta.0')
  assert.equal(update.compatibility.latestTested, '0.1.1-rc.2')
  assert.deepEqual(update.compatibility.supported, ['0.1.1-rc.2'])
  assert.deepEqual(update.compatibility.previews, ['0.1.2-alpha.1', '0.1.2-alpha.2', '0.1.2-alpha.3'])
  assert.equal(update.manifest.devDependencies['@deepseek-ai/dsh-web'], '0.1.2-alpha.2')
  assert.equal(update.manifest.dependencies['@deepseek-ai/dsh-home-paths'], '0.1.1-rc.2')
  assert.equal(
    update.manifest.peerDependencies['@deepseek-ai/dsh-web'],
    '0.1.1-rc.2 || 0.1.2-alpha.1 || 0.1.2-alpha.2 || 0.1.2-alpha.3',
  )
  assert.deepEqual(boundedArtifactPaths(update), [])
  assert.equal(rewriteWorkspaceCohort('stable release-age policy', update), 'stable release-age policy')
})

test('increments repeated plugin betas and promotes the same patch when DSH leaves preview', () => {
  assert.equal(planCompatibilityUpdate(previewFixture('1.11.4-beta.0'), '0.1.2-alpha.3').pluginVersion, '1.11.4-beta.1')
  const stable = planCompatibilityUpdate(previewFixture('1.11.4-beta.1'), '0.1.2')
  assert.equal(stable.pluginVersion, '1.11.4')
  assert.equal(stable.compatibility.latestTested, '0.1.2')
  assert.equal(
    rewriteBoundedVersions('plugin 1.11.3 on DSH 0.1.1-rc.2', stable, 'fixture'),
    'plugin 1.11.4 on DSH 0.1.2',
  )
})

test('plans one stable plugin patch for one newly accepted DSH version', () => {
  const update = planCompatibilityUpdate(fixture(), '0.1.1-rc.1')
  assert.equal(update.pluginVersion, '1.1.5')
  assert.equal(update.compatibility.latestTested, '0.1.1-rc.1')
  assert.equal(update.manifest.devDependencies['@deepseek-ai/dsh-web'], '0.1.1-rc.1')
  assert.equal(update.manifest.dependencies['@deepseek-ai/dsh-home-paths'], '0.1.1-rc.1')
  assert.equal(
    update.manifest.peerDependencies['@deepseek-ai/dsh-web'],
    '0.1.0-rc.6 || 0.1.0-rc.7 || 0.1.0-rc.8 || 0.1.1-rc.1',
  )
  assert.equal(update.manifest.devDependencies.react, '18.3.1')
  assert.equal(update.manifest.peerDependencies.react, '^18.2.0')
  assert.deepEqual(boundedArtifactPaths(update), [
    'README.md',
    'README.en.md',
    'dsh-codex.ps1',
    '.github/scripts/accept-official-release.ps1',
  ])
  assert.equal(
    rewriteWorkspaceCohort('cohort 0.1.0-rc.8', update),
    'cohort 0.1.1-rc.1',
  )
})

test('is idempotent for an accepted version and refuses rollback', () => {
  assert.equal(planCompatibilityUpdate(fixture(), '0.1.0-rc.8'), null)
  assert.throws(() => planCompatibilityUpdate(fixture(), '0.1.0-rc.7'), /older than latest tested/u)
})

test('rewrites only bounded current-version artifacts', () => {
  const update = planCompatibilityUpdate(fixture(), '0.1.1-rc.1')
  const rewritten = rewriteBoundedVersions(
    'plugin 1.1.4 on DSH 0.1.0-rc.8',
    update,
    'fixture',
  )
  assert.equal(rewritten, 'plugin 1.1.5 on DSH 0.1.1-rc.1')
  assert.throws(() => rewriteBoundedVersions('no versions here', update, 'fixture'), /no bounded version/u)
})

test('regenerates exact release-age exceptions from the accepted lock graph', () => {
  const lockfile = [
    'lockfileVersion: 9.0',
    '',
    'packages:',
    '',
    "  '@deepseek-ai/dsh-web@0.1.1-rc.1':",
    '    resolution: {integrity: sha512-test}',
    '',
    "  '@deepseek-ai/cordis@4.0.1':",
    '    resolution: {integrity: sha512-test}',
    '',
    'snapshots:',
    '',
  ].join('\n')
  const selectors = extractDeepSeekReleaseAgeSelectors(lockfile)
  assert.deepEqual(selectors, ['@deepseek-ai/cordis@4.0.1', '@deepseek-ai/dsh-web@0.1.1-rc.1'])

  const workspace = [
    'minimumReleaseAge: 1440',
    '# dsh-compat-release-age-start',
    'minimumReleaseAgeExclude:',
    "  - '@deepseek-ai/dsh-web@0.1.0-rc.8'",
    '# dsh-compat-release-age-end',
    '',
  ].join('\n')
  const rewritten = rewriteReleaseAgeCohort(workspace, selectors)
  assert.match(rewritten, /@deepseek-ai\/dsh-web@0\.1\.1-rc\.1/u)
  assert.doesNotMatch(rewritten, /0\.1\.0-rc\.8/u)
  assert.doesNotMatch(rewritten, /@deepseek-ai\/\*/u)
})

 test('manager stamping uses its assignment rather than a stale documented version', () => {
 const update = { previousPluginVersion: '2.1.1-beta.1', previousDocumentedPluginVersion: '2.1.0', pluginVersion: '2.1.1', updateStableReferences: true, previousDshVersion: '0.1.5-rc.1', dshVersion: '0.1.5-rc.2' }
 const source = "$PackageVersion = '1.15.0'\n$PackageSpec = 'dsh-codex-subscription@1.15.0'\n$OtherVersion = '1.15.0'\n"
 const result = rewriteBoundedVersions(source, update, 'dsh-codex.ps1')
 assert.equal(result, "$PackageVersion = '2.1.1'\n$PackageSpec = 'dsh-codex-subscription@2.1.1'\n$OtherVersion = '1.15.0'\n")
 assert.equal(rewriteBoundedVersions(result, update, 'dsh-codex.ps1'), result)
 for (const invalid of ['', source + source, "$PackageVersion = 'invalid'"]) assert.throws(() => rewriteBoundedVersions(invalid, update, 'dsh-codex.ps1'))
 for (const invalid of [source.replace(/^\$PackageSpec.*\n/mu, ''), source.replace('@1.15.0', '@1.14.0'), source + "$PackageSpec = 'dsh-codex-subscription@1.15.0'\n"]) assert.throws(() => rewriteBoundedVersions(invalid, update, 'dsh-codex.ps1'), /PackageSpec/u)
})

test('current repository bounded artifacts can prepare the next DSH candidate', () => {
 const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8')
 const state = { manifest: JSON.parse(read('package.json')), compatibility: JSON.parse(read('compatibility.json')) }
 const current = state.compatibility.latestTested
 const candidate = current.replace(/^(\d+)\.(\d+)\.(\d+).*$/, (_, major, minor, patch) => major + '.' + minor + '.' + (Number(patch) + 1))
 const update = planCompatibilityUpdate(state, candidate)
 for (const file of boundedArtifactPaths(update)) assert.doesNotThrow(() => rewriteBoundedVersions(read(file), update, file), file)
})

const withHostPeers = state => {
  state.manifest.peerDependencies['@deepseek-ai/cordis'] = '4.0.3 || 4.0.4'
  state.manifest.peerDependencies['@deepseek-ai/dsh-subagent-codex'] = '0.1.1-rc.2'
  state.manifest.peerDependenciesMeta = { '@deepseek-ai/dsh-subagent-codex': { optional: true } }
  state.manifest.devDependencies['@deepseek-ai/dsh-subagent-codex'] = '0.1.1-rc.2'
  return state
}

test('the cordis host comes from the exact version a DSH release declares', () => {
  assert.equal(cordisHostOf({ dependencies: { '@deepseek-ai/cordis': '~4.0.5-alpha.1' } }), '4.0.5-alpha.1')
  assert.equal(cordisHostOf({ dependencies: { '@deepseek-ai/cordis': '^4.0.4' } }), '4.0.4')
  assert.equal(cordisHostOf({ dependencies: { '@deepseek-ai/cordis': '>=4' } }), undefined)
  assert.equal(cordisHostOf({}), undefined)
})

test('a preview widens the cordis host and the optional subtask runtime peer without touching its dev pin', () => {
  const state = withHostPeers(previewFixture())
  const update = planCompatibilityUpdate({ ...state, host: { cordis: '4.0.5-alpha.1', subagentRuntime: '0.1.2-alpha.3' } }, '0.1.2-alpha.3')
  assert.equal(update.manifest.peerDependencies['@deepseek-ai/cordis'], '4.0.3 || 4.0.4 || 4.0.5-alpha.1')
  assert.equal(update.manifest.peerDependencies['@deepseek-ai/dsh-subagent-codex'], '0.1.1-rc.2 || 0.1.2-alpha.3')
  assert.equal(update.manifest.devDependencies['@deepseek-ai/dsh-subagent-codex'], '0.1.1-rc.2')
  assert.equal(update.subagentRuntime, '0.1.2-alpha.3')
  const again = planCompatibilityUpdate({ ...state, host: { cordis: '4.0.4' } }, '0.1.2-alpha.3')
  assert.equal(again.manifest.peerDependencies['@deepseek-ai/cordis'], '4.0.3 || 4.0.4')
  assert.equal(again.subagentRuntime, undefined)
})

test('a stable release also pins the subtask runtime it installs', () => {
  const state = withHostPeers(previewFixture())
  const update = planCompatibilityUpdate({ ...state, host: { subagentRuntime: '0.1.2' } }, '0.1.2')
  assert.equal(update.manifest.devDependencies['@deepseek-ai/dsh-subagent-codex'], '0.1.2')
  assert.equal(update.manifest.peerDependencies['@deepseek-ai/dsh-subagent-codex'], '0.1.1-rc.2 || 0.1.2')
})

test('the subtask runtime list follows the update: a preview is added, a stable release becomes the installed version', () => {
  const source = [
    "export const SUBAGENT_RUNTIME_VERSION = '0.2.0-rc.2'",
    "export const SUPPORTED_RUNTIME_VERSIONS = Object.freeze(['0.2.0-rc.1', SUBAGENT_RUNTIME_VERSION])",
  ].join('\n')
  const preview = rewriteSubagentRuntime(source, { subagentRuntime: '0.2.1-alpha.1', updateStableReferences: false })
  assert.match(preview, /SUBAGENT_RUNTIME_VERSION = '0\.2\.0-rc\.2'/)
  assert.match(preview, /\['0\.2\.0-rc\.1', SUBAGENT_RUNTIME_VERSION, '0\.2\.1-alpha\.1'\]/)
  const stable = rewriteSubagentRuntime(preview, { subagentRuntime: '0.2.1', updateStableReferences: true })
  assert.match(stable, /SUBAGENT_RUNTIME_VERSION = '0\.2\.1'/)
  assert.match(stable, /\['0\.2\.0-rc\.1', '0\.2\.0-rc\.2', '0\.2\.1-alpha\.1', SUBAGENT_RUNTIME_VERSION\]/)
  assert.equal(rewriteSubagentRuntime(source, {}), source)
  assert.throws(() => rewriteSubagentRuntime('nothing here', { subagentRuntime: '1.0.0' }), /expected SUBAGENT_RUNTIME_VERSION/)
})

test('host inspection reads the release manifest and treats a missing subtask runtime as absent', async () => {
  const registry = {
    '@deepseek-ai/dsh@0.2.1-alpha.1': { version: '0.2.1-alpha.1', dependencies: { '@deepseek-ai/cordis': '~4.0.5-alpha.1' } },
    '@deepseek-ai/dsh-subagent-codex@0.2.1-alpha.1': { version: '0.2.1-alpha.1' },
    '@deepseek-ai/dsh@0.2.2': { version: '0.2.2', dependencies: { '@deepseek-ai/cordis': '~4.0.6' } },
  }
  const fetchManifest = async (name, version) => registry[`${name}@${version}`]
  assert.deepEqual(await hostOf('0.2.1-alpha.1', fetchManifest), { cordis: '4.0.5-alpha.1', subagentRuntime: '0.2.1-alpha.1' })
  assert.deepEqual(await hostOf('0.2.2', fetchManifest), { cordis: '4.0.6' })
  await assert.rejects(hostOf('9.9.9', fetchManifest), /Cannot inspect @deepseek-ai\/dsh@9\.9\.9/)
})

test('the real subagent runtime source can be rewritten', () => {
  const source = readFileSync(new URL('../src/subagent-runtime.js', import.meta.url), 'utf8')
  const next = rewriteSubagentRuntime(source, { subagentRuntime: '9.0.0-alpha.1', updateStableReferences: false })
  assert.match(next, /SUPPORTED_RUNTIME_VERSIONS = Object\.freeze\(\[[^\]]*'9\.0\.0-alpha\.1'\]\)/)
})
