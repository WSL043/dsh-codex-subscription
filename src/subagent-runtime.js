import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export const SUBAGENT_RUNTIME_PACKAGE = '@deepseek-ai/dsh-subagent-codex'
export const SUBAGENT_RUNTIME_VERSION = '0.2.0-rc.2'
export const SUPPORTED_RUNTIME_VERSIONS = Object.freeze(['0.1.7-rc.2', '0.2.0-rc.1', SUBAGENT_RUNTIME_VERSION, '0.2.1-alpha.1'])
const require = createRequire(import.meta.url)
const execute = promisify(execFile)

/** The DSH release this plugin is loaded into, read from the host's own LLM package. */
// A desktop build bundles DSH next to its host entry, not next to this plugin,
// so also resolve from the host process's entry script.
export function hostDshVersion(resolve = require.resolve, entry = process.argv[1]) {
  const attempts = [() => resolve('@deepseek-ai/dsh-llm/package.json')]
  if (typeof entry === 'string' && entry) attempts.push(() => require.resolve('@deepseek-ai/dsh-llm/package.json', { paths: [dirname(entry)] }))
  for (const attempt of attempts) {
    try {
      const { version } = JSON.parse(readFileSync(attempt(), 'utf8'))
      if (typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) return version
    } catch {}
  }
  return undefined
}

// The official component declares exact DSH cohort peers. Installing the
// newest component into an older host can appear to succeed but fail at load.
export function matchingSubagentRuntimeVersion(resolve = require.resolve) {
  const version = hostDshVersion(resolve, resolve === require.resolve ? process.argv[1] : '')
  return SUPPORTED_RUNTIME_VERSIONS.includes(version) ? version : undefined
}

// Resolve from this plugin's dependency graph, then use the provider's own
// protocol and CLI. Never search PATH or a desktop application's private files.
export function inspectSubagentRuntime(resolve = require.resolve) {
  try {
    const manifestPath = resolve(`${SUBAGENT_RUNTIME_PACKAGE}/package.json`)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (!SUPPORTED_RUNTIME_VERSIONS.includes(manifest.version) || manifest.version !== matchingSubagentRuntimeVersion(resolve)) return { installed: false, present: true }
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
