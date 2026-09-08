import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { testFiles } from '../scripts/test-groups.mjs'

const script = fileURLToPath(new URL('../scripts/ci-change-plan.mjs', import.meta.url))

function plan(files, packageVersion = '1.10.0', publishedVersion = '1.10.0') {
  return spawnSync(process.execPath, [
    script,
    '--base', 'HEAD',
    '--files', files.join(','),
    '--package-version', packageVersion,
    '--published', publishedVersion,
  ], { encoding: 'utf8' })
}

test('documentation and marketplace screenshot changes run delivery checks without pretending runtime changed', () => {
  for (const file of ['README.md', 'README.en.md', 'README.zh-CN.md', 'CONTRIBUTING.md', 'screenshots.json']) {
    const result = plan([file])
    assert.equal(result.status, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.deepEqual(output.plan, {
      behavior: false,
      delivery: true,
      manager: false,
      official: false,
      runtime: false,
    }, file)
  }
})

test('previously omitted suites and future behavior tests reach their CI gate', () => {
  for (const file of ['account-status-controller', 'account-vault', 'context-draft-state', 'image-original-store', 'preference-controller', 'quota-forecast', 'quota-forecast-store', 'subscription-image-viewer', 'future-behavior']) {
    const result = plan([`tests/${file}.test.mjs`])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).plan.behavior, true, file)
    if (file !== 'future-behavior') assert.ok(testFiles('behavior').includes(`tests/${file}.test.mjs`), file)
  }
  const viewerContract = plan(['tests/subscription-image-viewer-contract.test.mjs'])
  assert.equal(JSON.parse(viewerContract.stdout).plan.delivery, true)
  assert.ok(testFiles('delivery').includes('tests/subscription-image-viewer-contract.test.mjs'))
})

test('test dispatch changes exercise all CI gates', () => {
  for (const file of ['scripts/test-groups.mjs', 'scripts/run-tests.mjs', '.github/scripts/accept-official-release.ps1', '.github/scripts/test-official-runtime.mjs']) {
    const result = plan([file])
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout).plan, {
      behavior: true, delivery: true, manager: true, official: true, runtime: false,
    })
  }
})

test('runtime changes cannot remain on the already-published version', () => {
  const result = plan(['src/index.js'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /package\.json is still 1\.10\.0/u)
})

test('a versioned runtime change runs behavior and installed-product acceptance', () => {
  const result = plan(['src/index.js'], '1.11.0')
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.plan.behavior, true)
  assert.equal(output.plan.delivery, true)
  assert.equal(output.plan.official, true)
  assert.equal(output.plan.runtime, true)
})
