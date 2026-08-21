import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const installer = new URL('../dsh-codex-setup.ps1', import.meta.url)
const packageSpec = 'dsh-codex-subscription@1.1.4'
const windowsTest = process.platform === 'win32' ? test : test.skip

test('setup remains a thin official DSH CLI launcher', async () => {
  const source = await readFile(installer, 'utf8')

  assert.match(source, /dsh plugin --profile/i)
  assert.match(source, new RegExp(packageSpec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(source, /Get-ChildItem[^\r\n]*-Recurse/i)
  assert.doesNotMatch(source, /api\.github\.com|Invoke-WebRequest|Start-Process|Stop-Process/i)
  assert.doesNotMatch(source, /pnpm|install-state|snapshot|dsh-codex\.cmd/i)
})

test('npm fallback is pinned to the DSH release accepted by this plugin', async () => {
  const source = await readFile(installer, 'utf8')

  assert.match(source, /DshRelease = '0\.1\.0-rc\.8'/u)
  assert.match(source, /first official DSH run may take/i)
})

test('setup is ASCII without a byte-order mark for Windows PowerShell 5.1 irm pipe execution', async () => {
  const bytes = await readFile(installer)
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf])
  assert.equal(bytes.every(byte => byte <= 0x7f), true)
})

windowsTest('explicit DSH path performs exactly one pinned add operation', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'dsh-codex-thin-installer-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const fake = join(fixture, 'dsh.cmd')
  const log = join(fixture, 'args.txt')
  await writeFile(fake, '@echo off\r\n>> "%DSH_INSTALLER_TEST_LOG%" echo %*\r\nexit /b 0\r\n')

  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer.pathname.slice(1),
    '-DshPath', fake, '-Profile', 'web',
  ], {
    cwd: fixture,
    env: { ...process.env, DSH_INSTALLER_TEST_LOG: log },
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const duration = /(?:Installed in|安装完成（)\s*([\d.]+)\s*(?:seconds|秒)/i.exec(result.stdout)
  assert.ok(duration, `setup did not report official-command duration: ${result.stdout}`)
  assert.equal((await readFile(log, 'utf8')).trim(), `plugin --profile web add ${packageSpec}`)
})

