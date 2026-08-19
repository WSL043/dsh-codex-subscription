import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const setup = new URL('../dsh-codex-setup.ps1', import.meta.url)
const windowsTest = process.platform === 'win32' ? test : test.skip

function setupPath() {
  return setup.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1')
}

function portableFixture(root, dependencies = null) {
  for (const directory of [
    join(root, 'runtime', 'node'),
    join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib'),
  ]) mkdirSync(directory, { recursive: true })

  copyFileSync(process.execPath, join(root, 'runtime', 'node', 'node.exe'))
  const serialized = JSON.stringify([{ dependencies: dependencies || {} }])
  writeFileSync(
    join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    `process.stdout.write(${JSON.stringify(serialized)})\n`,
  )
  if (dependencies !== null) mkdirSync(join(root, 'data', 'dsh-home'), { recursive: true })
}

function runSetup(args, { cwd, env = {}, input } = {}) {
  return spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', setupPath(),
    ...args,
  ], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    input,
  })
}

function parsePlan(stdout) {
  const match = stdout.match(/(\{[^\r\n]*"language"[^\r\n]*\})\s*$/u)
  assert.ok(match, `missing dry-run JSON in output:\n${stdout}`)
  return JSON.parse(match[1])
}

test('friendly setup is bilingual, checksum-verifies the manager, retries DSH busy state, and avoids code evaluation', () => {
  const source = readFileSync(setup, 'utf8')
  assert.equal(source.codePointAt(0), 0xfeff, 'Windows PowerShell 5.1 needs the UTF-8 BOM for Chinese literals')
  assert.match(source, /1\. 中文（简体）[\s\S]*2\. English/u)
  assert.match(source, /More than one DSH installation was found/u)
  assert.match(source, /检测到多个 DSH/u)
  assert.match(source, /\$effectiveAction = if \(\$isInstalled\) \{ 'Update' \} else \{ 'Install' \}/u)
  assert.match(source, /dsh-codex\.ps1\.sha256/u)
  assert.match(source, /Get-FileDigest -Path \$manager/u)
  assert.match(source, /Get-InstalledPackageStatusWithRetry/u)
  assert.match(source, /Invoke-ManagerWithRetry/u)
  assert.match(source, /powershell\.exe @managerArguments/u)
  assert.doesNotMatch(source, /& \$manager\.Path @managerArguments/u)
  assert.doesNotMatch(source, /Invoke-Expression|\biex\b/iu)
})

