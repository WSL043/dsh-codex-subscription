import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import test from 'node:test'

const script = new URL('../dsh-codex.ps1', import.meta.url)

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

function dryRun(root, action = 'Install', extraEnv = {}) {
  const result = spawnSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
    '-Action', action,
    '-PortableRoot', root,
    '-DryRun',
  ], {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout.trim())
}

function autoDryRunResult(action = 'Install', extraEnv = {}) {
  return spawnSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
    '-Action', action,
    '-DryRun',
  ], {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  })
}

function autoDryRun(action = 'Install', extraEnv = {}) {
  const result = autoDryRunResult(action, extraEnv)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout.trim())
}

test('portable install uses the bundled CLI and portable DSH_HOME', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-codex-portable-'))
  try {
    portableFixture(root)
    const plan = dryRun(root)
    assert.equal(plan.mode, 'portable')
    assert.equal(plan.action, 'Install')
    assert.equal(plan.executable, join(root, 'runtime', 'node', 'node.exe'))
    assert.equal(plan.dshHome, join(root, 'data', 'dsh-home'))
    assert.equal(plan.pnpmVersion, '11.19.0')
    assert.equal(plan.pnpmDirectory, join(root, 'data', 'runtime', 'dsh-codex-tools', 'pnpm-11.19.0'))
    assert.equal(plan.pnpmStore, join(root, 'data', 'runtime', 'dsh-codex-tools', 'pnpm-store-v11'))
    assert.deepEqual(plan.arguments, [
      join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      'plugin', '--profile', 'web', 'add',
      'https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.1/wsl043-dsh-codex-subscription-0.2.1.tgz',
      '--store-dir', join(root, 'data', 'runtime', 'dsh-codex-tools', 'pnpm-store-v11'),
      '--loglevel', 'error',
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('installed portable mode expands its external state root', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-installed-'))
  const root = join(sandbox, 'Programs', 'DeepSeek-Herness')
  const localAppData = join(sandbox, 'LocalAppData')
  try {
    portableFixture(root, '%LOCALAPPDATA%\\DeepSeek-Herness')
    const plan = dryRun(root, 'Update', { LOCALAPPDATA: localAppData })
    assert.equal(plan.action, 'Update')
    assert.equal(plan.dshHome, join(localAppData, 'DeepSeek-Herness', 'data', 'dsh-home'))
    assert.equal(plan.arguments.includes('https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.1/wsl043-dsh-codex-subscription-0.2.1.tgz'), true)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('portable uninstall removes the package without deleting the profile', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-codex-uninstall-'))
  try {
    portableFixture(root)
    const plan = dryRun(root, 'Uninstall')
    assert.deepEqual(plan.arguments.slice(-9), [
      'plugin', '--profile', 'web', 'remove',
      '@wsl043/dsh-codex-subscription',
      '--store-dir', join(root, 'data', 'runtime', 'dsh-codex-tools', 'pnpm-store-v11'),
      '--loglevel', 'error',
    ])
    assert.equal(plan.removesProfile, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('auto-discovery finds a running portable root with spaces in its path', async () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh codex running '))
  const root = join(sandbox, 'Renamed Portable Folder')
  const dshBin = join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  portableFixture(root)
  const portableNode = join(root, 'runtime', 'node', 'node.exe')
  copyFileSync(process.execPath, portableNode)
  const sleeper = spawn(portableNode, ['-e', 'setTimeout(() => {}, 15000)', dshBin], {
    stdio: 'ignore',
  })
  try {
    await new Promise(resolve => setTimeout(resolve, 300))
    const plan = autoDryRun('Install', {
      USERPROFILE: join(sandbox, 'unused-user'),
      LOCALAPPDATA: join(sandbox, 'unused-local-app-data'),
    })
    assert.equal(plan.mode, 'portable')
    assert.equal(plan.executable, join(root, 'runtime', 'node', 'node.exe'))
    assert.equal(plan.dshHome, join(root, 'data', 'dsh-home'))
  } finally {
    const exit = once(sleeper, 'exit')
    sleeper.kill()
    await exit
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('auto-discovery still supports an existing global dsh command', () => {
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

test('auto-discovery stops instead of choosing between two running portable roots', async () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-ambiguous-'))
  const roots = [join(sandbox, 'Portable A'), join(sandbox, 'Portable B')]
  for (const root of roots) {
    portableFixture(root)
    copyFileSync(process.execPath, join(root, 'runtime', 'node', 'node.exe'))
  }
  const sleepers = roots.map(root => spawn(join(root, 'runtime', 'node', 'node.exe'), [
    '-e', 'setTimeout(() => {}, 15000)',
    join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  ], { stdio: 'ignore' }))
  try {
    await new Promise(resolve => setTimeout(resolve, 300))
    const result = autoDryRunResult('Install', {
      USERPROFILE: join(sandbox, 'unused-user'),
      LOCALAPPDATA: join(sandbox, 'unused-local-app-data'),
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /more than one running DSH-Portable/iu)
    for (const root of roots) assert.equal(result.stderr.includes(root), true)
  } finally {
    const exits = sleepers.map(sleeper => once(sleeper, 'exit'))
    for (const sleeper of sleepers) sleeper.kill()
    await Promise.all(exits)
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('auto-discovery stops when global and portable installations are both plausible', () => {
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
