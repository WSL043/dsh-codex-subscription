import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chmod, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compactDiagnostic } from '../../src/diagnostic-compact.js'

assert.equal(process.platform, 'linux')
const root = JSON.parse(await readFile(join(process.env.RUNNER_TEMP, 'dsh-linux-transport-context.json'), 'utf8'))
assert.ok(root.home.startsWith(resolve(process.env.RUNNER_TEMP) + '/dsh-linux-transport-'))
const token = process.env.DSH_LIVE_CODEX_ACCESS_TOKEN
assert.ok(typeof token === 'string' && token.length > 100, 'A temporary access-only secret is required')
let claims
try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) } catch { throw new Error('Unsupported access token format') }
assert.ok(Number.isFinite(claims.exp) && claims.exp * 1000 > Date.now() + 600000, 'Access token must remain valid for at least ten minutes')
const source = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(await realpath(join(root.runner, 'node_modules/@deepseek-ai/dsh/package.json')))
const yaml = require('js-yaml')
const credentialFile = join(root.home, '.credentials.yaml'), patchFile = join(root.home, 'profiles/web/cordis.patch.yml')
const originalCredentials = await readFile(credentialFile, 'utf8').catch(() => undefined)
const originalPatch = await readFile(patchFile, 'utf8')
const pluginEntry = await realpath(join(root.home, 'profiles/web/node_modules/dsh-codex-subscription/lib/index.js'))
const originalEntry = await readFile(pluginEntry, 'utf8')
const importPattern = /import WebSocket from "ws";/u
assert.ok(importPattern.test(originalEntry), 'The wire observer must attach to the installed entry')
const observedEntry = originalEntry.replace(importPattern, 'import NativeWireSocket from "ws";\nconst WebSocket = globalThis[Symbol.for("dsh-linux-live-control")].wrapSocket(NativeWireSocket);')
// Loader-owned ESM/CJS caches differ. Bind the observer at the compiled import,
// without changing connection policy or modifying a pnpm hardlink in place.
const replaceEntry = async text => { const temporary = pluginEntry + '.live-observer'; await writeFile(temporary, text); await rename(temporary, pluginEntry) }
const credentials = originalCredentials ? yaml.load(originalCredentials) : { version: 1, records: {}, refs: {} }
credentials.records['codex-subscription/accounts'] = { kind: 'grant', payload: { version: 1, activeId: 'linux-live', accounts: [{
  id: 'linux-live', label: 'Linux verification', credential: { type: 'oauth', access: token, expires: claims.exp * 1000,
    refresh: 'unused-no-refresh-permitted', accountId: claims['https://api.openai.com/auth']?.chatgpt_account_id },
}] } }
const patch = yaml.load(originalPatch)
assert.ok(Array.isArray(patch))
patch.push({ insert: [{ id: 'linux-live-transport-probe', name: join(source, '.github/scripts/linux-live-probe.cjs') }] })
const resultFile = join(root.home, 'live-result.json'), workspace = join(root.home, 'live-workspace')
await mkdir(workspace, { recursive: true })
const { DSH_LIVE_CODEX_ACCESS_TOKEN: _drop, ...cleanEnv } = process.env
const env = { ...cleanEnv, DSH_HOME: root.home, DSH_LIVE_RESULT: resultFile, DSH_LIVE_WORKSPACE: workspace,
  DSH_LIVE_PLUGIN_PACKAGE: join(root.home, 'profiles/web/node_modules/dsh-codex-subscription/package.json') }
let child, closed, stdout = '', stderr = ''
try {
  if (originalCredentials !== undefined) await chmod(credentialFile, 0o600)
  await writeFile(credentialFile, yaml.dump(credentials), { mode: 0o600 })
  await writeFile(patchFile, yaml.dump(patch))
  await replaceEntry(observedEntry)
  child = spawn(process.execPath, ['--require', join(source, 'tests/helpers/linux-live-transport-control.cjs'),
    join(root.runner, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'web', '--no-open', '--port', '0'],
  { cwd: root.runner, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  closed = once(child, 'exit')
  child.stdout.on('data', data => { stdout = (stdout + data).slice(-100000) })
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-100000) }) // Inspect in memory only; never publish raw errors.
  const deadline = Date.now() + 180000
  let report, stage
  while (Date.now() < deadline) {
    report = await readFile(resultFile, 'utf8').then(JSON.parse).catch(() => undefined)
    if (report && report.stage !== stage && /^[a-z0-9-]{1,48}$/.test(report.stage)) { stage = report.stage; console.log('Live Linux phase: ' + stage) }
    if (report?.passed !== undefined) break
    if (child.exitCode !== null) break
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  const startup = { ownerReady: /http:\/\/127\.0\.0\.1:\d+\/\?token=/u.test(stdout),
    childExited: child.exitCode !== null, probeMentioned: (stdout + stderr).includes('linux-live-transport-probe'),
    missingModule: /MODULE_NOT_FOUND|Cannot find module/u.test(stdout + stderr),
    pluginFailed: /failed|Error:|error\]/iu.test(stdout + stderr) }
  await writeFile(join(root.output, 'live-linux.json'), JSON.stringify(report ?? { passed: false, realAccount: true, code: 'NO_LIVE_RESULT', startup }, null, 2))
  assert.equal(report?.passed, true, 'Live Linux acceptance did not pass; see redacted phase report')
  const url = stdout.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/u)?.[0]
  assert.ok(url)
  const origin = new URL(url).origin, auth = await fetch(url, { redirect: 'manual' })
  const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  const response = await fetch(origin + '/api/codex-subscription/diagnostics', { method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'live-check', method: 'codex-subscription/diagnostics', payload: {} }) })
  const diagnostic = (await response.json()).result
  assert.equal(diagnostic.ok, true)
  const support = compactDiagnostic(diagnostic.value)
  assert.equal(support.runtime.piAi, '1.5.2'); assert.equal(support.runtime.dsh, '0.2.2-rc.5')
  assert.ok(support.websocket.recoverySuccesses >= 1)
  assert.ok(support.network.some(value => value.websocketFailure === 'HTTP_REJECTED' && value.websocketHttpStatus === 502))
  await writeFile(join(root.output, 'live-support.json'), JSON.stringify(support, null, 2))
  console.log('Live 6.2 Sol native-agent and parallel-SSE recovery checks passed.')
} finally {
  if (child?.pid) {
    try { process.kill(-child.pid, 'SIGTERM') } catch {}
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, 10000)
    await closed?.catch(() => {}); clearTimeout(timer)
  }
  await writeFile(credentialFile, originalCredentials ?? yaml.dump({ version: 1, records: {}, refs: {} }), { mode: 0o600 })
  await writeFile(patchFile, originalPatch)
  await replaceEntry(originalEntry)
}
