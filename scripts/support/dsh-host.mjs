// Throwaway real DSH host for scripts (the same recipe as scripts/accept-real-release.mjs):
// install an official DSH from npm into a temp dir, add this checkout's packed plugin with DSH's
// own `plugin add`, and start `dsh web` on a free port with copied signed-in credentials.
// Credentials are copied, never modified, and never printed.
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const windows = process.platform === 'win32'

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)) })
  })
}

export async function startHost({ root, dshVersion, credentialsHome, keep = false, log = console.log }) {
  for (const file of ['.credentials.yaml', '.anonymous-user-id']) {
    if (!existsSync(join(credentialsHome, file))) throw new Error(`missing ${file} in ${credentialsHome}; sign in once in that home first`)
  }
  const work = mkdtempSync(join(tmpdir(), 'dsh-ui-smoke-'))
  const home = join(work, 'home')
  const tools = join(work, 'tools')
  const pack = join(work, 'pack')
  const toolsBin = join(tools, 'node_modules', '.bin')
  const env = { ...process.env, PATH: `${toolsBin}${windows ? ';' : ':'}${process.env.PATH}`, DSH_HOME: home }
  let server
  let output = ''
  const run = (command, args, cwd) => {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', shell: windows, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${`${result.stdout ?? ''}${result.stderr ?? ''}`.split('\n').slice(-12).join('\n')}`)
  }
  const stop = () => {
    try { server?.kill() } catch {}
    if (keep) { log(`kept ${work}`); return }
    try { rmSync(work, { recursive: true, force: true }) } catch (error) { console.error(`could not remove ${work}: ${error.message}`) }
  }
  try {
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    mkdirSync(pack, { recursive: true })
    mkdirSync(tools, { recursive: true })
    for (const file of ['.credentials.yaml', '.anonymous-user-id']) cpSync(join(credentialsHome, file), join(home, file))
    writeFileSync(join(home, 'profiles', 'package.json'), '{"name":"p","private":true}')
    writeFileSync(join(tools, 'package.json'), '{"name":"t","private":true}')

    log(`# install pnpm and DSH ${dshVersion}`)
    run('npm', ['install', '--no-audit', '--no-fund', 'pnpm@11.26.0'], tools)
    run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', `@deepseek-ai/dsh@${dshVersion}`], join(home, 'profiles'))

    log('# pack this checkout')
    run('pnpm', ['pack', '--pack-destination', pack], root)
    const tarball = readdirSync(pack).find(name => name.endsWith('.tgz'))
    if (tarball === undefined) throw new Error('pnpm pack produced no tarball')

    log('# add the packed plugin with DSH')
    const bin = join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    run(process.execPath, [bin, 'plugin', '--profile', 'web', 'add', join(pack, tarball)], work)

    log('# start DSH Web')
    const port = await freePort()
    server = spawn(process.execPath, [bin, 'web', '--no-open', '--port', String(port)], { env: { ...env, NO_PROXY: '127.0.0.1,localhost' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stdout.on('data', chunk => { output += chunk })
    server.stderr.on('data', chunk => { output += chunk })
    const address = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`DSH did not start\n${output.slice(-600)}`)), 120_000)
      const poll = setInterval(() => {
        const match = /http:\/\/\S+/u.exec(output)
        if (match !== null) { clearInterval(poll); clearTimeout(timer); resolve(match[0]) }
      }, 500)
      server.on('exit', code => { clearInterval(poll); clearTimeout(timer); reject(new Error(`DSH exited early (${code})\n${output.slice(-600)}`)) })
    })
    await new Promise(done => setTimeout(done, 8_000))
    return {
      address, home, work, modules: join(home, 'profiles', 'node_modules'), stop,
      serverLog: () => output,
    }
  } catch (error) {
    stop()
    throw error
  }
}
