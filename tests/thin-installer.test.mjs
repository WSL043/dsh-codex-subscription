import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const installer = new URL('../dsh-codex-setup.ps1', import.meta.url)
const packageSpec = 'dsh-codex-subscription@1.0.5'
const windowsTest = process.platform === 'win32' ? test : test.skip

test('setup remains a thin official DSH CLI launcher', async () => {
  const source = await readFile(installer, 'utf8')

  assert.match(source, /dsh plugin --profile/i)
  assert.match(source, new RegExp(packageSpec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(source, /Get-ChildItem[^\r\n]*-Recurse/i)
  assert.doesNotMatch(source, /api\.github\.com|Invoke-WebRequest|Start-Process|Stop-Process/i)
  assert.doesNotMatch(source, /pnpm|install-state|snapshot|dsh-codex\.cmd/i)
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

  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer.pathname.slice(1),
  ], {
    cwd: fixture,
    env: { ...process.env, PATH: `${fixture}${delimiter}${process.env.PATH ?? ''}` },
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stderr}\n${result.stdout}`, /exit code 23/i)
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
