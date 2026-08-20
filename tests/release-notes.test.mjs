import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const releaseWorkflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8')

test('GitHub Releases include beginner-facing install, update, and uninstall instructions before publish', () => {
  assert.match(releaseWorkflow, /<!-- dsh-codex-install -->/u)
  assert.match(releaseWorkflow, /## 安装 \/ Install/u)
  assert.match(releaseWorkflow, /releases\/latest\/download\/dsh-codex-setup\.ps1/u)
  assert.match(releaseWorkflow, /macOS、Linux，或已有 dsh \/ macOS, Linux, or an existing dsh command/u)
  assert.match(releaseWorkflow, /dsh plugin --profile web add dsh-codex-subscription/u)
  assert.match(releaseWorkflow, /dsh plugin --profile web update dsh-codex-subscription/u)
  assert.match(releaseWorkflow, /dsh plugin --profile web remove dsh-codex-subscription/u)
  assert.match(releaseWorkflow, /dsh-codex update/u)
  assert.match(releaseWorkflow, /dsh-codex uninstall/u)
  assert.equal(existsSync(new URL('../.github/workflows/release-notes.yml', import.meta.url)), false)
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
