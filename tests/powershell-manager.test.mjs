import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import test from 'node:test'

const script = new URL('../dsh-codex.ps1', import.meta.url)
const manifestVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const windowsTest = process.platform === 'win32' ? test : test.skip
const userPathTest = process.platform === 'win32' && process.env.DSH_CODEX_TEST_USER_PATH === '1'
  ? test
  : test.skip

function runWindowsPowerShell(source) {
  const encoded = Buffer.from(source, 'utf16le').toString('base64')
  return spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded,
  ], { encoding: 'utf8' })
}

function readWindowsUserPath() {
  const result = runWindowsPowerShell("[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes([string][Environment]::GetEnvironmentVariable('Path', 'User')))")
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return Buffer.from(result.stdout.trim(), 'base64').toString('utf16le')
}

function writeWindowsUserPath(value) {
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "[Environment]::SetEnvironmentVariable('Path', [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($env:DSH_CODEX_TEST_PATH)), 'User')",
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DSH_CODEX_TEST_PATH: Buffer.from(value, 'utf16le').toString('base64'),
    },
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
}

windowsTest('manager executes on Windows PowerShell 5.1', () => {
  const result = runWindowsPowerShell('$PSVersionTable.PSVersion.ToString()')
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout.trim(), /^5\.1(?:\.|$)/u)
})

windowsTest('user PATH lifecycle preserves the existing text exactly', () => {
  const manager = readFileSync(script, 'utf8')
  const pathFunctions = manager.slice(
    manager.indexOf('function Test-SamePath'),
    manager.indexOf('function Publish-UserPathChange'),
  )
  const result = runWindowsPowerShell(String.raw`
${pathFunctions}
$before = 'C:\Existing Tools;;C:\More Tools;'
$directory = 'C:\命令 管理'
$afterInstall = Add-UserPathEntry -UserPath $before -Directory $directory
$afterUninstall = Remove-UserPathEntry -UserPath $afterInstall -Directory $directory
[ordered]@{
  afterInstall = $afterInstall
  afterUninstall = $afterUninstall
  duplicateInstall = Add-UserPathEntry -UserPath $afterInstall -Directory $directory
} | ConvertTo-Json -Compress
`)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    afterInstall: 'C:\\Existing Tools;;C:\\More Tools;;C:\\命令 管理',
    afterUninstall: 'C:\\Existing Tools;;C:\\More Tools;',
    duplicateInstall: 'C:\\Existing Tools;;C:\\More Tools;;C:\\命令 管理',
  })
})

test('package discovery tolerates an empty pnpm dependency object in strict mode', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(script, 'utf8'))
  assert.match(source, /PSObject\.Properties\['dependencies'\]/u)
  assert.doesNotMatch(source, /\$project\.dependencies/u)
  const discovery = source.slice(
    source.indexOf('function Get-InstalledPackages'),
    source.indexOf('$target = Get-ManagerTarget'),
  )
  assert.match(discovery, /\$parsedProjects = \$json \| ConvertFrom-Json/u)
  assert.match(discovery, /\$projects = @\(\$parsedProjects\)/u)
  assert.doesNotMatch(discovery, /@\(\$json \| ConvertFrom-Json\)/u)
  assert.doesNotMatch(discovery, /System\.Collections\.Generic\.List\[string\]/u)
  assert.match(discovery, /Name\s*=\s*\[string\] \$property\.Name/u)
  assert.match(discovery, /Version\s*=\s*\$version/u)
})

test('install and update add the pinned asset without removing the current package first', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(script, 'utf8'))
  const actionFlow = source.slice(
    source.indexOf('$hadLegacyPackage = $installedBeforeNames -contains $LegacyPackageName'),
    source.indexOf('$config = Invoke-DshCommand'),
  )
  const updateBranch = actionFlow.slice(actionFlow.indexOf('    } else {'))
  assert.match(updateBranch, /Invoke-DshCommand -Target \$target -Arguments \$actionArguments/u)
  const beforeLegacyMigration = updateBranch.slice(0, updateBranch.indexOf('if ($hadLegacyPackage)'))
  assert.doesNotMatch(beforeLegacyMigration, /-SelectedAction 'Uninstall'[\s\S]*\$PackageName/u)
})

