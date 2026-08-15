import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import test from 'node:test'

const script = new URL('../dsh-codex.ps1', import.meta.url)
const windowsTest = process.platform === 'win32' ? test : test.skip

test('package discovery tolerates an empty pnpm dependency object in strict mode', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(script, 'utf8'))
  assert.match(source, /PSObject\.Properties\['dependencies'\]/u)
  assert.doesNotMatch(source, /\$project\.dependencies/u)
  const discovery = source.slice(
    source.indexOf('function Get-InstalledPackageNames'),
    source.indexOf('$target = Get-ManagerTarget'),
  )
  assert.match(discovery, /\$parsedProjects = \$json \| ConvertFrom-Json/u)
  assert.match(discovery, /\$projects = @\(\$parsedProjects\)/u)
  assert.doesNotMatch(discovery, /@\(\$json \| ConvertFrom-Json\)/u)
  assert.doesNotMatch(discovery, /System\.Collections\.Generic\.List\[string\]/u)
  assert.match(discovery, /Write-Output \(\[string\] \$property\.Name\)/u)
})

test('install and update replace an existing package through DSH before adding the pinned asset', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(script, 'utf8'))
  const actionFlow = source.slice(
    source.indexOf('$hadLegacyPackage = $installedBefore -contains $LegacyPackageName'),
    source.indexOf('$config = Invoke-DshCommand'),
  )
  const updateBranch = actionFlow.slice(actionFlow.indexOf('    } else {'))
  assert.match(updateBranch, /if \(\$hadPackage\)[\s\S]*-SelectedAction 'Uninstall'[\s\S]*\$PackageName/u)
  assert.match(updateBranch, /Invoke-DshCommand -Target \$target -Arguments \$actionArguments/u)
  assert.ok(updateBranch.indexOf("-SelectedAction 'Uninstall'") < updateBranch.indexOf('Invoke-DshCommand -Target $target -Arguments $actionArguments'))
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
fs.mkdirSync(path.dirname(stateFile), { recursive: true })
const packages = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {}
if (args.includes('--dump-config')) {
  if (packages['dsh-codex-subscription']) process.stdout.write('codex-subscription\n')
  process.exit(0)
}
if (args[0] !== 'plugin') process.exit(2)
const command = args[3]
if (command === 'list') {
  process.stdout.write(JSON.stringify([{ dependencies: packages }]))
} else if (command === 'add') {
  packages['dsh-codex-subscription'] = { version: '0.2.4' }
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
    assert.equal(existsSync(join(commandRoot, 'dsh-codex.ps1')), true)
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
    assert.equal(existsSync(join(commandRoot, 'dsh-codex.ps1')), false)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex.cmd')), false)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
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
  const server = createServer((request, response) => {
    if (request.url === '/latest') {
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

windowsTest('portable install uses the bundled CLI and portable DSH_HOME', () => {
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
    assert.equal(plan.pnpmStore, join(expectedRoot, 'data', 'runtime', 'dsh-codex-tools', 'pnpm-store-v11'))
    assert.deepEqual(plan.arguments, [
      join(expectedRoot, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      'plugin', '--profile', 'web', 'add',
      'https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.4/dsh-codex-subscription.tgz',
      '--store-dir', join(expectedRoot, 'data', 'runtime', 'dsh-codex-tools', 'pnpm-store-v11'),
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
    assert.equal(plan.arguments.includes('https://github.com/WSL043/dsh-codex-subscription/releases/download/v0.2.4/dsh-codex-subscription.tgz'), true)
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
      '--store-dir', join(expectedRoot, 'data', 'runtime', 'dsh-codex-tools', 'pnpm-store-v11'),
      '--loglevel', 'error',
    ])
    assert.equal(plan.removesProfile, false)
    assert.equal(plan.legacyPackageName, '@wsl043/dsh-codex-subscription')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

windowsTest('auto-discovery finds a running portable root with spaces in its path', async () => {
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
    const expectedRoot = realpathSync.native(root)
    const plan = autoDryRun('Install', {
      USERPROFILE: join(sandbox, 'unused-user'),
      LOCALAPPDATA: join(sandbox, 'unused-local-app-data'),
    })
    assert.equal(plan.mode, 'portable')
    assert.equal(plan.executable, join(expectedRoot, 'runtime', 'node', 'node.exe'))
    assert.equal(plan.dshHome, join(expectedRoot, 'data', 'dsh-home'))
  } finally {
    const exit = once(sleeper, 'exit')
    sleeper.kill()
    await exit
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

windowsTest('auto-discovery stops instead of choosing between two running portable roots', async () => {
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
    for (const root of roots) assert.equal(result.stderr.includes(realpathSync.native(root)), true)
  } finally {
    const exits = sleepers.map(sleeper => once(sleeper, 'exit'))
    for (const sleeper of sleepers) sleeper.kill()
    await Promise.all(exits)
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
