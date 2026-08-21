import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8')

test('rebuilding the same GitHub Release does not fail on an already-published npm version', () => {
  assert.match(workflow, /Check whether npm version already exists/u)
  assert.match(workflow, /npm view "dsh-codex-subscription@\$version" version/u)
  assert.match(workflow, /needed=false/u)
  assert.match(workflow, /if: steps\.npm-version\.outputs\.needed == 'true'/u)
  assert.match(workflow, /npm publish \.\/\.release-artifact\/dsh-codex-subscription\.tgz --access public/u)
})
