import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compareVersions,
  extractDeepSeekReleaseAgeSelectors,
  planCompatibilityUpdate,
  rewriteBoundedVersions,
  rewriteReleaseAgeCohort,
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

test('queues the oldest untested official registry version', () => {
  const versions = ['0.1.1-rc.2', '0.1.0-rc.8', '0.1.1-rc.1']
  assert.equal(selectNextUntestedVersion(versions, '0.1.0-rc.8'), '0.1.1-rc.1')
  assert.equal(selectNextUntestedVersion(versions, '0.1.1-rc.2'), null)
  assert.ok(compareVersions('0.1.1-rc.1', '0.1.0-rc.8') > 0)
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
