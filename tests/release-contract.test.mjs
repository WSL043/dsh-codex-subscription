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
    'LICENSE',
    'SECURITY.md',
    'THIRD_PARTY_NOTICES.md',
    'docs/assets/*.png',
  ]) assert.equal(included.has(path), true, `package files must include ${path}`)
  assert.equal(pkg.version, '0.2.1')
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
  assert.match(guide, /## Install[\s\S]*dsh plugin --profile web add github:WSL043\/dsh-codex-subscription#v0\.2\.1/u)
  assert.match(guide, /## Update[\s\S]*dsh plugin --profile web add github:WSL043\/dsh-codex-subscription#v0\.2\.1/u)
  assert.match(guide, /dsh plugin --profile web list @wsl043\/dsh-codex-subscription --depth 0/u)
  assert.match(guide, /dsh --profile web --dump-config/u)
  assert.match(guide, /dsh plugin --profile web remove @wsl043\/dsh-codex-subscription/u)
  assert.match(guide, /do not.*delete.*profile|never delete.*profile|不要.*删除.*profile/iu)
  assert.doesNotMatch(guide, /autoInstallPeers|profiles\/node_modules|checked-out development|pnpm install/iu)
})

test('GitHub defaults to concise Chinese and directs Agents to their own guide', () => {
  const readme = text('README.md')
  assert.match(readme, /^# DSH Codex Subscription[\s\S]*\[English\]\(README\.en\.md\)/u)
  assert.match(readme, /使用 Agent 安装、更新或卸载时[\s\S]*读取[\s\S]*AGENTS\.md/u)
  assert.doesNotMatch(readme, /复制下面|提示词/u)
})

test('public readmes provide explicit update commands and verification', () => {
  const readmeZh = text('README.md')
  const readmeEn = text('README.en.md')
  assert.match(readmeZh, /## 更新[\s\S]*dsh plugin --profile web add github:WSL043\/dsh-codex-subscription#v0\.2\.1[\s\S]*dsh plugin --profile web list[\s\S]*dsh --profile web --dump-config/u)
  assert.match(readmeEn, /## Update[\s\S]*dsh plugin --profile web add github:WSL043\/dsh-codex-subscription#v0\.2\.1[\s\S]*dsh plugin --profile web list[\s\S]*dsh --profile web --dump-config/u)
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
  assert.match(workflow, /path:\s*\.artifacts\/\*\.tgz/u)
  assert.match(workflow, /include-hidden-files:\s*true/u)
})
