import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const releaseWorkflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8')

test('GitHub Releases include beginner-facing install, update, and uninstall instructions before publish', () => {
  assert.match(releaseWorkflow, /<!-- dsh-codex-install -->/u)
  assert.match(releaseWorkflow, /## Installation[\s\S]*## 中文[\s\S]*## 安装/u)
  assert.match(releaseWorkflow, /releases\/latest\/download\/dsh-codex-setup\.ps1/u)
  assert.match(releaseWorkflow, /### Official npm route[\s\S]*### 官方 npm 方式/u)
  assert.match(releaseWorkflow, /npx -y @deepseek-ai\/dsh@__DSH_VERSION__ plugin --profile web add dsh-codex-subscription/u)
  assert.match(releaseWorkflow, /dsh@__DSH_VERSION__ plugin --profile web update dsh-codex-subscription/u)
  assert.match(releaseWorkflow, /dsh@__DSH_VERSION__ plugin --profile web remove dsh-codex-subscription/u)
  assert.match(releaseWorkflow, /sed -i "s\/__DSH_VERSION__\/\$current_dsh\/g" \.release\/install\.md/u)
  assert.match(releaseWorkflow, /release-age rejection may retry the same pinned add once/u)
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
  assert.doesNotMatch(notesStep, /Fixed `codex_image_generate` for large Base64 PNG/u)
  assert.match(releaseWorkflow, /release_notes_en:[\s\S]*English user-facing release summary/u)
  assert.match(releaseWorkflow, /release_notes_zh:[\s\S]*Chinese user-facing release summary/u)
  assert.match(notesStep, /Feature and bugfix releases require explicit bilingual release notes/u)
})

test('feature releases credit merged contributor PRs with verified authors and links', () => {
  assert.match(releaseWorkflow, /contributor_prs:[\s\S]*merged contributor PR numbers/iu)
  assert.match(releaseWorkflow, /CONTRIBUTOR_PRS: \$\{\{ inputs\.contributor_prs \}\}/u)
  assert.match(releaseWorkflow, /gh pr view "\$pr_number"[\s\S]*author,mergedAt,number,url/u)
  assert.match(releaseWorkflow, /test "\$merged_at" != 'null'/u)
  assert.match(releaseWorkflow, /Thanks to \[@\$author\][\s\S]*for contributing in \[#\$number\]/u)
})

test('bug-fix releases can credit verified issue reporters', () => {
  assert.match(releaseWorkflow, /reported_issues:[\s\S]*issue numbers to credit/iu)
  assert.match(releaseWorkflow, /REPORTED_ISSUES: \$\{\{ inputs\.reported_issues \}\}/u)
  assert.match(releaseWorkflow, /gh issue view "\$issue_number"[\s\S]*author,number,url/u)
  assert.match(releaseWorkflow, /Thanks to \[@\$author\][\s\S]*for reporting \[#\$number\]/u)
})

test('release notes present complete English before a separate Chinese translation', () => {
  const notesStart = releaseWorkflow.indexOf('- name: Prepare beginner-facing release notes')
  const notesEnd = releaseWorkflow.indexOf('- name: Build immutable release assets')
  const notesStep = releaseWorkflow.slice(notesStart, notesEnd)

  assert.match(notesStep, /## What's new[\s\S]*## Installation[\s\S]*## 中文[\s\S]*## 更新内容[\s\S]*## 安装/u)
  assert.doesNotMatch(notesStep, /^## .* \/ .*$/mu)
  assert.doesNotMatch(notesStep, /提交贡献 \/ Thanks to/u)
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