windowsTest('PATH discovery works and preserves DSH failures', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'dsh-codex-thin-installer-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  await writeFile(join(fixture, 'dsh.cmd'), '@echo off\r\nexit /b 23\r\n')

  const escapedInstaller = installer.pathname.slice(1).replaceAll("'", "''")
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-Command',
    `function global:Get-CimInstance { @() }; Get-Content -LiteralPath '${escapedInstaller}' -Raw | Invoke-Expression`,
  ], {
    cwd: fixture,
    env: { ...process.env, PATH: `${fixture}${delimiter}${process.env.PATH ?? ''}` },
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stderr}\n${result.stdout}`, /exit code 23/i)
})

windowsTest('official npm users do not need a global dsh command', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'dsh-codex-thin-installer-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const log = join(fixture, 'args.txt')
  await writeFile(join(fixture, 'npx.cmd'), '@echo off\r\n>> "%DSH_INSTALLER_TEST_LOG%" echo %*\r\nexit /b 0\r\n')

  const escapedInstaller = installer.pathname.slice(1).replaceAll("'", "''")
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-Command',
    `function global:Get-CimInstance { @() }; Get-Content -LiteralPath '${escapedInstaller}' -Raw | Invoke-Expression`,
  ], {
    cwd: fixture,
    env: {
      ...process.env,
      PATH: `${fixture}${delimiter}${process.env.PATH ?? ''}`,
      USERPROFILE: fixture,
      DSH_PORTABLE_ROOT: '',
      DSH_INSTALLER_TEST_LOG: log,
    },
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal((await readFile(log, 'utf8')).trim(), `-y @deepseek-ai/dsh@0.1.0-rc.8 plugin --profile web add ${packageSpec}`)
})

windowsTest('a running Portable in an arbitrary folder is used instead of npx', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'dsh-codex-running-portable-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const root = join(fixture, 'unexpected location', 'DSH-Portable')
  const node = join(root, 'runtime', 'node', 'node.exe')
  const dsh = join(root, 'dsh.exe')
  const bin = join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const npxLog = join(fixture, 'npx-args.txt')
  await mkdir(join(root, 'runtime', 'node'), { recursive: true })
  await mkdir(join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib'), { recursive: true })
  await writeFile(node, '')
  await writeFile(bin, '')
  await copyFile(process.env.ComSpec, dsh)
  await writeFile(join(fixture, 'npx.cmd'), '@echo off\r\n>> "%DSH_INSTALLER_TEST_NPX_LOG%" echo %*\r\nexit /b 0\r\n')

  const quote = value => value.replaceAll("'", "''")
  const command = [
    `function global:Get-CimInstance { [CmdletBinding()] param($ClassName, $Filter); [pscustomobject]@{ ExecutablePath = '${quote(node)}'; CommandLine = '\"${quote(node)}\" \"${quote(bin)}\" web' } }`,
    `Get-Content -LiteralPath '${quote(installer.pathname.slice(1))}' -Raw | Invoke-Expression`,
  ].join('; ')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    cwd: fixture,
    env: {
      ...process.env,
      PATH: `${fixture}${delimiter}${process.env.PATH ?? ''}`,
      USERPROFILE: fixture,
      DSH_PORTABLE_ROOT: '',
      DSH_INSTALLER_TEST_NPX_LOG: npxLog,
    },
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, new RegExp(`Target: ${dsh.replaceAll('\\', '\\\\')}`))
  await assert.rejects(readFile(npxLog, 'utf8'), /ENOENT/u)
})

windowsTest('setup lets an interactive user select between two running Portables', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'dsh-codex-running-portables-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const processes = []
  for (const name of ['Portable A', 'Portable B']) {
    const root = join(fixture, name)
    const node = join(root, 'runtime', 'node', 'node.exe')
    const dsh = join(root, 'dsh.exe')
    const bin = join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    await mkdir(join(root, 'runtime', 'node'), { recursive: true })
    await mkdir(join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib'), { recursive: true })
    await writeFile(node, '')
    await copyFile(process.env.ComSpec, dsh)
    await writeFile(bin, '')
    processes.push({ node, bin, dsh })
  }
  const npxLog = join(fixture, 'npx-args.txt')
  await writeFile(join(fixture, 'npx.cmd'), '@echo off\r\n>> "%DSH_INSTALLER_TEST_NPX_LOG%" echo %*\r\nexit /b 0\r\n')

  const quote = value => value.replaceAll("'", "''")
  const processLiterals = processes.map(({ node, bin }) =>
    `[pscustomobject]@{ ExecutablePath = '${quote(node)}'; CommandLine = '\"${quote(node)}\" \"${quote(bin)}\" web' }`).join(', ')
  const command = [
    `function global:Get-CimInstance { [CmdletBinding()] param($ClassName, $Filter); @(${processLiterals}) }`,
    `function global:Read-Host { param($Prompt); '2' }`,
    `Get-Content -LiteralPath '${quote(installer.pathname.slice(1))}' -Raw | Invoke-Expression`,
  ].join('; ')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    cwd: fixture,
    env: {
      ...process.env,
      PATH: `${fixture}${delimiter}${process.env.PATH ?? ''}`,
      USERPROFILE: fixture,
      DSH_PORTABLE_ROOT: '',
      DSH_INSTALLER_TEST_NPX_LOG: npxLog,
    },
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const output = `${result.stderr}\n${result.stdout}`
  assert.match(output, /Choose the DSH-Portable to use/u)
  for (const { dsh } of processes) assert.match(output, new RegExp(dsh.replaceAll('\\', '\\\\')))
  assert.match(output, new RegExp(`Target: ${processes[1].dsh.replaceAll('\\', '\\\\')}`))
  await assert.rejects(readFile(npxLog, 'utf8'), /ENOENT/u)
})

windowsTest('setup offers a stopped nested Downloads Portable beside a running temporary copy', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'dsh-codex-mixed-portables-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const runningRoot = join(fixture, 'AppData', 'Local', 'Temp', 'tool-test', 'DSH-Portable')
  const intendedRoot = join(fixture, 'Downloads', 'DSH-Portable-windows-x64-offline', 'DSH-Portable')
  const makePortable = async root => {
    const node = join(root, 'runtime', 'node', 'node.exe')
    const dsh = join(root, 'dsh.exe')
    const bin = join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    await mkdir(join(root, 'runtime', 'node'), { recursive: true })
    await mkdir(join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib'), { recursive: true })
    await writeFile(node, '')
    await copyFile(process.env.ComSpec, dsh)
    await writeFile(bin, '')
    return { node, dsh, bin }
  }
  const running = await makePortable(runningRoot)
  const intended = await makePortable(intendedRoot)
  const quote = value => value.replaceAll("'", "''")
  const command = [
    `function global:Get-CimInstance { [CmdletBinding()] param($ClassName, $Filter); [pscustomobject]@{ ExecutablePath = '${quote(running.node)}'; CommandLine = '\"${quote(running.node)}\" \"${quote(running.bin)}\" web' } }`,
    `function global:Read-Host { param($Prompt); '2' }`,
    `Get-Content -LiteralPath '${quote(installer.pathname.slice(1))}' -Raw | Invoke-Expression`,
  ].join('; ')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    cwd: fixture,
    env: {
      ...process.env,
      PATH: `${fixture}${delimiter}${process.env.PATH ?? ''}`,
      USERPROFILE: fixture,
      DSH_PORTABLE_ROOT: '',
    },
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const output = `${result.stderr}\n${result.stdout}`
  assert.match(output, /AppData\\Local\\Temp\\tool-test\\DSH-Portable\\dsh\.exe/iu)
  assert.match(output, /Downloads\\DSH-Portable-windows-x64-offline\\DSH-Portable\\dsh\.exe/iu)
  assert.match(output, /Target: .*Downloads\\DSH-Portable-windows-x64-offline\\DSH-Portable\\dsh\.exe/iu)
})

windowsTest('setup stops safely when multiple Portables cannot be selected interactively', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'dsh-codex-running-portables-noninteractive-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const processLiterals = []
  for (const name of ['Portable A', 'Portable B']) {
    const root = join(fixture, name)
    const node = join(root, 'runtime', 'node', 'node.exe')
    const dsh = join(root, 'dsh.exe')
    const bin = join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    await mkdir(join(root, 'runtime', 'node'), { recursive: true })
    await mkdir(join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib'), { recursive: true })
    await writeFile(node, '')
    await writeFile(dsh, '')
    await writeFile(bin, '')
    const quote = value => value.replaceAll("'", "''")
    processLiterals.push(`[pscustomobject]@{ ExecutablePath = '${quote(node)}'; CommandLine = '\"${quote(node)}\" \"${quote(bin)}\" web' }`)
  }

  const quote = value => value.replaceAll("'", "''")
  const command = [
    `function global:Get-CimInstance { [CmdletBinding()] param($ClassName, $Filter); @(${processLiterals.join(', ')}) }`,
    `Get-Content -LiteralPath '${quote(installer.pathname.slice(1))}' -Raw | Invoke-Expression`,
  ].join('; ')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: fixture,
    env: {
      ...process.env,
      PATH: `${fixture}${delimiter}${process.env.PATH ?? ''}`,
      USERPROFILE: fixture,
      DSH_PORTABLE_ROOT: '',
    },
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  const output = `${result.stderr}\n${result.stdout}`
  assert.match(output, /Could not read a selection/u)
  assert.match(output, /-DshPath/u)
})

windowsTest('download-pipe execution is non-interactive and invokes one add', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'dsh-codex-thin-installer-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const log = join(fixture, 'args.txt')
  await writeFile(join(fixture, 'dsh.cmd'), '@echo off\r\n>> "%DSH_INSTALLER_TEST_LOG%" echo %*\r\nexit /b 0\r\n')

  const escaped = installer.pathname.slice(1).replaceAll("'", "''")
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-Command', `Get-Content -LiteralPath '${escaped}' -Raw | Invoke-Expression`,
  ], {
    cwd: fixture,
    env: {
      ...process.env,
      PATH: `${fixture}${delimiter}${process.env.PATH ?? ''}`,
      DSH_INSTALLER_TEST_LOG: log,
    },
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal((await readFile(log, 'utf8')).trim(), `plugin --profile web add ${packageSpec}`)
})
