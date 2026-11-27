import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { pinOfficialCohort } from './pin-official-cohort.mjs'

assert.equal(process.platform, 'linux')
assert.equal(process.version, 'v24.22.2')
const source = fileURLToPath(new URL('../../', import.meta.url))
const candidate = resolve(process.argv[2])
const fixtureDependencies = resolve(process.argv[3])
const output = resolve(process.argv[4])
const root = await mkdtemp(join(process.env.RUNNER_TEMP ?? '/tmp', 'dsh-linux-transport-'))
const runner = join(root, 'runner'), home = join(root, 'home')
await Promise.all([mkdir(runner), mkdir(home), mkdir(output, { recursive: true })])
const version = '0.2.2-rc.5', sdkVersion = '1.5.2'
const env = { ...process.env, DSH_HOME: home, OPENAI_CODEX_SUBSCRIPTION_OAUTH: '', WSL043_OPENAI_CODEX_OAUTH: '',
  DSH_TRANSPORT_REPORT_DIR: output, DSH_TRANSPORT_TEST_MODEL: 'gpt-6.2-sol' }
const run = (command, args, cwd = source) => new Promise((done, reject) => {
  const process = spawn(command, args, { cwd, env, stdio: 'inherit' })
  process.on('error', reject)
  process.on('exit', code => code === 0 ? done() : reject(new Error(`Acceptance command failed (${code})`)))
})
await writeFile(join(runner, 'package.json'), JSON.stringify({ private: true, dependencies: { '@deepseek-ai/dsh': version, '@earendil-works/pi-ai': sdkVersion } }))
await pinOfficialCohort(runner, version)
const workspace = JSON.parse(await readFile(join(runner, 'pnpm-workspace.yaml'), 'utf8'))
workspace.overrides['@earendil-works/pi-ai'] = sdkVersion
await writeFile(join(runner, 'pnpm-workspace.yaml'), JSON.stringify(workspace))
await run('pnpm', ['--dir', runner, '--config.minimum-release-age=0', 'add', '--save-exact',
  '--allow-build=@deepseek-ai/dsh-subprocess-local', '--allow-build=@google/genai', '--allow-build=fs-ext',
  '--allow-build=koffi', '--allow-build=node-pty', '--allow-build=protobufjs', '@deepseek-ai/dsh@' + version, '@earendil-works/pi-ai@' + sdkVersion])
const dshPackage = join(runner, 'node_modules/@deepseek-ai/dsh/package.json')
// Read the pinned root manifest directly: pi-ai 1.5.2 exposes import-only
// entrypoints, so CommonJS require.resolve is not a valid metadata probe.
// The Web RPC assertion below verifies the version actually loaded by DSH.
const sdk = JSON.parse(await readFile(join(runner, 'node_modules/@earendil-works/pi-ai/package.json'), 'utf8'))
const dsh = JSON.parse(await readFile(dshPackage, 'utf8'))
assert.equal(dsh.version, version); assert.equal(sdk.version, sdkVersion)
const cohort = { node: process.version, platform: process.platform, arch: process.arch, dsh: dsh.version, piAi: sdk.version,
  realAccount: false, syntheticStreams: true, wireModel: 'gpt-6.2-sol' }
await writeFile(join(output, 'cohort.json'), JSON.stringify(cohort, null, 2))
const baseline = join(root, 'published-connection.js')
await writeFile(baseline, execFileSync('git', ['show', 'v3.2.34:src/subscription-connection.js'], { cwd: source }))
const before = spawnSync(process.execPath, [join(source, '.github/scripts/test-official-runtime.mjs'), runner, fixtureDependencies,
  '--test-name-pattern', 'another conversation streaming', 'tests/subscription-recovery.test.mjs'],
{ cwd: source, env: { ...env, DSH_TEST_CONNECTION_BASELINE: baseline }, encoding: 'utf8' })
assert.ifError(before.error)
await writeFile(join(output, 'published-baseline.log'), before.stdout + before.stderr)
assert.equal(before.status, 1, 'published baseline must reproduce the regression')
assert.match(before.stdout + before.stderr, /probe-busy/u)
assert.match(before.stdout + before.stderr, /ws-probe/u)
await writeFile(join(output, 'regression.json'), JSON.stringify({ published: '3.2.34', baselineReproduced: true,
  defect: 'another conversation streaming SSE defers a different idle scope probe', realAccount: false }, null, 2))
await run(process.execPath, [join(source, '.github/scripts/test-official-runtime.mjs'), runner, fixtureDependencies])
const cli = join(runner, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
await run(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', candidate, '--allow-build=@google/genai', '--allow-build=protobufjs'])

const child = spawn(process.execPath, [cli, '--profile', 'web', '--no-open', '--port', '0'], { cwd: runner, env, stdio: ['ignore', 'pipe', 'pipe'] })
let stdout = '', stderr = ''
child.stdout.on('data', data => { stdout = (stdout + data).slice(-100000) })
child.stderr.on('data', data => { stderr = (stderr + data).slice(-100000) })
const closed = once(child, 'exit')
const redact = text => text.replace(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/gu, '[owner link redacted]')
try {
  const deadline = Date.now() + 45000
  let url
  while (Date.now() < deadline) {
    url = stdout.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/u)?.[0]
    if (url) break
    if (child.exitCode !== null) throw new Error('Official Web host exited before readiness')
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.ok(url, 'Official Web host did not reach readiness')
  const origin = new URL(url).origin
  const auth = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
  const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  const rpc = async (method, payload = {}) => {
    const response = await fetch(origin + '/api/codex-subscription/' + method, { method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'linux-acceptance', method: 'codex-subscription/' + method, payload }) })
    assert.equal(response.status, 200)
    const result = (await response.json()).result
    assert.equal(result.ok, true)
    return result.value
  }
  let status
  for (let attempt = 0; attempt < 50; attempt++) {
    try { status = await rpc('status'); break } catch (error) {
      if (attempt === 49) throw error
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  assert.equal(status.authenticated, false)
  await rpc('preferences/update', { connectionMode: 'websocket' })
  assert.equal((await rpc('preferences/status')).connectionMode, 'websocket')
  const report = await rpc('diagnostics')
  assert.equal(report.runtime.piAi, sdkVersion)
  assert.equal(report.runtime.dsh, version)
  const expected = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).version
  assert.equal(report.version, expected)
  await writeFile(join(output, 'official-web.json'), JSON.stringify({ ...cohort, plugin: report.version, nativeWebReady: true,
    subscriptionRpcReady: true, signedOut: true, connectionPreferenceWritable: true, websocket: report.websocket }, null, 2))
  console.log('Official Linux Web host and pinned SDK transport acceptance passed (synthetic streams; no real account).')
} finally {
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000)
  await closed.catch(() => {})
  clearTimeout(timer)
  await writeFile(join(output, 'web-startup.log'), redact(stdout + '\n' + stderr))
}
await writeFile(join(process.env.RUNNER_TEMP, 'dsh-linux-transport-context.json'), JSON.stringify({ runner, home, output }))
