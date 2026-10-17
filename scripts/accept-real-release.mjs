#!/usr/bin/env node
// Real-account acceptance of the packed plugin on one official DSH version, in a throwaway home:
//   node scripts/accept-real-release.mjs --dsh-version 0.2.1-rc.2
// It packs this checkout, installs that DSH from npm, adds the packed plugin with DSH's own
// `plugin add`, starts DSH Web with the signed-in acceptance credentials, runs the scripted phone
// suite (real chat, image, search, compaction, fork, reconnect...) and removes everything.
// Credentials are copied from %LOCALAPPDATA%/dsh-codex-acceptance/home (or --credentials <home>) and
// are never printed. Needs network, a signed-in ChatGPT account there, and Node on PATH.
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1] }
const dshVersion = argument('--dsh-version')
if (dshVersion === undefined) { console.error('usage: node scripts/accept-real-release.mjs --dsh-version <version> [--credentials <home>] [--keep]'); process.exit(2) }
const credentialsHome = argument('--credentials') ?? join(process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), 'dsh-codex-acceptance', 'home')
for (const file of ['.credentials.yaml', '.anonymous-user-id']) {
  if (!existsSync(join(credentialsHome, file))) { console.error(`missing ${file} in ${credentialsHome}; sign in once in the acceptance home first`); process.exit(2) }
}

const windows = process.platform === 'win32'
const work = mkdtempSync(join(tmpdir(), 'dsh-real-accept-'))
const home = join(work, 'home')
const tools = join(work, 'tools')
const pack = join(work, 'pack')
const toolsBin = join(tools, 'node_modules', '.bin')
const env = { ...process.env, PATH: `${toolsBin}${windows ? ';' : ':'}${process.env.PATH}`, DSH_HOME: home }
let server

const step = label => console.log(`\n# ${label}`)
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: options.cwd ?? work, env: options.env ?? env, encoding: 'utf8', shell: windows, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${`${result.stdout ?? ''}${result.stderr ?? ''}`.split('\n').slice(-12).join('\n')}`)
  }
  return result.stdout
}
const cleanup = () => {
  try { server?.kill() } catch {}
  if (process.argv.includes('--keep')) { console.log(`kept ${work}`); return }
  try { rmSync(work, { recursive: true, force: true }) } catch (error) { console.error(`could not remove ${work}: ${error.message}`) }
}
process.on('exit', cleanup)
process.on('SIGINT', () => process.exit(130))

try {
  step('prepare a clean DSH home')
  mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
  mkdirSync(pack, { recursive: true })
  mkdirSync(tools, { recursive: true })
  for (const file of ['.credentials.yaml', '.anonymous-user-id']) cpSync(join(credentialsHome, file), join(home, file))
  writeFileSync(join(home, 'profiles', 'package.json'), '{"name":"p","private":true}')
  writeFileSync(join(tools, 'package.json'), '{"name":"t","private":true}')

  step('install pnpm (used by DSH plugin add) and DSH ' + dshVersion)
  run('npm', ['install', '--no-audit', '--no-fund', 'pnpm@11.26.0'], { cwd: tools })
  run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', `@deepseek-ai/dsh@${dshVersion}`], { cwd: join(home, 'profiles') })

  step('pack this checkout')
  run('pnpm', ['pack', '--pack-destination', pack], { cwd: root })
  const tarball = readdirSync(pack).find(name => name.endsWith('.tgz'))
  if (tarball === undefined) throw new Error('pnpm pack produced no tarball')

  step('add the packed plugin with DSH')
  const bin = join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  run(process.execPath, [bin, 'plugin', '--profile', 'web', 'add', join(pack, tarball)])

  step('start DSH Web')
  const serverEnv = { ...env, DSH_CODEX_REMOTE_BASE: 'http://127.0.0.1:18770/backend-api/', NO_PROXY: '127.0.0.1,localhost' }
  server = spawn(process.execPath, [bin, 'web', '--no-open', '--port', '18791'], { env: serverEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  server.stdout.on('data', chunk => { log += chunk })
  server.stderr.on('data', chunk => { log += chunk })
  const address = await new Promise((resolveAddress, reject) => {
    const timer = setTimeout(() => reject(new Error(`DSH did not start\n${log.slice(-600)}`)), 120_000)
    const poll = setInterval(() => {
      const match = /http:\/\/\S+/u.exec(log)
      if (match !== null) { clearInterval(poll); clearTimeout(timer); resolveAddress(match[0]) }
    }, 500)
    server.on('exit', code => { clearInterval(poll); clearTimeout(timer); reject(new Error(`DSH exited early (${code})\n${log.slice(-600)}`)) })
  })
  await new Promise(done => setTimeout(done, 10_000))
  if (/skipping profile bundle|Error:/iu.test(log)) throw new Error(`DSH reported a load problem\n${log.slice(-600)}`)

  step('run the real-account suite')
  const suite = spawnSync(process.execPath, [join(root, 'scripts', 'phone-acceptance', 'run.mjs')], {
    cwd: root, env: { ...serverEnv, DSH_URL: address }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  })
  const output = `${suite.stdout ?? ''}${suite.stderr ?? ''}`
  const interesting = output.split('\n').filter(line => !/^\s+ok /u.test(line) && !/delta/u.test(line))
  console.log(interesting.slice(-60).join('\n'))
  const summary = /checked (\d+) messages: (\d+) ok, (\d+) problems/u.exec(output)
  if (summary === null) throw new Error('the suite did not finish')
  // The only expected problems are the two refused command/exec probes ("Not available on a DSH host").
  const lines = output.split('\n')
  const problemLines = lines.flatMap((line, index) => /^\s+(ERROR|FAILED|MISMATCH|INVALID)\b/u.test(line) ? [`${line.trim()} | ${(lines[index + 1] ?? '').trim()}`] : [])
  const unexpected = problemLines.filter(line => !/Not available on a DSH host/u.test(line))
  if (unexpected.length > 0 || Number(summary[3]) > problemLines.length) {
    throw new Error(`unexpected results (${summary[3]} problems reported):\n  ${unexpected.join('\n  ') || '(the suite did not say which)'}`)
  }
  console.log(`\nACCEPTED on DSH ${dshVersion}: ${summary[1]} messages, ${summary[2]} ok, ${problemLines.length} expected refusals`)
} catch (error) {
  console.error(`\nNOT ACCEPTED on DSH ${dshVersion}: ${error.message}`)
  process.exitCode = 1
} finally {
  // The DSH child keeps the event loop alive; leave explicitly so cleanup runs and the command returns.
  process.exit(process.exitCode ?? 0)
}
