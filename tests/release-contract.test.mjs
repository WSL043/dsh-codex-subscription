import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const text = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('release is a prebuilt, documented, removable DSH bundle', () => {
  const pkg = JSON.parse(text('package.json'))
  const included = new Set(pkg.files)
  for (const path of [
    'lib/*.js',
    'cordis.patch.yml',
    'README.md',
    'README.en.md',
    'AGENTS.md',
    'dsh-codex.ps1',
    'LICENSE',
    'SECURITY.md',
    'THIRD_PARTY_NOTICES.md',
    'docs/assets/*.png',
  ]) assert.equal(included.has(path), true, `package files must include ${path}`)
  assert.equal(pkg.name, 'dsh-codex-subscription')
  assert.equal(pkg.version, '0.2.5')
  assert.equal('prepare' in pkg.scripts, false, 'GitHub installs use committed build output')
  assert.equal(pkg.dependencies?.['@earendil-works/pi-ai'], undefined)
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-llm-pi-ai'], '0.1.0-rc.6')
  assert.equal(pkg.peerDependencies['@earendil-works/pi-ai'], '0.82.1')
  assert.equal(pkg.packageManager, 'pnpm@11.19.0')
  assert.equal(existsSync(new URL('../lib/index.js', import.meta.url)), true)
  assert.equal(existsSync(new URL('../lib/client.js', import.meta.url)), true)
  assert.equal(existsSync(new URL('../lib/boundary.js', import.meta.url)), false)
  assert.equal(existsSync(new URL('../CHANGELOG.md', import.meta.url)), false)
  assert.equal(existsSync(new URL('../docs/ARCHITECTURE.md', import.meta.url)), false)
  assert.equal(existsSync(new URL('../.github/workflows/ci.yml', import.meta.url)), true)
})

