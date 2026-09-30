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

test('the mirror sync waits for the npm dist-tag and can never fail a published release', () => {
  const job = workflow.slice(workflow.indexOf('  sync-mirror:'))
  assert.match(job, /needs: \[preflight, publish-npm\]/)
  assert.match(job, /continue-on-error: true/)
  assert.match(job, /dist-tags\.\$NPM_TAG/)
  assert.match(job, /registry-direct\.npmmirror\.com\/-\/package\/dsh-codex-subscription\/syncs/)
  assert.ok(job.indexOf('dist-tags') < job.indexOf('npmmirror'), 'sync only after the tag is visible')
})
