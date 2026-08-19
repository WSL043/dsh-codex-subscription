import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const releaseWorkflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
const notesWorkflow = readFileSync(new URL('../.github/workflows/release-notes.yml', import.meta.url), 'utf8')

test('GitHub Releases always include beginner-facing install, update, and uninstall instructions', () => {
  assert.match(releaseWorkflow, /<!-- dsh-codex-install -->/u)
  assert.match(releaseWorkflow, /## 安装 \/ Install/u)
  assert.match(releaseWorkflow, /releases\/latest\/download\/dsh-codex-setup\.ps1/u)
  assert.match(releaseWorkflow, /dsh-codex update/u)
  assert.match(releaseWorkflow, /dsh-codex uninstall/u)
  assert.match(notesWorkflow, /gh release edit/u)
  assert.match(notesWorkflow, /--notes-file/u)
})

test('a new Release is created only from an explicit tag pointing at the validated commit', () => {
  assert.match(releaseWorkflow, /Point release tag at the validated commit/u)
  assert.match(releaseWorkflow, /git ls-remote --exit-code --tags origin/u)
  assert.match(releaseWorkflow, /git tag -f "\$RELEASE_TAG" "\$TARGET_SHA"/u)
  assert.match(releaseWorkflow, /git push origin "refs\/tags\/\$RELEASE_TAG"/u)
  assert.match(releaseWorkflow, /--verify-tag/u)
  assert.match(releaseWorkflow, /--notes "\$\(cat \.release\/install\.md\)"/u)
  assert.match(releaseWorkflow, /--generate-notes/u)
  assert.match(releaseWorkflow, /git push origin ":refs\/tags\/\$RELEASE_TAG" \|\| true/u)
  assert.doesNotMatch(releaseWorkflow, /releases\/generate-notes/u)
})
