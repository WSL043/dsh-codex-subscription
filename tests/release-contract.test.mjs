import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { compareVersions } from '../scripts/prepare-compat-release.mjs'
import { SUBAGENT_RUNTIME_VERSION, SUPPORTED_RUNTIME_VERSIONS } from '../src/subagent-runtime.js'

const text = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const imageHeader = path => {
  const bytes = readFileSync(new URL(`../${path}`, import.meta.url))
  if (bytes.length >= 24 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
  return bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 <= bytes.length
}
const manifest = JSON.parse(text('package.json'))
test('plugin card translations are exported and included in the published package', () => {
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json')
  assert.ok(manifest.files.includes('locale/*.json'))
  for (const language of ['en', 'zh']) {
    const { meta } = JSON.parse(text(`locale/${language}.json`))
    assert.ok(meta.title.trim())
    assert.ok(meta.description.trim())
  }
  assert.match(JSON.parse(text('locale/zh.json')).meta.description, /订阅/)
})
const compatibility = JSON.parse(text('compatibility.json'))

test('native plugin detail documents are brief, translated and explicitly packaged', () => {
  assert.ok(manifest.files.includes('docs/plugin/*.md'))
  for (const language of ['en', 'zh']) {
    const { meta } = JSON.parse(text(`locale/${language}.json`))
    const expected = language === 'zh' ? 'docs/plugin/DETAIL.zh.md' : 'docs/plugin/DETAIL.md'
    assert.equal(meta.detail, expected)
    const body = text(meta.detail)
    assert.ok(Buffer.byteLength(body) < 1024, 'detail remains a short introduction')
    assert.equal(body.includes('!['), false, 'no screenshots or duplicate README gallery')
    assert.ok(body.includes(`README.${language === 'zh' ? 'zh-CN' : 'en'}.md`))
    assert.ok(body.includes('https://github.com/WSL043/dsh-codex-subscription/issues'))
  }
})

test('verify-only release runs the acceptance layout while disabling every publication job', () => {
  const workflow = text('.github/workflows/publish.yml')
  assert.match(workflow, /verify_only:\s*\n\s*description:[^\n]+\n\s*required: false\n\s*type: boolean\n\s*default: false/u)
  assert.match(workflow, /VERIFY_ONLY: \$\{\{ inputs\.verify_only \}\}/u)
  assert.match(workflow, /if \[\[ "\$VERIFY_ONLY" == 'true' \]\]; then[\s\S]*?echo "needed=true"[\s\S]*?exit 0/u)
  for (const [name, next] of [['release', 'publish-npm'], ['publish-npm', 'sync-mirror'], ['sync-mirror', undefined]]) {
    const start = workflow.indexOf(`\n  ${name}:`)
    const end = next ? workflow.indexOf(`\n  ${next}:`, start) : workflow.length
    assert.ok(start > 0 && end > start, name)
    const job = workflow.slice(start, end)
    const guard = job.slice(job.indexOf('\n    if:'), job.indexOf('\n    runs-on:'))
    assert.match(guard, /inputs\.verify_only != true/u, `${name} must stay disabled during acceptance-only runs`)
  }
})

test('normal installation does not pull the optional Codex executable runtime', () => {
  const runtime = '@deepseek-ai/dsh-subagent-codex'
  assert.equal(manifest.dependencies?.[runtime], undefined)
  assert.equal(manifest.optionalDependencies?.[runtime], undefined)
  assert.equal(manifest.peerDependenciesMeta?.[runtime]?.optional, true)
  // The host provides react to client bundles; a dependency audit that cannot find it (DSHA) must not disable the plugin.
  for (const name of ['react', 'react-dom']) assert.equal(manifest.peerDependenciesMeta?.[name]?.optional, true, name)
  // The compatibility autopilot widens this range and the runtime list together.
  assert.equal(manifest.peerDependencies[runtime], [...SUPPORTED_RUNTIME_VERSIONS].sort(compareVersions).join(' || '))
  assert.equal(manifest.devDependencies[runtime], compatibility.latestTested)
  assert.equal(SUBAGENT_RUNTIME_VERSION, manifest.devDependencies[runtime])
  assert.deepEqual(new Set(SUPPORTED_RUNTIME_VERSIONS), new Set(manifest.peerDependencies[runtime].split(' || ')))
})

test('scheduled compatibility publication requires stable channels, accepted gates and a non-dry run', () => {
  const workflow = text('.github/workflows/compatibility-autopilot.yml')
  assert.match(workflow, /publish_compatibility:\s*\n\s*description:[^\n]*\n\s*required: false\s*\n\s*type: boolean\s*\n\s*default: true/u)
  const promote = workflow.slice(workflow.indexOf('\n  promote:'))
  assert.match(promote, /windows-acceptance\.result == 'success'/u)
  assert.match(promote, /needs\.detect\.outputs\.stable == 'true'/u)
  assert.match(promote, /if: inputs\.dry_run != true/u)
  assert.match(workflow, /node scripts\/upstream-compatibility\.mjs detect/u)
  assert.doesNotMatch(workflow.slice(0, workflow.indexOf('\n  promote:')), /contents: write|actions: write|git push|gh workflow run/u)
  const staged = workflow.match(/git add -- ([^\n]+)/u)?.[1]?.trim().split(/\s+/u)
  assert.ok(staged)
  for (const path of staged) {
    if (path === "'README*.md'") assert.ok(existsSync(new URL('../README.md', import.meta.url)))
    else assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path)
  }
})

