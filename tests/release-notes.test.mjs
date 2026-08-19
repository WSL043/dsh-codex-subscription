import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')

test('GitHub Releases always include beginner-facing install, update, and uninstall instructions', () => {
  assert.match(workflow, /<!-- dsh-codex-install -->/u)
  assert.match(workflow, /## 安装 \/ Install/u)
  assert.match(workflow, /releases\/latest\/download\/dsh-codex-setup\.ps1/u)
  assert.match(workflow, /dsh-codex update/u)
  assert.match(workflow, /dsh-codex uninstall/u)
  assert.match(workflow, /releases\/generate-notes/u)
  assert.match(workflow, /gh release edit/u)
  assert.match(workflow, /--notes-file \.release\/release-notes\.md/u)
})
