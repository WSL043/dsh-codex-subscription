import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export const SUBAGENT_RUNTIME_PACKAGE = '@deepseek-ai/dsh-subagent-codex'
export const SUBAGENT_RUNTIME_VERSION = '0.1.5-rc.2'
const require = createRequire(import.meta.url)
const execute = promisify(execFile)

// Resolve from this plugin's dependency graph, then use the provider's own
// protocol and CLI. Never search PATH or a desktop application's private files.
export function inspectSubagentRuntime(resolve = require.resolve) {
  try {
    const manifestPath = resolve(`${SUBAGENT_RUNTIME_PACKAGE}/package.json`)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.version !== SUBAGENT_RUNTIME_VERSION) return { installed: false }
    return { installed: true }
  } catch { return { installed: false } }
}

export async function loadSubagentRuntime({ resolve = require.resolve, run = execute, importModule = url => import(url) } = {}) {
  if (!inspectSubagentRuntime(resolve).installed) throw new Error('Codex subtask runtime is not prepared')
  const entry = resolve(SUBAGENT_RUNTIME_PACKAGE)
  const providerRequire = createRequire(entry)
  const codexManifestPath = providerRequire.resolve('@openai/codex/package.json')
  const codex = JSON.parse(readFileSync(codexManifestPath, 'utf8'))
  if (codex.version !== '0.153.4' || typeof codex.bin?.codex !== 'string') throw new Error('Codex subtask runtime version is unsupported')
  const wrapper = resolvePath(dirname(codexManifestPath), codex.bin.codex)
  try {
    const { stdout } = await run(process.execPath, [wrapper, '--version'], { timeout: 10000, maxBuffer: 4096, windowsHide: true })
    if (stdout.trim() !== 'codex-cli 0.153.4') throw new Error('Unexpected CLI version')
  } catch { throw new Error('Codex subtask runtime is incomplete; prepare it for this platform') }
  const [official, { JsonRpcLineTransport: Transport }] = await Promise.all([
    importModule(pathToFileURL(entry).href),
    importModule(pathToFileURL(providerRequire.resolve('@deepseek-ai/dsh-sdk-protocol')).href),
  ])
  return { official, Transport }
}