function portableFixture(root, installedStateRoot) {
  for (const directory of [
    join(root, 'runtime', 'node'),
    join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib'),
  ]) mkdirSync(directory, { recursive: true })
  writeFileSync(join(root, 'runtime', 'node', 'node.exe'), '')
  writeFileSync(join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'), '')
  if (installedStateRoot) {
    writeFileSync(join(root, 'installed-mode.json'), JSON.stringify({ schemaVersion: 1, stateRoot: installedStateRoot }))
  }
}

function functionalPortableFixture(root) {
  portableFixture(root)
  copyFileSync(process.execPath, join(root, 'runtime', 'node', 'node.exe'))
  const dsh = String.raw`
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
const stateFile = path.join(process.env.DSH_HOME, 'fake-packages.json')
const callsFile = path.join(process.env.DSH_HOME, 'fake-calls.json')
fs.mkdirSync(path.dirname(stateFile), { recursive: true })
const calls = fs.existsSync(callsFile) ? JSON.parse(fs.readFileSync(callsFile, 'utf8')) : []
calls.push(args)
fs.writeFileSync(callsFile, JSON.stringify(calls))
const packages = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {}
if (args.includes('--dump-config')) {
  if (packages['dsh-codex-subscription']) process.stdout.write('codex-subscription\n')
  process.exit(0)
}
if (args[0] !== 'plugin') process.exit(2)
const command = args[3]
if (command === 'list') {
  if (process.env.DSH_CODEX_TEST_EMPTY_LIST === '1' && !fs.existsSync(stateFile)) process.exit(0)
  process.stdout.write(JSON.stringify([{ dependencies: packages }]))
} else if (command === 'add') {
  if (process.env.DSH_CODEX_TEST_RELEASE_AGE === '1' && !args.includes('--config.minimumReleaseAge=0')) {
    process.stderr.write('ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION existing-plugin@1.0.0\n')
    process.exit(1)
  }
  if (process.env.DSH_CODEX_TEST_FAIL_ADD === '1') process.exit(9)
  packages['dsh-codex-subscription'] = { version: process.env.DSH_CODEX_TEST_ADDED_VERSION || '${manifestVersion}' }
  fs.writeFileSync(stateFile, JSON.stringify(packages))
} else if (command === 'remove') {
  delete packages[args[4]]
  fs.writeFileSync(stateFile, JSON.stringify(packages))
} else {
  process.exit(3)
}
`
  writeFileSync(join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'), dsh)
  const pnpm = join(root, 'data', 'runtime', 'dsh-codex-tools', 'pnpm-11.19.0', 'package', 'bin')
  mkdirSync(pnpm, { recursive: true })
  writeFileSync(join(pnpm, 'pnpm.cjs'), "console.log('11.19.0')\n")
}

windowsTest('legacy manager can install into a completely new profile with an empty list response', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-empty-profile-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, 'command')
  try {
    functionalPortableFixture(root)
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Install', '-PortableRoot', root,
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], {
      encoding: 'utf8',
      env: { ...process.env, DSH_CODEX_TEST_EMPTY_LIST: '1' },
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const installed = JSON.parse(readFileSync(join(root, 'data', 'dsh-home', 'fake-packages.json'), 'utf8'))
    assert.equal(installed['dsh-codex-subscription'].version, manifestVersion)
  } finally {
    rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

windowsTest('managed install retries one release-age-blocked mutation without disabling policy globally', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-managed-release-age-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, 'command')
  try {
    functionalPortableFixture(root)
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Install', '-PortableRoot', root,
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], {
      encoding: 'utf8',
      env: { ...process.env, DSH_CODEX_TEST_RELEASE_AGE: '1' },
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const calls = JSON.parse(readFileSync(join(root, 'data', 'dsh-home', 'fake-calls.json'), 'utf8'))
    const adds = calls.filter(args => args[0] === 'plugin' && args[3] === 'add')
    assert.equal(adds.length, 2)
    assert.equal(adds[0].includes('--config.minimumReleaseAge=0'), false)
    assert.equal(adds[1].includes('--config.minimumReleaseAge=0'), true)
  } finally {
    rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

function dryRun(root, action = 'Install', extraEnv = {}, extraArgs = []) {
  const result = spawnSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
    '-Action', action,
    '-PortableRoot', root,
    '-DryRun',
    ...extraArgs,
  ], {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout.trim())
}

windowsTest('a failed update preserves the currently installed plugin', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-update-rollback-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, 'command')
  const stateFile = join(root, 'data', 'dsh-home', 'fake-packages.json')
  try {
    functionalPortableFixture(root)
    mkdirSync(join(root, 'data', 'dsh-home'), { recursive: true })
    writeFileSync(stateFile, JSON.stringify({
      'dsh-codex-subscription': { version: '0.2.6' },
      'another-plugin': { version: '1.0.0' },
    }))
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Update', '-PortableRoot', root,
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], {
      encoding: 'utf8',
      env: { ...process.env, DSH_CODEX_TEST_FAIL_ADD: '1' },
    })
    assert.notEqual(result.status, 0)
    assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')), {
      'dsh-codex-subscription': { version: '0.2.6' },
      'another-plugin': { version: '1.0.0' },
    })
  } finally {
    rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

windowsTest('update fails instead of reporting success when DSH keeps an older package version', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-update-stale-version-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, 'command')
  try {
    functionalPortableFixture(root)
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Update', '-PortableRoot', root,
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], {
      encoding: 'utf8',
      env: { ...process.env, DSH_CODEX_TEST_ADDED_VERSION: '0.2.8' },
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, new RegExp(`expected ${manifestVersion.replaceAll('.', '\\.')}[^]*found 0\\.2\\.8`, 'iu'))
    assert.doesNotMatch(result.stdout, /Updated\./u)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('first install plans a reusable dsh-codex command without requiring administrator access', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-command-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, 'LocalAppData', 'Programs', 'dsh-codex')
  try {
    portableFixture(root)
    const plan = dryRun(root, 'Install', {}, [
      '-CommandRoot', commandRoot,
      '-NoModifyPath',
    ])
    const expectedCommandRoot = join(realpathSync.native(sandbox), 'LocalAppData', 'Programs', 'dsh-codex')
    assert.equal(plan.managerCommand, join(expectedCommandRoot, 'dsh-codex.cmd'))
    assert.equal(plan.installsManagerCommand, true)
    assert.equal(plan.modifiesUserPath, false)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('bare dsh-codex uses the cmd shim under Restricted execution policy', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-command-resolution-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, 'command')
  try {
    functionalPortableFixture(root)
    mkdirSync(commandRoot, { recursive: true })
    writeFileSync(join(commandRoot, 'dsh-codex.ps1'), "throw 'legacy manager should have been removed'\n")
    const install = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Install', '-PortableRoot', root,
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], { encoding: 'utf8' })
    assert.equal(install.status, 0, install.stderr || install.stdout)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex.cmd')), true)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex-manager.ps1')), true)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex.ps1')), false)

    const bare = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Restricted',
      '-Command', 'dsh-codex',
    ], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${commandRoot};${process.env.PATH}` },
    })
    assert.equal(bare.status, 0, bare.stderr || bare.stdout)
    assert.match(bare.stdout, /dsh-codex <install\|update\|uninstall>/iu)
    assert.doesNotMatch(bare.stderr, /running scripts is disabled|PSSecurityException/iu)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('reusable command uninstalls the portable plugin and removes itself', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-command-install-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, 'LocalAppData', 'Programs', 'dsh-codex')
  try {
    functionalPortableFixture(root)
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Install', '-PortableRoot', root,
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex-manager.ps1')), true)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex.ps1')), false)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex.cmd')), true)
    const managerCommand = join(commandRoot, 'dsh-codex.cmd')
    const help = spawnSync('cmd.exe', ['/d', '/s', '/c', managerCommand], {
      cwd: root, encoding: 'utf8',
    })
    assert.equal(help.status, 0, help.stderr || help.stdout)
    assert.match(help.stdout, /dsh-codex <install\|update\|uninstall>/iu)
    const uninstall = spawnSync('cmd.exe', [
      '/d', '/s', '/c',
      `${managerCommand} Uninstall -CommandRoot ${commandRoot} -NoModifyPath`,
    ], { cwd: root, encoding: 'utf8' })
    assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout)
    for (let attempt = 0; attempt < 30 && existsSync(commandRoot); attempt += 1) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
    }
    assert.equal(existsSync(commandRoot), false)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('reusable command works from Unicode paths containing spaces', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-unicode-'))
  const root = join(sandbox, 'DSH 便携版 日本語')
  const commandRoot = join(sandbox, '命令 管理')
  try {
    functionalPortableFixture(root)
    const install = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Install', '-PortableRoot', root,
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], { encoding: 'utf8' })
    assert.equal(install.status, 0, install.stderr || install.stdout)

    const managerCommand = join(commandRoot, 'dsh-codex.cmd')
    const uninstall = spawnSync('cmd.exe', [
      '/d', '/s', '/c', 'call', managerCommand,
      'Uninstall', '-PortableRoot', root,
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], { cwd: root, encoding: 'utf8' })
    assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout)
    for (let attempt = 0; attempt < 30 && existsSync(commandRoot); attempt += 1) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
    }
    assert.equal(existsSync(commandRoot), false)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('managed command remembers the selected portable root and profile', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-remember-target-'))
  const root = join(sandbox, 'Custom Portable Location')
  const commandRoot = join(sandbox, 'command')
  const unrelated = join(sandbox, 'unrelated')
  try {
    functionalPortableFixture(root)
    mkdirSync(unrelated, { recursive: true })
    const install = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Install', '-PortableRoot', root, '-Profile', 'custom-profile',
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], { encoding: 'utf8' })
    assert.equal(install.status, 0, install.stderr || install.stdout)

    const state = JSON.parse(readFileSync(join(commandRoot, 'install-state.json'), 'utf8'))
    assert.equal(state.portableRoot, realpathSync.native(root))
    assert.equal(state.profile, 'custom-profile')
    assert.equal(state.pathOwned, false)

    const update = spawnSync('cmd.exe', [
      '/d', '/s', '/c', 'call', join(commandRoot, 'dsh-codex.cmd'),
      'Update', '-SkipSelfUpdate', '-NoModifyPath',
    ], { cwd: unrelated, encoding: 'utf8' })
    assert.equal(update.status, 0, update.stderr || update.stdout)
    const calls = JSON.parse(readFileSync(join(root, 'data', 'dsh-home', 'fake-calls.json'), 'utf8'))
    const add = calls.findLast(args => args[0] === 'plugin' && args[3] === 'add')
    assert.deepEqual(add.slice(0, 4), ['plugin', '--profile', 'custom-profile', 'add'])
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('an explicit new portable target does not inherit the previous target profile', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-new-target-'))
  const firstRoot = join(sandbox, 'First Portable')
  const secondRoot = join(sandbox, 'Second Portable')
  const commandRoot = join(sandbox, 'command')
  try {
    functionalPortableFixture(firstRoot)
    functionalPortableFixture(secondRoot)
    const install = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Install', '-PortableRoot', firstRoot, '-Profile', 'custom-profile',
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], { encoding: 'utf8' })
    assert.equal(install.status, 0, install.stderr || install.stdout)

    const update = spawnSync('cmd.exe', [
      '/d', '/s', '/c', 'call', join(commandRoot, 'dsh-codex.cmd'),
      'Update', '-SkipSelfUpdate', '-PortableRoot', secondRoot, '-NoModifyPath',
    ], { encoding: 'utf8' })
    assert.equal(update.status, 0, update.stderr || update.stdout)
    const calls = JSON.parse(readFileSync(join(secondRoot, 'data', 'dsh-home', 'fake-calls.json'), 'utf8'))
    const add = calls.findLast(args => args[0] === 'plugin' && args[3] === 'add')
    assert.deepEqual(add.slice(0, 4), ['plugin', '--profile', 'web', 'add'])
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

userPathTest('installer adds and removes only its entry in the real user PATH', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-user-path-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, '命令 管理')
  const originalPath = readWindowsUserPath()
  const seededPath = 'C:\\Existing Tools;;C:\\More Tools;'
  try {
    writeWindowsUserPath(seededPath)
    functionalPortableFixture(root)
    const install = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Install', '-PortableRoot', root, '-CommandRoot', commandRoot,
    ], { encoding: 'utf8' })
    assert.equal(install.status, 0, install.stderr || install.stdout)
    const resolvedCommandRoot = realpathSync.native(commandRoot)
    assert.equal(readWindowsUserPath(), `${seededPath};${resolvedCommandRoot}`)

    const uninstall = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Uninstall', '-PortableRoot', root, '-CommandRoot', commandRoot,
    ], { encoding: 'utf8' })
    assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout)
    assert.equal(readWindowsUserPath(), seededPath)
  } finally {
    writeWindowsUserPath(originalPath)
    rmSync(sandbox, { recursive: true, force: true })
  }
})

userPathTest('uninstall preserves a command directory that was already on the real user PATH', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-existing-user-path-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, 'existing-command')
  const originalPath = readWindowsUserPath()
  try {
    mkdirSync(commandRoot, { recursive: true })
    const seededPath = `C:\\Existing Tools;${realpathSync.native(commandRoot)};C:\\More Tools`
    writeWindowsUserPath(seededPath)
    functionalPortableFixture(root)
    const install = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Install', '-PortableRoot', root, '-CommandRoot', commandRoot,
    ], { encoding: 'utf8' })
    assert.equal(install.status, 0, install.stderr || install.stdout)
    const state = JSON.parse(readFileSync(join(commandRoot, 'install-state.json'), 'utf8'))
    assert.equal(state.pathOwned, false)

    const uninstall = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Uninstall', '-PortableRoot', root, '-CommandRoot', commandRoot,
    ], { encoding: 'utf8' })
    assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout)
    assert.equal(readWindowsUserPath(), seededPath)
  } finally {
    writeWindowsUserPath(originalPath)
    rmSync(sandbox, { recursive: true, force: true })
  }
})

userPathTest('updating a legacy managed command records its existing PATH ownership', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-legacy-path-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, 'legacy-command')
  const originalPath = readWindowsUserPath()
  try {
    mkdirSync(commandRoot, { recursive: true })
    functionalPortableFixture(root)
    copyFileSync(script, join(commandRoot, 'dsh-codex-manager.ps1'))
    writeFileSync(join(commandRoot, 'dsh-codex.cmd'), '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dsh-codex-manager.ps1" -Managed %*\r\n')
    const seededPath = `${originalPath}${originalPath ? ';' : ''}${realpathSync.native(commandRoot)}`
    writeWindowsUserPath(seededPath)
    const update = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', join(commandRoot, 'dsh-codex-manager.ps1'),
      '-Managed', '-Action', 'Update', '-SkipSelfUpdate', '-PortableRoot', root,
    ], { encoding: 'utf8' })
    assert.equal(update.status, 0, update.stderr || update.stdout)
    const state = JSON.parse(readFileSync(join(commandRoot, 'install-state.json'), 'utf8'))
    assert.equal(state.pathOwned, true)
  } finally {
    writeWindowsUserPath(originalPath)
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('direct uninstall removes only manager-owned files from a custom command directory', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-bounded-uninstall-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, 'shared-command-directory')
  const sentinel = join(commandRoot, 'keep-me.txt')
  try {
    functionalPortableFixture(root)
    const install = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Install', '-PortableRoot', root,
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], { encoding: 'utf8' })
    assert.equal(install.status, 0, install.stderr || install.stdout)
    writeFileSync(sentinel, 'preserve')
    const uninstall = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Uninstall', '-PortableRoot', root,
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], { encoding: 'utf8' })
    assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout)
    assert.equal(existsSync(sentinel), true)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex-manager.ps1')), false)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex.ps1')), false)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex.cmd')), false)
  } finally {
    rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

windowsTest('managed update runs only a checksum-matching immutable release manager', async () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-self-update-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, 'command')
  const marker = join(sandbox, 'latest-manager.json')
  const latestScript = String.raw`param(
  [string] $Action,
  [string] $Profile,
  [string] $PortableRoot,
  [string] $CommandRoot,
  [switch] $Managed,
  [switch] $SkipSelfUpdate,
  [switch] $NoModifyPath
)
[IO.File]::WriteAllText($env:DSH_CODEX_TEST_MARKER, (@{
  action = $Action
  profile = $Profile
  portableRoot = $PortableRoot
  commandRoot = $CommandRoot
  managed = [bool] $Managed
  skipSelfUpdate = [bool] $SkipSelfUpdate
  noModifyPath = [bool] $NoModifyPath
} | ConvertTo-Json -Compress))
`
  const checksum = createHash('sha256').update(latestScript).digest('hex').toUpperCase()
  let servedChecksum = checksum
  const releaseRequests = []
  const server = createServer((request, response) => {
    if (request.url.startsWith('/latest?')) {
      releaseRequests.push({ cacheControl: request.headers['cache-control'], pragma: request.headers.pragma, url: request.url })
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ tag_name: 'v9.9.9' }))
    } else if (request.url === '/releases/download/v9.9.9/dsh-codex.ps1') {
      response.end(latestScript)
    } else if (request.url === '/releases/download/v9.9.9/dsh-codex.ps1.sha256') {
      response.end(`${servedChecksum}  dsh-codex.ps1\n`)
    } else {
      response.statusCode = 404
      response.end('not found')
    }
  })
  try {
    functionalPortableFixture(root)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const { port } = server.address()
    const runManagedUpdate = async () => {
      const child = spawn('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
        '-Managed', '-Action', 'Update', '-Profile', 'web',
        '-PortableRoot', root, '-CommandRoot', commandRoot, '-NoModifyPath',
      ], {
        env: {
          ...process.env,
          DSH_CODEX_RELEASE_API: `http://127.0.0.1:${port}/latest`,
          DSH_CODEX_RELEASE_BASE: `http://127.0.0.1:${port}/releases/download`,
          DSH_CODEX_TEST_MARKER: marker,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
      const [exitCode] = await once(child, 'exit')
      return { exitCode, stderr, stdout }
    }
    const accepted = await runManagedUpdate()
    assert.equal(accepted.exitCode, 0, accepted.stderr || accepted.stdout)
    assert.equal(releaseRequests.length, 1)
    assert.match(releaseRequests[0].url, /^\/latest\?cache_bust=\d+$/u)
    assert.equal(releaseRequests[0].cacheControl, 'no-cache')
    assert.equal(releaseRequests[0].pragma, 'no-cache')
    assert.equal(existsSync(marker), true)
    const invocation = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(marker, 'utf8')))
    const expectedCommandRoot = join(realpathSync.native(sandbox), 'command')
    assert.deepEqual(invocation, {
      action: 'Update',
      commandRoot: expectedCommandRoot,
      managed: true,
      noModifyPath: true,
      portableRoot: root,
      profile: 'web',
      skipSelfUpdate: true,
    })
    rmSync(marker, { force: true })
    servedChecksum = '0'.repeat(64)
    const rejected = await runManagedUpdate()
    assert.notEqual(rejected.exitCode, 0)
    assert.match(rejected.stderr, /checksum mismatch/iu)
    assert.equal(existsSync(marker), false)
  } finally {
    server.close()
    rmSync(sandbox, { recursive: true, force: true })
  }
})

