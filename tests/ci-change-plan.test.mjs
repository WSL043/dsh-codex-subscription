import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

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

test('documentation changes run delivery checks without pretending runtime changed', () => {
  const result = plan(['README.md'])
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.deepEqual(output.plan, {
    behavior: false,
    delivery: true,
    installer: false,
    official: false,
    runtime: false,
  })
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
  assert.equal(output.plan.official, true)
  assert.equal(output.plan.runtime, true)
})