test('public docs contain only user-facing product and operation information', () => {
  const docs = `${text('README.md')}\n${text('README.en.md')}`
  assert.match(docs, /silent fallback[\s\S]*paid route|不会静默切换[\s\S]*付费路由/iu)
  assert.match(docs, /reset time|重置时间/iu)
  assert.match(docs, /AGENTS\.md/u)
  assert.doesNotMatch(docs, /prompt_cache_key|previous_response_id|backend-api|autoInstallPeers|profiles\/node_modules/iu)
  assert.doesNotMatch(docs, /github\.com\/WSL043\/(?!dsh-codex-subscription(?:[\/)#]|$))[\w.-]+/iu)
  assert.doesNotMatch(docs, /安装提示词|更新提示词|卸载提示词|install prompt|update prompt|uninstall prompt/iu)
  assert.doesNotMatch(docs, /开发与验收|development and verification|pnpm test|pnpm run build|测试覆盖|release-contract|28 项/iu)
  assert.equal(existsSync(new URL('../docs/CACHE.md', import.meta.url)), false)
})

test('shipped agent guide owns install, pinned update, verification, and uninstall', () => {
  const guide = text('AGENTS.md')
  assert.match(guide, /releases\/download\/v0\.2\.5\/dsh-codex\.ps1/u)
  assert.match(guide, /dsh-codex\.ps1" Install/u)
  assert.match(guide, /dsh-codex update/u)
  assert.match(guide, /dsh-codex uninstall/u)
  assert.match(guide, /DSH-Portable[\s\S]*system Node\.js or pnpm[\s\S]*per-user[\s\S]*never modifies[\s\S]*machine PATH/iu)
  assert.match(guide, /dsh plugin --profile web add https:\/\/github\.com\/WSL043\/dsh-codex-subscription\/releases\/download\/v0\.2\.5\/dsh-codex-subscription\.tgz/u)
  assert.match(guide, /dsh plugin --profile web list dsh-codex-subscription --depth 0/u)
  assert.match(guide, /dsh --profile web --dump-config/u)
  assert.match(guide, /dsh plugin --profile web remove dsh-codex-subscription/u)
  assert.match(guide, /curl\.exe -fL[\s\S]*-o "\$env:TEMP\\dsh-codex\.ps1"[\s\S]*-ExecutionPolicy Bypass -File/iu)
  assert.doesNotMatch(guide, /dsh-codex\.ps1\?/u)
  assert.doesNotMatch(guide, /scriptblock|Invoke-Expression|\biex\b/iu)
  assert.match(guide, /do not.*delete.*profile|never delete.*profile|不要.*删除.*profile/iu)
  assert.doesNotMatch(guide, /autoInstallPeers|profiles\/node_modules|checked-out development|pnpm install/iu)
})

test('GitHub defaults to concise Chinese and directs Agents to their own guide', () => {
  const readme = text('README.md')
  const readmeEn = text('README.en.md')
  assert.match(readme, /^# DSH Codex Subscription[\s\S]*\[English\]\(README\.en\.md\)/u)
  assert.match(readme, /## 安装[\s\S]*### 让 Agent 安装（不熟悉命令行时推荐）[\s\S]*https:\/\/raw\.githubusercontent\.com\/WSL043\/dsh-codex-subscription\/main\/AGENTS\.md[\s\S]*### Windows 手动安装/u)
  assert.match(readmeEn, /## Install[\s\S]*### Let an Agent install it[\s\S]*https:\/\/raw\.githubusercontent\.com\/WSL043\/dsh-codex-subscription\/main\/AGENTS\.md[\s\S]*### Manual Windows install/u)
  assert.match(readme, /依次粘贴下面两行/u)
  assert.match(readmeEn, /paste these two lines in order/u)
  assert.doesNotMatch(`${readme}\n${readmeEn}`, /下面三行|three lines/iu)
  assert.doesNotMatch(readme, /复制下面|提示词/u)
})

test('public readmes provide explicit update commands and verification', () => {
  const readmeZh = text('README.md')
  const readmeEn = text('README.en.md')
  assert.match(readmeZh, /## 更新[\s\S]*dsh-codex update[\s\S]*dsh plugin --profile web add https:\/\/github\.com\/WSL043\/dsh-codex-subscription\/releases\/download\/v0\.2\.5\/[\s\S]*dsh plugin --profile web list[\s\S]*dsh --profile web --dump-config/u)
  assert.match(readmeEn, /## Update[\s\S]*dsh-codex update[\s\S]*dsh plugin --profile web add https:\/\/github\.com\/WSL043\/dsh-codex-subscription\/releases\/download\/v0\.2\.5\/[\s\S]*dsh plugin --profile web list[\s\S]*dsh --profile web --dump-config/u)
  assert.match(readmeZh, /## 卸载[\s\S]*dsh-codex uninstall/u)
  assert.match(readmeEn, /## Uninstall[\s\S]*dsh-codex uninstall/u)
  for (const readme of [readmeZh, readmeEn]) {
    assert.match(readme, /releases\/latest\/download\/dsh-codex\.ps1/u)
    assert.doesNotMatch(readme, /dsh-codex\.ps1\?/u)
    assert.match(readme, /curl\.exe -fL[\s\S]*-o "\$env:TEMP\\dsh-codex\.ps1"[\s\S]*-ExecutionPolicy Bypass -File/iu)
    assert.doesNotMatch(readme, /Invoke-WebRequest/iu)
    assert.doesNotMatch(readme, /scriptblock|Invoke-Expression|\biex\b/iu)
  }
})

test('Windows manager updates from a checksum-verified immutable release asset', () => {
  const manager = text('dsh-codex.ps1')
  assert.match(manager, /api\.github\.com\/repos\/WSL043\/dsh-codex-subscription\/releases\/latest/u)
  assert.match(manager, /dsh-codex\.ps1\.sha256/u)
  assert.match(manager, /Get-FileDigest -Algorithm SHA256/u)
  assert.doesNotMatch(manager, /Invoke-Expression|\biex\b/iu)
})

test('per-user command PATH changes notify the Windows shell', () => {
  const manager = text('dsh-codex.ps1')
  const workflow = text('.github/workflows/ci.yml')
  assert.match(manager, /SetEnvironmentVariable\('Path',[\s\S]*'User'\)/u)
  assert.match(manager, /SendMessageTimeout/u)
  assert.match(manager, /WM_SETTINGCHANGE|0x001A/u)
  assert.match(workflow, /os: \[windows-2022, windows-2025\]/u)
  assert.match(workflow, /DSH_CODEX_TEST_USER_PATH:\s*'1'/u)
})

test('uninstall never recursively deletes a caller-selected command directory', () => {
  const manager = text('dsh-codex.ps1')
  const removal = manager.slice(
    manager.indexOf('function Remove-ManagerCommand'),
    manager.indexOf('function Install-ManagerCommand'),
  )
  assert.doesNotMatch(removal, /Remove-Item -LiteralPath \$Directory -Recurse/u)
})

test('docs explain dynamic quota buckets without exposing maintenance internals', () => {
  const agent = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8')
  const readmeZh = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const readmeEn = readFileSync(new URL('../README.en.md', import.meta.url), 'utf8')
  for (const text of [readmeZh, readmeEn]) {
    assert.match(text, /Spark/u)
    assert.match(text, /backend-provided|actual.*returned|服务端实际返回/iu)
  }
  assert.match(agent, /peers check/u)
})

test('release-age exceptions are pinned to the audited DeepSeek preview graph', () => {
  const workspace = text('pnpm-workspace.yaml')
  const lockfile = text('pnpm-lock.yaml')
  const packagesBlock = lockfile.slice(lockfile.indexOf('\npackages:\n'), lockfile.indexOf('\nsnapshots:\n'))
  const deepseekPackages = [...packagesBlock.matchAll(/^  '(@deepseek-ai\/[^']+@[^']+)':$/gmu)].map(match => match[1])
  assert.equal(deepseekPackages.length, 58)
  assert.match(workspace, /minimumReleaseAge:\s*1440/u)
  assert.doesNotMatch(workspace, /@deepseek-ai\/\*/u)
  for (const selector of deepseekPackages) {
    assert.equal(workspace.includes(`- '${selector}'`), true, `missing exact release-age exception for ${selector}`)
  }
})

test('CI uploads the hidden release artifact only after asserting it exists', () => {
  const workflow = text('.github/workflows/ci.yml')
  assert.match(workflow, /find \.artifacts[^\n]*-name '\*\.tgz'/u)
  assert.match(workflow, /test -s "\$artifact"/u)
  assert.match(workflow, /path:\s*\|[\s\S]*\.artifacts\/\*\.tgz/u)
  assert.match(workflow, /include-hidden-files:\s*true/u)
  assert.match(workflow, /sha256sum dsh-codex\.ps1/u)
  assert.match(workflow, /\.artifacts\/dsh-codex\.ps1\.sha256/u)
})