windowsTest('fresh portable setup automatically chooses Install', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-codex-friendly-install-'))
  try {
    portableFixture(root)
    const result = runSetup(['-Language', 'en-US', '-PortableRoot', root, '-DryRun'])
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const plan = parsePlan(result.stdout)
    assert.equal(plan.language, 'en-US')
    assert.equal(plan.candidateCount, 1)
    assert.equal(plan.mode, 'portable')
    assert.equal(plan.action, 'Install')
    assert.equal(plan.installed, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

windowsTest('existing portable setup automatically chooses Update and reports the current version', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-codex-friendly-update-'))
  try {
    portableFixture(root, {
      'dsh-codex-subscription': { version: '0.9.0' },
      'another-plugin': { version: '1.2.3' },
    })
    const result = runSetup(['-Language', 'zh-CN', '-PortableRoot', root, '-DryRun'])
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const plan = parsePlan(result.stdout)
    assert.equal(plan.language, 'zh-CN')
    assert.equal(plan.action, 'Update')
    assert.equal(plan.installed, true)
    assert.equal(plan.installedVersion, '0.9.0')
    assert.match(result.stdout, /操作:\s*更新/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

windowsTest('language is the first interactive choice when it is not supplied', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-codex-friendly-language-'))
  try {
    portableFixture(root)
    const result = runSetup(['-PortableRoot', root, '-DryRun'], { input: '2\r\n' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const plan = parsePlan(result.stdout)
    assert.equal(plan.language, 'en-US')
    assert.match(result.stdout, /1\. 中文（简体）/u)
    assert.match(result.stdout, /2\. English/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

windowsTest('multiple discovered portable copies become a numbered choice instead of an exception', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-friendly-multiple-'))
  const first = join(sandbox, 'Downloads', 'Alpha DSH')
  const second = join(sandbox, 'Downloads', 'Beta DSH')
  try {
    portableFixture(first)
    portableFixture(second)
    mkdirSync(join(sandbox, 'LocalAppData'), { recursive: true })
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const isolatedPath = [
      join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0'),
      join(systemRoot, 'System32'),
    ].join(';')
    const result = runSetup(['-Language', 'en-US', '-DryRun'], {
      cwd: sandbox,
      env: {
        USERPROFILE: sandbox,
        LOCALAPPDATA: join(sandbox, 'LocalAppData'),
        PATH: isolatedPath,
      },
      input: '1\r\n',
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const plan = parsePlan(result.stdout)
    assert.equal(plan.candidateCount, 2)
    assert.equal(plan.action, 'Install')
    const selected = realpathSync.native(plan.target).toLowerCase()
    const expected = [first, second].map(root => realpathSync.native(root).toLowerCase())
    assert.equal(expected.includes(selected), true)
    for (const root of expected) assert.equal(result.stdout.toLowerCase().includes(root), true)
    assert.match(result.stdout, /More than one DSH installation was found/u)
    assert.match(result.stdout, /\[1\][\s\S]*\[2\]/u)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('real setup invocation passes named manager arguments through child PowerShell', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-friendly-manager-'))
  const root = join(sandbox, 'DSH Portable')
  const manager = join(sandbox, 'fake-manager.ps1')
  const marker = join(sandbox, 'manager.json')
  try {
    portableFixture(root)
    writeFileSync(manager, String.raw`[CmdletBinding()]
param(
  [ValidateSet('Install', 'Update', 'Uninstall')][string] $Action,
  [string] $Profile,
  [string] $PortableRoot
)
[IO.File]::WriteAllText($env:DSH_CODEX_TEST_MANAGER_MARKER, (@{
  action = $Action
  profile = $Profile
  portableRoot = $PortableRoot
} | ConvertTo-Json -Compress))
`)
    const result = runSetup([
      '-Language', 'en-US', '-PortableRoot', root, '-ManagerPath', manager,
    ], { env: { DSH_CODEX_TEST_MANAGER_MARKER: marker } })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const invocation = JSON.parse(readFileSync(marker, 'utf8'))
    assert.equal(invocation.action, 'Install')
    assert.equal(invocation.profile, 'web')
    assert.equal(invocation.portableRoot.toLowerCase(), realpathSync.native(root).toLowerCase())
    assert.match(result.stdout, /Installation completed\./u)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('busy DSH plugin state offers a retry instead of reporting a terminal failure', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-friendly-busy-'))
  const root = join(sandbox, 'DSH Portable')
  try {
    portableFixture(root, {})
    const dsh = join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    writeFileSync(dsh, String.raw`
const fs = require('node:fs')
const path = require('node:path')
const marker = path.join(process.env.DSH_HOME, 'busy-once.txt')
if (!fs.existsSync(marker)) {
  fs.writeFileSync(marker, '1')
  process.stderr.write('DSH plugin command failed: Another DSH plugin command is already running.\n')
  process.exit(23)
}
process.stdout.write(JSON.stringify([{ dependencies: {} }]))
`)
    const result = runSetup([
      '-Language', 'en-US', '-PortableRoot', root, '-DryRun',
    ], { input: '\r\n' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const plan = parsePlan(result.stdout)
    assert.equal(plan.action, 'Install')
    assert.match(result.stdout, /already running another plugin operation/iu)
    assert.doesNotMatch(result.stdout, /The operation did not complete\./u)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})