function autoDryRunResult(action = 'Install', extraEnv = {}, visibleProcesses = []) {
  const source = String.raw`
function Get-CimInstance {
  [CmdletBinding()]
  param(
    [Parameter(Position = 0)] [string] $ClassName,
    [string] $Filter
  )
  $encoded = [string] $env:DSH_CODEX_TEST_PROCESSES
  if ($encoded) {
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
    @($json | ConvertFrom-Json)
  }
}
& $env:DSH_CODEX_TEST_SCRIPT -Action $env:DSH_CODEX_TEST_ACTION -DryRun
`
  const encoded = Buffer.from(source, 'utf16le').toString('base64')
  return spawnSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', encoded,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
      DSH_CODEX_TEST_ACTION: action,
      DSH_CODEX_TEST_PROCESSES: Buffer.from(JSON.stringify(visibleProcesses), 'utf8').toString('base64'),
      DSH_CODEX_TEST_SCRIPT: script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
    },
  })
}

function autoDryRun(action = 'Install', extraEnv = {}, visibleProcesses = []) {
  const result = autoDryRunResult(action, extraEnv, visibleProcesses)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout.trim())
}

windowsTest('portable install uses the bundled CLI, DSH_HOME, and package store', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-codex-portable-'))
  try {
    portableFixture(root)
    const expectedRoot = realpathSync.native(root)
    const plan = dryRun(root)
    assert.equal(plan.mode, 'portable')
    assert.equal(plan.action, 'Install')
    assert.equal(plan.executable, join(expectedRoot, 'runtime', 'node', 'node.exe'))
    assert.equal(plan.dshHome, join(expectedRoot, 'data', 'dsh-home'))
    assert.equal(plan.pnpmVersion, '11.19.0')
    assert.equal(plan.pnpmDirectory, join(expectedRoot, 'data', 'runtime', 'dsh-codex-tools', 'pnpm-11.19.0'))
    assert.equal(plan.pnpmStore, join(expectedRoot, 'data', 'pnpm-store'))
    assert.deepEqual(plan.arguments, [
      join(expectedRoot, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      'plugin', '--profile', 'web', 'add',
      `dsh-codex-subscription@${manifestVersion}`,
      '--store-dir', join(expectedRoot, 'data', 'pnpm-store'),
      '--loglevel', 'error',
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

windowsTest('portable install prefers the DSH-Portable command shim when available', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-codex-portable-shim-'))
  try {
    portableFixture(root)
    writeFileSync(join(root, 'dsh.exe'), '')
    const expectedRoot = realpathSync.native(root)
    const plan = dryRun(root)
    assert.equal(plan.mode, 'portable')
    assert.equal(plan.executable, join(expectedRoot, 'dsh.exe'))
    assert.equal(plan.pnpmDirectory, null)
    assert.deepEqual(plan.arguments, [
      'plugin', '--profile', 'web', 'add',
      `dsh-codex-subscription@${manifestVersion}`,
      '--store-dir', join(expectedRoot, 'data', 'pnpm-store'),
      '--loglevel', 'error',
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

windowsTest('installed portable mode expands its external state root', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-installed-'))
  const root = join(sandbox, 'Programs', 'DeepSeek-Herness')
  const localAppData = join(sandbox, 'LocalAppData')
  try {
    portableFixture(root, '%LOCALAPPDATA%\\DeepSeek-Herness')
    mkdirSync(localAppData, { recursive: true })
    const plan = dryRun(root, 'Update', { LOCALAPPDATA: localAppData })
    assert.equal(plan.action, 'Update')
    assert.equal(plan.dshHome, join(realpathSync.native(localAppData), 'DeepSeek-Herness', 'data', 'dsh-home'))
    assert.equal(plan.pnpmStore, join(realpathSync.native(localAppData), 'DeepSeek-Herness', 'data', 'pnpm-store'))
    assert.equal(plan.arguments.includes(`dsh-codex-subscription@${manifestVersion}`), true)
    assert.equal(plan.packageName, 'dsh-codex-subscription')
    assert.equal(plan.legacyPackageName, '@wsl043/dsh-codex-subscription')
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('portable uninstall removes the package without deleting the profile', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-codex-uninstall-'))
  try {
    portableFixture(root)
    const expectedRoot = realpathSync.native(root)
    const plan = dryRun(root, 'Uninstall')
    assert.deepEqual(plan.arguments.slice(-9), [
      'plugin', '--profile', 'web', 'remove',
      'dsh-codex-subscription',
      '--store-dir', join(expectedRoot, 'data', 'pnpm-store'),
      '--loglevel', 'error',
    ])
    assert.equal(plan.removesProfile, false)
    assert.equal(plan.legacyPackageName, '@wsl043/dsh-codex-subscription')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

windowsTest('auto-discovery finds a running portable root with spaces in its path', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh codex running '))
  const root = join(sandbox, 'Renamed Portable Folder')
  const dshBin = join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  portableFixture(root)
  const portableNode = join(root, 'runtime', 'node', 'node.exe')
  try {
    const expectedRoot = realpathSync.native(root)
    const plan = autoDryRun('Install', {
      USERPROFILE: join(sandbox, 'unused-user'),
      LOCALAPPDATA: join(sandbox, 'unused-local-app-data'),
    }, [{
      ExecutablePath: portableNode,
      CommandLine: `"${portableNode}" "${dshBin}"`,
    }])
    assert.equal(plan.mode, 'portable')
    assert.equal(plan.executable, join(expectedRoot, 'runtime', 'node', 'node.exe'))
    assert.equal(plan.dshHome, join(expectedRoot, 'data', 'dsh-home'))
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('auto-discovery still supports an existing global dsh command', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-global-'))
  const bin = join(sandbox, 'bin')
  const localAppData = join(sandbox, 'LocalAppData')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'dsh.cmd'), '@exit /b 0\r\n')
  writeFileSync(join(bin, 'node.exe'), '')
  try {
    const plan = autoDryRun('Install', {
      PATH: `${bin};${process.env.PATH}`,
      USERPROFILE: join(sandbox, 'unused-user'),
      LOCALAPPDATA: localAppData,
    })
    assert.equal(plan.mode, 'global')
    assert.equal(plan.executable.toLowerCase(), join(bin, 'dsh.cmd').toLowerCase())
    assert.equal(plan.dshHome, null)
    assert.equal(plan.pnpmDirectory, join(localAppData, 'dsh-codex-subscription', 'tools', 'pnpm-11.19.0'))
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('managed commands remember a global target even when run inside a portable folder', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-managed-global-'))
  const portableRoot = join(sandbox, 'Portable')
  const bin = join(sandbox, 'bin')
  const shadowBin = join(sandbox, 'shadow-bin')
  const commandRoot = join(sandbox, 'command')
  portableFixture(portableRoot)
  mkdirSync(bin, { recursive: true })
  mkdirSync(shadowBin, { recursive: true })
  mkdirSync(commandRoot, { recursive: true })
  writeFileSync(join(bin, 'dsh.cmd'), '@exit /b 0\r\n')
  writeFileSync(join(bin, 'node.exe'), '')
  writeFileSync(join(shadowBin, 'dsh.cmd'), '@exit /b 0\r\n')
  writeFileSync(join(shadowBin, 'node.exe'), '')
  writeFileSync(join(commandRoot, 'install-state.json'), JSON.stringify({
    schemaVersion: 1,
    mode: 'global',
    portableRoot: null,
    globalDsh: join(bin, 'dsh.cmd'),
    globalNode: join(bin, 'node.exe'),
    profile: 'web',
    pathOwned: false,
  }))
  try {
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Managed', '-SkipSelfUpdate', '-Action', 'Install', '-DryRun',
      '-CommandRoot', commandRoot,
    ], {
      cwd: portableRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${shadowBin};${bin};${process.env.PATH}`,
        USERPROFILE: join(sandbox, 'unused-user'),
        LOCALAPPDATA: join(sandbox, 'LocalAppData'),
      },
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const plan = JSON.parse(result.stdout.trim())
    assert.equal(plan.mode, 'global')
    const actual = statSync(plan.executable)
    const expected = statSync(join(bin, 'dsh.cmd'))
    assert.equal(actual.dev, expected.dev)
    assert.equal(actual.ino, expected.ino)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('auto-discovery stops instead of choosing between two running portable roots', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-ambiguous-'))
  const roots = [join(sandbox, 'Portable A'), join(sandbox, 'Portable B')]
  for (const root of roots) {
    portableFixture(root)
  }
  try {
    const result = autoDryRunResult('Install', {
      USERPROFILE: join(sandbox, 'unused-user'),
      LOCALAPPDATA: join(sandbox, 'unused-local-app-data'),
    }, roots.map(root => {
      const portableNode = join(root, 'runtime', 'node', 'node.exe')
      const dshBin = join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
      return {
        ExecutablePath: portableNode,
        CommandLine: `"${portableNode}" "${dshBin}"`,
      }
    }))
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /more than one running DSH-Portable/iu)
    for (const root of roots) assert.equal(result.stderr.includes(realpathSync.native(root)), true)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

windowsTest('auto-discovery stops when global and portable installations are both plausible', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-global-portable-'))
  const userProfile = join(sandbox, 'user')
  const root = join(userProfile, 'Downloads', 'DSH-Portable')
  const bin = join(sandbox, 'bin')
  portableFixture(root)
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'dsh.cmd'), '@exit /b 0\r\n')
  writeFileSync(join(bin, 'node.exe'), '')
  try {
    const result = autoDryRunResult('Install', {
      PATH: `${bin};${process.env.PATH}`,
      USERPROFILE: userProfile,
      LOCALAPPDATA: join(sandbox, 'LocalAppData'),
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /both a global dsh command and DSH-Portable were found/iu)
    assert.match(result.stderr, /-PortableRoot/u)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})
