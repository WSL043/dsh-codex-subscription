import assert from 'node:assert/strict'
import test from 'node:test'

import {
  boundedArtifactPaths,
  compareVersions,
  extractDeepSeekReleaseAgeSelectors,
  planCompatibilityUpdate,
  rewriteBoundedVersions,
  rewriteReleaseAgeCohort,
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
