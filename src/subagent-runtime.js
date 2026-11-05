import { createRequire } from 'node:module'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { SUBAGENT_CODEX_VERSION } from './subagent-cli.js'
export { SUBAGENT_CODEX_VERSION } from './subagent-cli.js'

export const SUBAGENT_RUNTIME_PACKAGE = '@deepseek-ai/dsh-subagent-codex'
export const SUBAGENT_RUNTIME_VERSION = '0.2.2-rc.1'
export const SUPPORTED_RUNTIME_VERSIONS = Object.freeze(['0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-alpha.1', '0.2.1-alpha.2', '0.2.1-alpha.3', '0.2.1-alpha.4', '0.2.1-alpha.5', '0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.3', '0.2.1-rc.4', '0.2.1-rc.5', '0.2.2-alpha.2', '0.2.2-alpha.3', SUBAGENT_RUNTIME_VERSION])
const require = createRequire(import.meta.url)
const execute = promisify(execFile)

/** The DSH release this plugin is loaded into, read from the host's own LLM package. */
// A desktop build bundles DSH next to its host entry, not next to this plugin,
// so prefer the actual host entry over an auto-installed plugin peer copy.
export function hostDshVersion(resolve = require.resolve, entry = process.argv[1]) {
  const attempts = []
  if (typeof entry === 'string' && entry) attempts.push(() => require.resolve('@deepseek-ai/dsh-llm/package.json', { paths: [dirname(realpathSync(entry))] }))
  attempts.push(() => resolve('@deepseek-ai/dsh-llm/package.json'))
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

// Reuse the host-matching official provider and protocol with the dedicated CLI.
// Never search PATH or a desktop application's private files.
export function inspectSubagentRuntime(resolve = require.resolve, cli) {
  try {
    const manifestPath = resolve(`${SUBAGENT_RUNTIME_PACKAGE}/package.json`)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (!SUPPORTED_RUNTIME_VERSIONS.includes(manifest.version) || manifest.version !== matchingSubagentRuntimeVersion(resolve)) return { installed: false, present: true }
    return { installed: cli?.inspect().installed === true, present: true, adapterInstalled: true }
  } catch { return { installed: false } }
}

export async function loadSubagentRuntime({ resolve = require.resolve, cli, run = execute, importModule = url => import(url), platform = process.platform } = {}) {
  if (!inspectSubagentRuntime(resolve, cli).installed) throw new Error('Codex subtask runtime is not prepared')
  const entry = resolve(SUBAGENT_RUNTIME_PACKAGE)
  const providerRequire = createRequire(entry)
  const { wrapper } = cli.inspect()
  try {
    const { stdout } = await run(process.execPath, [wrapper, '--version'], { timeout: 10000, maxBuffer: 4096, windowsHide: true })
    if (stdout.trim() !== `codex-cli ${SUBAGENT_CODEX_VERSION}`) throw new Error('Unexpected CLI version')
  } catch { throw new Error('Codex subtask runtime is incomplete; prepare it for this platform') }
  const [official, { JsonRpcLineTransport: Transport }] = await Promise.all([
    importModule(pathToFileURL(entry).href),
    importModule(pathToFileURL(providerRequire.resolve('@deepseek-ai/dsh-sdk-protocol')).href),
  ])
  // Standalone Codex does not enable a Windows sandbox by default. Prefer the
  // official desktop's MXC isolation; unsupported machines retain Codex's own
  // configured legacy sandbox or fail closed. Never disable confinement.
  return { official, Transport, argv: [process.execPath, wrapper, 'app-server', '--listen', 'stdio://', '-c', 'features.apps=false', '-c', 'features.plugins=false',
    ...(platform === 'win32' ? ['-c', 'features.prefer_mxc=true'] : [])] }
}
