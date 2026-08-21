import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const text = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const manifest = JSON.parse(text('package.json'))
const compatibility = JSON.parse(text('compatibility.json'))

test('release is a prebuilt, documented, removable DSH bundle', () => {
  const pkg = JSON.parse(text('package.json'))
  const included = new Set(pkg.files)
  for (const path of [
    'lib/*.js',
    'cordis.patch.yml',
    'README.md',
    'README.en.md',
    'AGENTS.md',
    'compatibility.json',
    'LICENSE',
    'SECURITY.md',
    'THIRD_PARTY_NOTICES.md',
    'docs/assets/*.png',
  ]) assert.equal(included.has(path), true, `package files must include ${path}`)
  assert.equal(pkg.name, 'dsh-codex-subscription')
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/u)
  assert.equal(pkg.homepage, 'https://github.com/WSL043/dsh-codex-subscription')
  assert.equal('prepare' in pkg.scripts, false, 'GitHub installs use committed build output')
  assert.equal(pkg.dependencies?.['@earendil-works/pi-ai'], undefined)
  const supportedDshReleases = compatibility.supported.join(' || ')
  for (const [name, version] of Object.entries(pkg.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(version, supportedDshReleases, name)
  }
  assert.equal(pkg.devDependencies['@deepseek-ai/dsh-llm-pi-ai'], compatibility.latestTested)
  assert.equal(pkg.devDependencies['@deepseek-ai/dsh-api-remotes'], compatibility.latestTested)
  assert.equal(pkg.devDependencies['@deepseek-ai/dsh-client-ui-attachment'], undefined)
  assert.equal(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-api-remotes'), true)
  assert.equal(pkg.peerDependencies['@earendil-works/pi-ai'], '0.82.1')
  assert.equal(pkg.packageManager, 'pnpm@11.19.0')
  assert.equal(existsSync(new URL('../lib/index.js', import.meta.url)), true)
  assert.equal(existsSync(new URL('../lib/client.js', import.meta.url)), true)
  assert.equal(existsSync(new URL('../lib/boundary.js', import.meta.url)), false)
  assert.equal(existsSync(new URL('../CHANGELOG.md', import.meta.url)), false)
  assert.equal(existsSync(new URL('../docs/ARCHITECTURE.md', import.meta.url)), false)
  assert.equal(existsSync(new URL('../.github/workflows/ci.yml', import.meta.url)), true)
  assert.equal(existsSync(new URL('../.github/workflows/release.yml', import.meta.url)), false)
  assert.equal(existsSync(new URL('../.github/workflows/publish.yml', import.meta.url)), true)
})

test('public docs contain only user-facing product and operation information', () => {
  const docs = `${text('README.md')}\n${text('README.en.md')}`
  assert.match(docs, /silent fallback[\s\S]*paid route|不会静默切换[\s\S]*付费路由/iu)
  assert.match(docs, /reset time|重置时间/iu)
  assert.match(docs, /AGENTS\.md/u)
  assert.doesNotMatch(docs, /prompt_cache_key|previous_response_id|backend-api|autoInstallPeers|profiles\/node_modules/iu)
  assert.doesNotMatch(docs, /github\.com\/WSL043\/(?!(?:dsh-codex-subscription|DSH-Portable)(?:[\/)#]|$))[\w.-]+/iu)
  assert.doesNotMatch(docs, /安装提示词|更新提示词|卸载提示词|install prompt|update prompt|uninstall prompt/iu)
  assert.doesNotMatch(docs, /开发与验收|development and verification|pnpm test|pnpm run build|测试覆盖|release-contract|28 项/iu)
  assert.equal(docs.includes(compatibility.latestTested), true)
  assert.doesNotMatch(docs, /0\.1\.0-rc\.(?:6|7)|v0\.2\.1|1\.1\.0-beta\.0/iu)
  assert.equal(existsSync(new URL('../docs/CACHE.md', import.meta.url)), false)
})

test('shipped agent guide owns install, pinned update, verification, and uninstall', () => {
  const guide = text('AGENTS.md')
  assert.equal(guide.includes(`dsh plugin --profile web add dsh-codex-subscription@${manifest.version}`), true)
  assert.equal(guide.includes(`.\\dsh.exe plugin --profile web add dsh-codex-subscription@${manifest.version}`), true)
  assert.equal(guide.includes(`npx -y @deepseek-ai/dsh@${compatibility.latestTested} plugin --profile web add dsh-codex-subscription@${manifest.version}`), true)
  assert.match(guide, /dsh plugin --profile web list dsh-codex-subscription --depth 0/u)
  assert.match(guide, /dsh --profile web --dump-config/u)
  assert.match(guide, /dsh plugin --profile web remove dsh-codex-subscription/u)
  assert.doesNotMatch(guide, /scriptblock|Invoke-Expression|\biex\b/iu)
  assert.match(guide, /do not.*wipe.*profile|preserve the DSH profile/iu)
  assert.doesNotMatch(guide, /autoInstallPeers|profiles\/node_modules|checked-out development|pnpm install/iu)
  assert.match(guide, /Do not[\s\S]*add a resident manager/iu)
})

test('GitHub defaults to concise Chinese and directs Agents to their own guide', () => {
  const readme = text('README.md')
  const readmeEn = text('README.en.md')
  assert.match(readme, /^# DSH Codex Subscription[\s\S]*在 DeepSeek Harness 中直接登录 ChatGPT/u)
  assert.match(readme, /\[English\]\(https:\/\/github\.com\/WSL043\/dsh-codex-subscription\/blob\/main\/README\.en\.md\)/u)
  assert.match(readmeEn, /\[简体中文\]\(https:\/\/github\.com\/WSL043\/dsh-codex-subscription\/blob\/main\/README\.md\)/u)
  for (const doc of [readme, readmeEn]) {
    assert.match(doc, /img\.shields\.io\/npm\/v\/dsh-codex-subscription/u)
    assert.match(doc, /npmjs\.com\/package\/dsh-codex-subscription/u)
  }
  assert.match(readme, /## 准备 DSH[\s\S]*DSH-Portable[\s\S]*社区桌面分发[\s\S]*便携版和安装版[\s\S]*github\.com\/deepseek-ai\/deepseek-harness#run[\s\S]*## 安装[\s\S]*### 交给 Agent（推荐）[\s\S]*https:\/\/raw\.githubusercontent\.com\/WSL043\/dsh-codex-subscription\/main\/AGENTS\.md[\s\S]*### Windows 手动安装/u)
  assert.match(readmeEn, /## Prepare DSH[\s\S]*DSH-Portable[\s\S]*community desktop distribution[\s\S]*portable and installed editions[\s\S]*github\.com\/deepseek-ai\/deepseek-harness#run[\s\S]*## Install[\s\S]*### Let an Agent install it \(recommended\)[\s\S]*https:\/\/raw\.githubusercontent\.com\/WSL043\/dsh-codex-subscription\/main\/AGENTS\.md[\s\S]*### Manual Windows install/u)
  assert.doesNotMatch(`${readme}\n${readmeEn}`, /社区便携包|community DSH-Portable package/iu)
  assert.match(readme, /本项目的问题反馈[\s\S]*github\.com\/WSL043\/dsh-codex-subscription\/issues[\s\S]*github\.com\/deepseek-ai\/deepseek-harness\/discussions/u)
  assert.match(readmeEn, /project feedback[\s\S]*github\.com\/deepseek-ai\/deepseek-harness\/discussions/u)
  assert.match(readme, /只需要复制这一行/u)
  assert.match(readmeEn, /paste this one line/u)
  assert.doesNotMatch(`${readme}\n${readmeEn}`, /依次粘贴下面两行|paste these two lines in order|下面三行|three lines/iu)
  assert.match(readme, /releases\/latest\/download\/dsh-codex-setup\.ps1/u)
  assert.match(readmeEn, /releases\/latest\/download\/dsh-codex-setup\.ps1/u)
  assert.doesNotMatch(readme, /提示词/u)
  assert.match(readme, /https:\/\/raw\.githubusercontent\.com\/WSL043\/dsh-codex-subscription\/main\/docs\/assets\/settings\.png/u)
  assert.match(readmeEn, /https:\/\/raw\.githubusercontent\.com\/WSL043\/dsh-codex-subscription\/main\/docs\/assets\/settings-en\.png/u)
  assert.match(readme, /raw\.githubusercontent\.com\/WSL043\/dsh-codex-subscription\/main\/docs\/assets\/composer-quota-en\.png/u)
  for (const doc of [readme, readmeEn]) {
    for (const match of doc.matchAll(/raw\.githubusercontent\.com\/WSL043\/dsh-codex-subscription\/main\/docs\/assets\/([^\s)]+\.png)/gu)) {
      const asset = match[1]
      assert.equal(existsSync(new URL(`../docs/assets/${asset}`, import.meta.url)), true, `documented release image must exist: ${asset}`)
      assert.doesNotMatch(doc, /releases\/latest\/download\/[^\s)]+\.png/u)
    }
  }
  assert.doesNotMatch(readme, /docs\/assets\/sidebar\.png/u)
  assert.doesNotMatch(readmeEn, /docs\/assets\/sidebar-en\.png/u)
  for (const asset of ['settings.png', 'settings-en.png']) {
    const png = readFileSync(new URL(`../docs/assets/${asset}`, import.meta.url))
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  }
  assert.equal(existsSync(new URL('../docs/assets/sidebar.png', import.meta.url)), false)
  assert.equal(existsSync(new URL('../docs/assets/sidebar-en.png', import.meta.url)), false)
})

test('each README stays in one language and links to the complete translation', () => {
  const readme = text('README.md')
  const readmeEn = text('README.en.md')
  assert.doesNotMatch(readme, /^## English$/mu)
  assert.doesNotMatch(readmeEn, /^## (?:简体中文|中文)$/mu)
  assert.match(readme, /README\.en\.md/u)
  assert.match(readmeEn, /README\.md/u)
})

test('public readmes provide explicit update commands and verification', () => {
  const readmeZh = text('README.md')
  const readmeEn = text('README.en.md')
  assert.match(readmeZh, /## 更新与卸载[\s\S]*dsh plugin --profile web update dsh-codex-subscription[\s\S]*dsh plugin --profile web list[\s\S]*dsh --profile web --dump-config[\s\S]*dsh plugin --profile web remove dsh-codex-subscription/u)
  assert.match(readmeEn, /## Update and uninstall[\s\S]*dsh plugin --profile web update dsh-codex-subscription[\s\S]*dsh plugin --profile web list[\s\S]*dsh --profile web --dump-config[\s\S]*dsh plugin --profile web remove dsh-codex-subscription/u)
  assert.match(readmeZh, /dsh plugin --profile web add dsh-codex-subscription/u)
  assert.match(readmeEn, /dsh plugin --profile web add dsh-codex-subscription/u)
  for (const readme of [readmeZh, readmeEn]) {
    assert.equal(readme.includes(`npx -y @deepseek-ai/dsh@${compatibility.latestTested} plugin --profile web add dsh-codex-subscription`), true)
    assert.equal(readme.includes(`npx -y @deepseek-ai/dsh@${compatibility.latestTested} plugin --profile web list dsh-codex-subscription --depth 0`), true)
    assert.equal(readme.includes(`npx -y @deepseek-ai/dsh@${compatibility.latestTested} --profile web --dump-config`), true)
  }
  for (const readme of [readmeZh, readmeEn]) {
    assert.match(readme, /releases\/latest\/download\/dsh-codex-setup\.ps1/u)
    assert.doesNotMatch(readme, /Invoke-WebRequest/iu)
    assert.doesNotMatch(readme, /scriptblock|Invoke-Expression/iu)
    assert.match(readme, /\birm\b[\s\S]*\biex\b/iu)
  }
})

test('Windows manager updates from a checksum-verified immutable release asset', () => {
  const manager = text('dsh-codex.ps1')
  assert.equal(manager.includes(`$PackageVersion = '${manifest.version}'`), true)
  assert.equal(manager.includes(`$PackageSpec = 'dsh-codex-subscription@${manifest.version}'`), true)
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
  assert.match(agent, /Codex subscription/u)
})

test('release-age exceptions are pinned to the audited DeepSeek preview graph', () => {
  const workspace = text('pnpm-workspace.yaml')
  const lockfile = text('pnpm-lock.yaml')
  const packagesBlock = lockfile.slice(lockfile.indexOf('\npackages:\n'), lockfile.indexOf('\nsnapshots:\n'))
  const deepseekPackages = [...packagesBlock.matchAll(/^  '(@deepseek-ai\/[^']+@[^']+)':$/gmu)].map(match => match[1])
  assert.ok(deepseekPackages.length > 0)
  assert.match(workspace, /minimumReleaseAge:\s*1440/u)
  assert.match(workspace, /# dsh-compat-release-age-start[\s\S]*# dsh-compat-release-age-end/u)
  assert.equal(workspace.includes(`'@deepseek-ai/dsh@${compatibility.latestTested}'`), true)
  assert.doesNotMatch(workspace, /@deepseek-ai\/\*/u)
  for (const selector of deepseekPackages) {
    assert.equal(workspace.includes(`- '${selector}'`), true, `missing exact release-age exception for ${selector}`)
  }
})

test('official DSH compatibility updates are detected, accepted, and then dispatched to the trusted publisher', () => {
  const workflow = text('.github/workflows/upstream-compatibility.yml')
  assert.match(workflow, /cron:\s*'29 \*\/6 \* \* \*'/u)
  assert.match(workflow, /compareVersions[\s\S]*for version in "\$\{candidates\[@\]\}"/u)
  assert.match(workflow, /repos\/deepseek-ai\/deepseek-harness\/releases\/tags\/dsh-v/u)
  assert.match(workflow, /\.draft == false and \.immutable == true/u)
  assert.match(workflow, /prepare-compat-release\.mjs --refresh-release-age/u)
  assert.match(workflow, /windows-acceptance:[\s\S]*accept-official-release\.ps1/u)
  assert.match(workflow, /git diff --binary \| sha256sum/u)
  assert.match(workflow, /test "\$\(git rev-parse origin\/main\)" = "\$GITHUB_SHA"/u)
  assert.match(workflow, /git push origin HEAD:main[\s\S]*gh workflow run publish\.yml/u)
  assert.match(workflow, /release_kind=compatibility/u)
  assert.match(workflow, /request_id="compat-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/u)
  assert.match(workflow, /gh run watch "\$release_run"[\s\S]*--exit-status/u)
  assert.doesNotMatch(workflow, /continue-on-error:\s*true|NODE_AUTH_TOKEN|NPM_TOKEN/iu)
})

test('CI uploads the hidden release artifact only after asserting it exists', () => {
  const workflow = text('.github/workflows/ci.yml')
  assert.match(workflow, /actions\/checkout@v6/u)
  assert.match(workflow, /pnpm\/action-setup@v5/u)
  assert.match(workflow, /actions\/setup-node@v6/u)
  assert.match(workflow, /actions\/upload-artifact@v7/u)
  assert.match(workflow, /find \.artifacts[^\n]*-name '\*\.tgz'/u)
  assert.match(workflow, /test -s "\$artifact"/u)
  assert.match(workflow, /path:\s*\|[\s\S]*\.artifacts\/\*\.tgz/u)
  assert.match(workflow, /include-hidden-files:\s*true/u)
  assert.match(workflow, /sha256sum dsh-codex\.ps1/u)
  assert.match(workflow, /\.artifacts\/dsh-codex\.ps1\.sha256/u)
  assert.match(workflow, /\.artifacts\/dsh-codex-setup\.ps1/u)
})

test('official DSH install and web startup are hard gates before a release', () => {
  const ci = text('.github/workflows/ci.yml')
  const publish = text('.github/workflows/publish.yml')
  const smokePath = new URL('../.github/scripts/accept-official-release.ps1', import.meta.url)

  assert.equal(existsSync(smokePath), true)
  const smoke = readFileSync(smokePath, 'utf8')
  assert.match(smoke, /Invoke-Dsh @\('plugin', '--profile', \$Profile, 'add'/u)
  assert.match(smoke, /plugin --profile \$Profile list dsh-codex-subscription --depth 0/u)
  assert.match(smoke, /--profile \$Profile --dump-config/u)
  assert.match(smoke, /Invoke-Dsh @\('plugin', '--profile', \$Profile, 'remove'/u)
  assert.match(smoke, /dsh web:|Invoke-WebRequest/u)
  assert.match(smoke, /dsh-codex-subscription@/u)
  assert.match(smoke, /--config\.minimum-release-age=0[\s\S]*dlx/u)
  assert.match(smoke, /Remove-Item -LiteralPath \$resolvedAcceptance -Recurse -Force/u)

  for (const workflow of [ci, publish]) {
    assert.match(workflow, /Official DSH end-to-end acceptance/u)
    assert.match(workflow, /accept-official-release\.ps1/u)
    assert.match(workflow, /accept-official-release\.ps1 -PackagePath \$package -DshRunner pnpm/u)
    assert.match(workflow, /actions\/download-artifact@v8/u)
    assert.match(workflow, /official-acceptance:[\s\S]*?actions\/setup-node@v6[\s\S]*?package-manager-cache:\s*false/u)
  }
  assert.match(publish, /path:\s*\.candidate\/\*\.tgz[\s\S]*include-hidden-files:\s*true/u)
  assert.match(publish, /release:[\s\S]*actions\/download-artifact@v8[\s\S]*name:\s*release-candidate-\$\{\{ github\.sha \}\}[\s\S]*cp "\$package" \.artifacts\/dsh-codex-subscription\.tgz/u)
  assert.doesNotMatch(publish, /release:[\s\S]*pnpm pack --pack-destination \.artifacts/u)
  assert.match(publish, /official-acceptance:[\s\S]*?actions\/setup-node@v6[\s\S]*?package-manager-cache:\s*false[\s\S]*?\n  release:/u, 'official acceptance must not fail after passing because a disposable pnpm cache path vanished')
  assert.match(publish, /release:\s*\n\s*needs:\s*\[[^\]]*official-acceptance[^\]]*\]/u)
})

test('one explicit trusted workflow creates the immutable release and publishes npm', () => {
  const workflow = text('.github/workflows/publish.yml')
  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/u)
  assert.doesNotMatch(workflow, /\n\s*push:/u)
  assert.doesNotMatch(workflow, /#\s*workflow_run:/u)
  assert.match(workflow, /contents:\s*write/u)
  assert.match(workflow, /id-token:\s*write/u)
  assert.match(workflow, /GITHUB_REF[\s\S]*refs\/heads\/main/u)
  assert.match(workflow, /commits\/\$RELEASE_TAG[\s\S]*tag_sha[\s\S]*GITHUB_SHA/u)
  assert.match(workflow, /gh release view/u)
  assert.match(workflow, /gh release create/u)
  assert.match(workflow, /dsh-codex-subscription\.tgz/u)
  assert.match(workflow, /dsh-codex-setup\.ps1/u)
  assert.match(workflow, /needs\.preflight\.outputs\.needed == 'false' \|\| needs\.release\.result == 'success'/u)
  assert.match(workflow, /run-name:\s*Release \$\{\{ inputs\.request_id \|\| github\.sha \}\}/u)
  assert.doesNotMatch(workflow, /--generate-notes/u)
})

test('npm publishing is release-gated and uses OIDC without a stored npm token', () => {
  const workflow = text('.github/workflows/publish.yml')
  assert.match(workflow, /id-token:\s*write/u)
  assert.match(workflow, /contents:\s*read/u)
  assert.match(workflow, /npm@12\.0\.2/u)
  assert.match(workflow, /needs\.preflight\.outputs\.tag[\s\S]*package\.json[\s\S]*version/u)
  for (const asset of [
    'dsh-codex-subscription.tgz',
    'dsh-codex.ps1',
    'dsh-codex.ps1.sha256',
    'dsh-codex-setup.ps1',
  ]) assert.match(workflow, new RegExp(asset.replaceAll('.', '\\.')))
  for (const asset of [
    'settings.png',
    'settings-en.png',
    'composer-quota-en.png',
  ]) assert.doesNotMatch(workflow, new RegExp(asset.replaceAll('.', '\\.')))
  assert.match(workflow, /gh release download[\s\S]*dsh-codex-subscription\.tgz/u)
  assert.match(workflow, /tar -xOf[\s\S]*package\/package\.json/u)
  assert.match(workflow, /npm publish \.\/\.release-artifact\/dsh-codex-subscription\.tgz/u)
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|secrets\.NPM/iu)
})

test('beta publishing stays a prerelease and never replaces npm latest or stable Windows assets', () => {
  const workflow = text('.github/workflows/publish.yml')
  assert.match(workflow, /npm_tag=beta/u)
  assert.match(workflow, /--prerelease/u)
  assert.match(workflow, /isPrerelease[\s\S]*IS_PRERELEASE/u)
  assert.match(workflow, /npm publish \.\/\.release-artifact\/dsh-codex-subscription\.tgz --access public --tag "\$NPM_TAG"/u)
  assert.match(workflow, /IS_PRERELEASE[\s\S]*dsh-codex-subscription\.tgz/u)
  assert.match(workflow, /IS_PRERELEASE[\s\S]*cp dsh-codex\.ps1/u)
  assert.match(workflow, /IS_PRERELEASE[\s\S]*--latest/u)
})
