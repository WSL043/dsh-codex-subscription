import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const SUBAGENT_CLI_ALIAS = 'dsh-codex-subtask-cli'
export const SUBAGENT_CODEX_VERSION = '0.166.0'
export const SUBAGENT_CLI_SPEC = `${SUBAGENT_CLI_ALIAS}@npm:@openai/codex@${SUBAGENT_CODEX_VERSION}`
const spec = `npm:@openai/codex@${SUBAGENT_CODEX_VERSION}`

/** A profile-owned alias, never the host CLI, PATH, or another app's installation. */
export function createSubagentCli({ profile, loadOperations = async value => {
  const path = createRequire(value.installAnchor).resolve('@deepseek-ai/dsh-plugin-manager/operations')
  return import(pathToFileURL(path).href)
} }) {
  function inspect() {
    const value = profile()
    if (!value?.dir || !value.installAnchor) return { available: false, installed: false, owned: false }
    try {
      const manifestPath = resolve(value.dir, 'package.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const dependency = manifest.dependencies?.[SUBAGENT_CLI_ALIAS]
      const owned = typeof dependency === 'string' && /^npm:@openai\/codex@\d+\.\d+\.\d+$/u.test(dependency)
      if ((dependency !== undefined && !owned) || ['devDependencies', 'optionalDependencies', 'peerDependencies'].some(field => Object.hasOwn(manifest[field] ?? {}, SUBAGENT_CLI_ALIAS))) {
        return { available: false, installed: false, owned: false }
      }
      if (!owned) return { available: true, installed: false, owned: false }
      try {
        const path = createRequire(manifestPath).resolve(`${SUBAGENT_CLI_ALIAS}/package.json`)
        const cli = JSON.parse(readFileSync(path, 'utf8'))
        const installed = dependency === spec && cli.name === '@openai/codex' && cli.version === SUBAGENT_CODEX_VERSION && cli.bin?.codex === 'bin/codex.js'
        return { available: true, owned, installed, ...(installed ? { wrapper: resolve(dirname(path), cli.bin.codex) } : {}) }
      } catch { return { available: true, owned, installed: false } }
    } catch { return { available: true, owned: false, installed: false } }
  }
  return {
    inspect,
    async change(action, signal) {
      if (!['install', 'remove'].includes(action)) throw Error('invalid-action')
      const state = inspect()
      if (!state.available) throw Error('unavailable')
      if (action === 'remove' && !state.owned) return
      const value = profile(), { runPluginCommand } = await loadOperations(value)
      if (typeof runPluginCommand !== 'function') throw Error('unavailable')
      signal.throwIfAborted()
      // The native operation owns the profile lock, supply-chain rules, logs and
      // manifest reconciliation. Plain dependencies are not activated as bundles.
      const result = await runPluginCommand({ ...value, profile: value.name },
        action === 'install' ? ['add', '--save-exact', '--ignore-scripts', SUBAGENT_CLI_SPEC] : ['remove', SUBAGENT_CLI_ALIAS],
        { ...value.packageManager, execution: 'service', signal, outputBytes: 16_384, activateNewBundles: false, lockWaitMs: 10_000, idleTimeoutMs: 120_000 })
      signal.throwIfAborted()
      if (result.exitCode !== 0 || result.timedOut) throw Error('operation-error')
      if (action === 'install' && !inspect().installed) throw Error('operation-error')
    },
  }
}
