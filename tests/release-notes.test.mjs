import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const releaseWorkflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8')
const compatibility = JSON.parse(readFileSync(new URL('../compatibility.json', import.meta.url), 'utf8'))

test('GitHub Releases include beginner-facing install, update, and uninstall instructions before publish', () => {
  assert.match(releaseWorkflow, /<!-- dsh-codex-install -->/u)
  assert.match(releaseWorkflow, /## 安装 \/ Install/u)
  assert.match(releaseWorkflow, /releases\/latest\/download\/dsh-codex-setup\.ps1/u)
  assert.match(releaseWorkflow, /官方 npm 方式 \/ Official npm route/u)
  assert.equal(releaseWorkflow.includes(`npx -y @deepseek-ai/dsh@${compatibility.latestTested} plugin --profile web add dsh-codex-subscription`), true)
  assert.equal(releaseWorkflow.includes(`dsh@${compatibility.latestTested} plugin --profile web update dsh-codex-subscription`), true)
  assert.equal(releaseWorkflow.includes(`dsh@${compatibility.latestTested} plugin --profile web remove dsh-codex-subscription`), true)
  assert.match(releaseWorkflow, /runs `plugin add` once/u)
  assert.match(releaseWorkflow, /release_kind:[\s\S]*compatibility/u)
  assert.match(releaseWorkflow, /Added support for DeepSeek Harness/u)
  assert.equal(existsSync(new URL('../.github/workflows/release-notes.yml', import.meta.url)), false)
})

test('GitHub Release notes stay user-facing and exclude internal maintenance evidence', () => {
  const notesStart = releaseWorkflow.indexOf('- name: Prepare beginner-facing release notes')
  const notesEnd = releaseWorkflow.indexOf('- name: Build immutable release assets')
  assert.ok(notesStart >= 0 && notesEnd > notesStart, 'publish workflow must define a bounded release-notes step')
  const notesStep = releaseWorkflow.slice(notesStart, notesEnd)
  assert.doesNotMatch(
    notesStep,
    /GitHub Actions|每\s*6\s*小时|every six hours|隔离验收|isolated .*acceptance|smoke acceptance|fail[- ]closed|自动兼容|compatibility autopilot/iu,
  )
  assert.match(notesStep, /Added support for DeepSeek Harness/u)
})

test('immutable releases are drafted, verified with all four assets, then published', () => {
  assert.match(releaseWorkflow, /Create draft GitHub Release/u)
  assert.match(releaseWorkflow, /gh release create "\$RELEASE_TAG"/u)
  assert.match(releaseWorkflow, /--draft/u)
  assert.match(releaseWorkflow, /--target "\$TARGET_SHA"/u)
  assert.match(releaseWorkflow, /--notes-file \.release\/install\.md/u)
  assert.doesNotMatch(releaseWorkflow, /--generate-notes/u)
  assert.match(releaseWorkflow, /Upload draft release assets/u)
  assert.match(releaseWorkflow, /gh release upload "\$RELEASE_TAG"/u)
  for (const asset of [
    'dsh-codex-subscription.tgz',
    'dsh-codex.ps1',
    'dsh-codex.ps1.sha256',
    'dsh-codex-setup.ps1',
  ]) assert.match(releaseWorkflow, new RegExp(asset.replaceAll('.', '\\.')))
  assert.match(releaseWorkflow, /Verify draft release before publish/u)
  assert.match(releaseWorkflow, /gh release view "\$RELEASE_TAG"[\s\S]*isDraft[\s\S]*assets/u)
  assert.match(releaseWorkflow, /Publish immutable GitHub Release/u)
  assert.match(releaseWorkflow, /gh release edit "\$RELEASE_TAG"[\s\S]*--draft=false/u)
  assert.match(releaseWorkflow, /gh release delete[\s\S]*--cleanup-tag/u)
})