test('official DSH acceptance allows only the reviewed pnpm build dependencies', () => {
  const script = text('.github/scripts/accept-official-release.ps1')
  for (const dependency of ['@deepseek-ai/dsh-subprocess-local', '@google/genai', 'fs-ext', 'koffi', 'node-pty', 'protobufjs']) {
    assert.equal(script.includes(`--allow-build=${dependency}`), true, dependency)
  }
  assert.equal(script.includes('dangerously-allow-all-builds'), false)
})

test('release acceptance includes the exact declared DSH release alongside public channels', () => {
  const workflow = text('.github/workflows/publish.yml')
  assert.match(workflow, /channel: \[latest, accepted, 0\.1\.7-rc\.2, alpha, next\]/u)
  assert.match(workflow, /Get-Content -LiteralPath compatibility\.json -Raw \| ConvertFrom-Json\)\.latestTested/u)
  const ci = text('.github/workflows/ci.yml')
  assert.match(ci, /channel: \[latest, accepted, 0\.1\.7-rc\.2, alpha, next\]/u)
  assert.match(ci, /Get-Content -LiteralPath compatibility\.json -Raw \| ConvertFrom-Json\)\.latestTested/u)
})

test('release is a prebuilt, documented, removable DSH bundle', () => {
  const pkg = JSON.parse(text('package.json'))
  const included = new Set(pkg.files)
  for (const path of [
    'lib/*.js',
    'cordis.patch.yml',
    'README*.md',
    'compatibility.json',
    'LICENSE',
    'SECURITY.md',
    'THIRD_PARTY_NOTICES.md',
  ]) assert.equal(included.has(path), true, `package files must include ${path}`)
  assert.equal([...included].some(path => path.startsWith('docs/assets')), false, 'README screenshots stay on GitHub and out of the runtime package')
  assert.equal(pkg.name, 'dsh-codex-subscription')
  // Internal dev packages can enter main without changing the documented stable install or release channel.
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-(?:beta|dev)\.\d+)?$/u)
  assert.equal(pkg.homepage, 'https://github.com/WSL043/dsh-codex-subscription')
  assert.equal('prepare' in pkg.scripts, false, 'GitHub installs use committed build output')
  assert.equal(pkg.dependencies?.['@earendil-works/pi-ai'], undefined)
  const supportedDshReleases = new Set([...compatibility.supported, ...compatibility.previews])
  for (const [name, version] of Object.entries(pkg.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-') && !pkg.peerDependenciesMeta?.[name]?.optional) assert.deepEqual(new Set(version.split(' || ')), supportedDshReleases, name)
  }
  assert.equal(pkg.devDependencies['@deepseek-ai/dsh-llm-pi-ai'], compatibility.latestTested)
  assert.equal(pkg.dependencies['@deepseek-ai/dsh-home-paths'], compatibility.latestTested)
  assert.equal(pkg.devDependencies['@deepseek-ai/dsh-api-remotes'], compatibility.latestTested)
  assert.match(pkg.devDependencies['@deepseek-ai/dsh-invariants'], /^0\.2\.\d+-rc\.\d+$/u, 'dsh-invariants is not republished with every DSH release')
  assert.equal(pkg.devDependencies['@deepseek-ai/dsh-client-ui-attachment'], undefined)
  assert.equal(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-runtime'), false)
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-client-runtime'], undefined)
  assert.equal(pkg.devDependencies['@deepseek-ai/dsh-client-runtime'], undefined)
  assert.equal(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-api-remotes'), true)
  assert.equal(pkg.devDependencies['@deepseek-ai/cordis'], '4.0.4')
  assert.equal(pkg.devDependencies['@deepseek-ai/schemastery'], '3.18.4')
  assert.equal(pkg.peerDependencies['@deepseek-ai/schemastery'], '3.18.1 || ^3.18.2 || 3.18.6-alpha.1')
  assert.equal(pkg.peerDependencies['@earendil-works/pi-ai'], '0.85.1 || 0.87.1 || 1.1.0 || 1.2.0 || 1.3.0 || 1.4.0 || 1.5.0 || 1.5.1')
  assert.equal(pkg.packageManager, 'pnpm@11.26.0')
  assert.equal(existsSync(new URL('../lib/index.js', import.meta.url)), true)
  assert.equal(existsSync(new URL('../lib/client.js', import.meta.url)), true)
  assert.equal(existsSync(new URL('../.github/workflows/ci.yml', import.meta.url)), true)
  assert.equal(existsSync(new URL('../.github/workflows/publish.yml', import.meta.url)), true)
})

test('compatibility metadata keeps stable and preview DSH lanes explicit', () => {
  assert.ok(compatibility.supported.includes('0.1.7-rc.2'), 'the oldest supported stable host stays declared')
  assert.equal(compatibility.latestTested, [...compatibility.supported].sort(compareVersions).at(-1))
  assert.equal(new Set(compatibility.supported).size, compatibility.supported.length)
  assert.ok(compatibility.supported.every(version => /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/u.test(version)))
  assert.ok(compatibility.previews.every(version => !compatibility.supported.includes(version)))
  assert.equal(new Set(compatibility.previews).size, compatibility.previews.length)
  assert.ok(compatibility.previews.every(version => /^\d+\.\d+\.\d+-(?:alpha|beta)\.\d+$/u.test(version)))
})

test('marketplace and README image references resolve to files with supported image headers', () => {
  const screenshots = JSON.parse(text('screenshots.json'))
  assert.ok(Array.isArray(screenshots) && screenshots.length >= 1 && screenshots.length <= 8, 'marketplace accepts 1-8 screenshots')
  const readmes = `${text('README.md')}\n${text('README.en.md')}`
  const referenced = [...readmes.matchAll(/docs\/assets\/[^\s"'<>)]*?\.png/gu)].map(match => match[0])
  for (const path of new Set([...screenshots, ...referenced])) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, `marketplace screenshot must exist: ${path}`)
    assert.ok(imageHeader(path), `invalid image header: ${path}`)
  }
  // The same page in two languages reads as a duplicate in a storefront carousel.
  const page = path => path.replace(/-(?:en|zh)(?=.[a-z]+$)/u, '')
  assert.equal(new Set(screenshots.map(page)).size, screenshots.length, 'no page may appear twice')
})

test('Windows manager updates from a checksum-verified immutable release asset', () => {
  const manager = text('dsh-codex.ps1')
  const managedVersion = manager.match(/\$PackageVersion = '(\d+\.\d+\.\d+)'/u)?.[1]
  assert.match(managedVersion ?? '', /^\d+\.\d+\.\d+$/u)
  if (manifest.version.includes('-')) {
    // During a preview beta the manager stays on the last stable release.
    assert.ok(compareVersions(managedVersion, manifest.version) < 0, `stable release manager must stay behind ${manifest.version}`)
  } else {
    assert.equal(managedVersion, manifest.version, 'stable release manager must install the package being released')
  }
  assert.equal(manager.includes(`$PackageSpec = 'dsh-codex-subscription@${managedVersion}'`), true)
  assert.doesNotMatch(manager, /dsh-codex-subscription@\d+\.\d+\.\d+-beta\.\d+/u)
  assert.match(manager, /api\.github\.com\/repos\/WSL043\/dsh-codex-subscription\/releases\/latest/u)
  assert.match(manager, /dsh-codex\.ps1\.sha256/u)
  assert.match(manager, /Get-FileDigest -Algorithm SHA256/u)
  assert.doesNotMatch(manager, /Invoke-Expression|\biex\b/iu)
})

test('per-user command PATH changes notify the Windows shell', () => {
  const manager = text('dsh-codex.ps1')
  const ci = text('.github/workflows/ci.yml')
  const release = text('.github/workflows/publish.yml')
  assert.match(manager, /SetEnvironmentVariable\('Path',[\s\S]*'User'\)/u)
  assert.match(manager, /SendMessageTimeout/u)
  assert.match(manager, /WM_SETTINGCHANGE|0x001A/u)
  assert.match(ci, /runs-on: windows-2025/u)
  assert.match(ci, /DSH_CODEX_TEST_USER_PATH:\s*'1'/u)
  assert.match(release, /os: \[windows-2022, windows-2025\]/u)
})

test('uninstall never recursively deletes a caller-selected command directory', () => {
  const manager = text('dsh-codex.ps1')
  const removal = manager.slice(
    manager.indexOf('function Remove-ManagerCommand'),
    manager.indexOf('function Install-ManagerCommand'),
  )
  assert.doesNotMatch(removal, /Remove-Item -LiteralPath \$Directory -Recurse/u)
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
  const workflow = text('.github/workflows/compatibility-autopilot.yml')
  assert.match(workflow, /cron:\s*'23 \* \* \* \*'/u)
  const detector = text('scripts/upstream-compatibility.mjs')
  assert.match(detector, /\['latest', 'next', 'alpha'\]/u)
  assert.match(detector, /manifest\.dist\?\.integrity/u)
  assert.match(detector, /manifest\.name !== '@deepseek-ai\/dsh'/u)
  const candidate = text('.github/actions/compatibility-candidate/action.yml')
  assert.match(candidate, /prepare-compat-release\.mjs --root \. --refresh-release-age/u)
  assert.match(candidate, /git diff --check/u)
  assert.doesNotMatch(workflow, /git diff --exit-code --check/u)
  assert.match(workflow, /windows-acceptance:[\s\S]*accept-official-release\.ps1/u)
  assert.match(candidate, /git diff --binary \| sha256sum/u)
  assert.match(workflow, /npm view dsh-codex-subscription dist-tags.latest/u)
  assert.doesNotMatch(workflow, /git push[^\n]*HEAD:main/u)
  assert.match(workflow, /source_ref="\$source_sha"/u)
  assert.match(workflow, /release_kind=compatibility/u)
  assert.match(workflow, /git add --[^\n]*'README\*\.md'[^\n]*compatibility\.json/u)
  assert.doesNotMatch(workflow, /git add --[^\n]*AGENTS\.md/u)
  assert.doesNotMatch(workflow, /git add --[^\n]*\.github\/workflows\/publish\.yml/u)
  assert.match(workflow, /request_id="compat-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/u)
  assert.match(workflow, /gh run watch "\$release_run"[\s\S]*--exit-status/u)
  assert.doesNotMatch(workflow, /continue-on-error:\s*true|NODE_AUTH_TOKEN|NPM_TOKEN/iu)
})

test('integration diagnostics follow the package version during compatibility releases', () => {
  const integration = text('tests/plugin-integration.test.mjs')
  assert.match(integration, /PACKAGE_VERSION/u)
  assert.doesNotMatch(integration, new RegExp(`version:\\s*['\"]${manifest.version.replaceAll('.', '\\\\.')}['\"]`, 'u'))
})

test('compatibility preparation keeps trusted workflow files immutable', () => {
  const prepare = text('scripts/prepare-compat-release.mjs')
  assert.doesNotMatch(prepare, /boundedPaths[\s\S]*\.github\/workflows\/publish\.yml/u)
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
  assert.match(workflow, /pnpm run test:behavior/u)
  assert.match(workflow, /ci-change-plan\.mjs/u)
  assert.doesNotMatch(workflow, /sha256sum dsh-codex\.ps1/u, 'ordinary CI should upload only the candidate package; release assets are built by the release gate')
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
  assert.match(smoke, /--config\.minimum-release-age=0[\s\S]*add[\s\S]*@deepseek-ai\/dsh@\$DshVersion/u)
  assert.match(smoke, /Remove-Item -LiteralPath \$resolvedAcceptance -Recurse -Force/u)

  for (const workflow of [ci, publish]) {
    assert.match(workflow, /Official DSH acceptance/u)
    assert.match(workflow, workflow === ci
      ? /channel: \[latest, (?:accepted, )?0\.1\.7-rc\.2, alpha, next\]/u
      : /channel: \[latest, (?:accepted, )?0\.1\.7-rc\.2, alpha, next\]/u)
    assert.match(workflow, /-DshVersion \$version/u)
    assert.match(workflow, /accept-official-release\.ps1/u)
    assert.match(workflow, /accept-official-release\.ps1 -PackagePath \$package -DshRunner pnpm/u)
    assert.match(workflow, /actions\/download-artifact@v8/u)
    assert.match(workflow, /official-acceptance:[\s\S]*?actions\/setup-node@v6[\s\S]*?package-manager-cache:\s*false/u)
  }
  assert.match(smoke, /test-official-runtime\.mjs/u)
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
  assert.doesNotMatch(workflow, /dsh-codex-setup\.ps1|\birm\b/iu)
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
  ]) assert.match(workflow, new RegExp(asset.replaceAll('.', '\\.')))
  for (const asset of [
    'settings.png',
    'settings-en.png',
    'composer-quota.png',
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

test('an alpha newer than the declared compatibility list is a notice, never a release blocker', () => {
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/publish.yml']) {
    const workflow = text(file)
    assert.match(workflow, /matrix\.channel \}\}'\s+-eq 'alpha'[\s\S]*?-notcontains \$version[\s\S]*?::notice title=DSH preview not declared::[\s\S]*?exit 0/u, file)
  }
})

test('the README install step names the exact released version, so a new release installs on its first day', () => {
  for (const [label, readme] of [['zh', text('README.md')], ['en', text('README.en.md')]]) {
    const pinned = readme.match(/```text\s+dsh-codex-subscription@([\d.]+)\s+```/u)?.[1]
    if (manifest.version.includes('-')) {
      // A preview plugin beta is not advertised: the README keeps pinning the last stable release.
      assert.match(pinned, /^\d+\.\d+\.\d+$/u, `${label} README install step must pin a stable release`)
      assert.ok(compareVersions(pinned, manifest.version) < 0, `${label} README install step must not pin ${pinned} ahead of ${manifest.version}`)
    } else {
      assert.equal(pinned, manifest.version, `${label} README install step must pin ${manifest.version}`)
    }
    // Install and update commands pin the same version: a bare name can resolve to an older release for the first day.
    const commands = [...readme.matchAll(/^dsh plugin --profile \w+ (?:add|update) (\S+)$/gmu)].map(match => match[1])
    assert.ok(commands.length >= 3, `${label} README lists install and update commands`)
    for (const spec of commands) assert.equal(spec, `dsh-codex-subscription@${pinned}`, `${label} README command must pin ${pinned}`)
  }
})
