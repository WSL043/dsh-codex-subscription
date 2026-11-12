import { mkdir } from 'node:fs/promises'
import { authenticatedSubagentChild, createSubagentTokens } from './subagent-auth.js'
import { resolveCodexOAuthProxy } from './oauth-network.js'
import { compareVersions } from './dsh-compatibility.js'

export const SUBAGENT_BACKEND_FIELD = 'subagentBackend'
export const SUBAGENT_PROVIDER = 'codex-subscription-subagent'
const MODES = new Set(['read-only', 'workspace-write', 'danger-full-access'])

export function subagentThreadPolicy(parent, policy, requested = {}, platform = process.platform) {
  if (!MODES.has(policy?.mode)) throw new Error('DSH subagent sandbox policy is unavailable')
  const selected = parent.session.requestHeader?.()?.config ?? parent.options ?? {}
  for (const key of Object.keys(requested)) {
    if (!['provider', 'model', 'reasoningEffort'].includes(key)) throw new Error('Unsupported Codex child option: ' + key)
  }
  if (requested.provider !== undefined && requested.provider !== 'openai-codex') throw new Error('Codex subtasks require the openai-codex provider')
  const model = requested.model ?? (selected.provider === 'openai-codex' ? selected.model : undefined)
  if (typeof model !== 'string' || !model.trim()) throw new Error('Select an openai-codex model for this subtask; the parent model cannot be inherited')
  const effort = requested.reasoningEffort ?? (requested.model === undefined ? selected.reasoningEffort : undefined)
  if (effort !== undefined && !['none','minimal','low','medium','high','xhigh','max','ultra'].includes(effort)) throw new Error('Unsupported Codex reasoning effort')
  return {
    model,
    modelProvider: 'openai',
    approvalPolicy: 'never',
    sandbox: policy.mode,
    config: { features: { ...CHILD_FEATURES_OFF.features, ...(platform === 'win32' ? { prefer_mxc: true } : {}) }, ...(effort === undefined ? {} : { model_reasoning_effort: effort }) },
  }
}

/**
 * A ChatGPT-authenticated Codex child would otherwise expose the account's
 * connected apps (calendar, site deploys, ...) and plugin installs, all
 * auto-approved. A DSH subtask gets the workspace tools only.
 */
const CHILD_FEATURES_OFF = Object.freeze({
  features: Object.freeze(Object.fromEntries(['apps', 'plugins', 'plugin_sharing', 'remote_plugin', 'tool_suggest', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'computer_use', 'in_app_browser'].map(name => [name, false]))),
})

/** Reuse the official DSH process/turn provider; keep only subscription auth here. */
export function createSubscriptionSubagent({ ctx, nativeHome, resolveAuth, store, refresh, loadRuntime, maintenance = () => false, defaults }) {
  // Module imports are cached by Node. Recheck the optional executable before
  // each child so a repair, cancelled update or manual removal cannot reuse
  // stale preparation state.
  const load = () => loadRuntime()
  const active = new Set()
  let disposed = false
  const provider = {
    name: SUBAGENT_PROVIDER,
    capabilities: { agentOptions: true, outputSchema: false, depthLimit: false, toolFilter: false, persona: false },
    inheritsParentContext: false,
    async start(request) {
      if (disposed) throw new Error('Codex subagent is unavailable')
      if (maintenance()) throw new Error('Codex subtask component is being changed; restart DSH after completion')
      const controller = new AbortController()
      active.add(controller)
      const signal = AbortSignal.any([request.signal, controller.signal])
      let run
      try {
        await defaults?.ready(request.agentOptions, signal)
        signal.throwIfAborted()
        const options = defaults?.resolve(request.parent, request.agentOptions) ?? request.agentOptions
        const thread = subagentThreadPolicy(request.parent, ctx.sandboxPolicy.resolve({ session: request.parent.session }), options)
        const getTokens = await createSubagentTokens({ resolveAuth, store, refresh, signal })
        const { official, Transport, argv } = await load()
        const proxy = await resolveCodexOAuthProxy({ target: new URL('https://chatgpt.com/') })
        signal.throwIfAborted()
        await mkdir(nativeHome, { recursive: true })
        const env = { CODEX_HOME: nativeHome, ...(proxy ? { HTTPS_PROXY: proxy, HTTP_PROXY: proxy, ALL_PROXY: proxy } : {}) }
        let delegate
        official.apply({
          subagents: { registerProvider(value) { delegate = value } },
          subprocess: { spawn: spec => authenticatedSubagentChild(ctx.subprocess.spawn({ ...spec, argv, env: { ...spec.env, ...env } }), {
            Transport, getTokens, thread, signal,
          }) },
          logger: { warn: () => ctx.logger?.warn?.('Codex subscription subtask failed') },
        }, { model: thread.model, env, permissionMode: 'never', disposeGraceMs: 1000 })
        run = await delegate.start({ ...request, agentOptions: undefined, signal })
        const result = run.result.finally(() => active.delete(controller))
        return { ...run, result, async dispose() { controller.abort(); await run.dispose(); active.delete(controller) } }
      } catch (error) {
        controller.abort()
        await run?.dispose()
        active.delete(controller)
        throw error
      }
    },
  }
  return {
    provider,
    activeCount: () => active.size,
    prepare: () => { if (maintenance()) return Promise.reject(new Error('Restart DSH after changing the Codex subtask component')); return load() },
    dispose() { disposed = true; for (const controller of active) controller.abort() },
  }
}

/**
 * DSH 0.2 mounts Agent preset rows once, at boot and before plugins load, so the
 * Loader never lists them and `internal/config` never reaches a later listener.
 * Read them from the preset registry; a host without it simply has none.
 */
export function presetEntries(ctx) {
  try {
    const generations = ctx.get?.('agentPresets')?.generations
    if (!(generations instanceof Map)) return []
    return [...generations.values()].flatMap(generation => [...(generation.mount?.tree?.entries?.() ?? [])])
  } catch { return [] }
}

// Cordis 4.0.6 passes Fiber as the first argument; older hosts bind it as this.
// Resolve that owner explicitly rather than hiding a broken binding in configure.
export function subagentConfigListener(switcher) {
  return function (fiberOrConfig, next) {
    return switcher.configure(this?.entry ? this : fiberOrConfig, next())
  }
}

/** Change only standard independent spawn tools; leave fork/custom tools untouched. */
export function createSubagentBackendSwitcher({ entries, prepare, persist, hostVersion }) {
  const originals = new Map()
  let selected = 'dsh'
  let tail = Promise.resolve()
  let disposed = false
  const standard = (entry, config) => entry?.options?.name === '@deepseek-ai/dsh-tool-subagent'
    && config?.provider === 'spawn' && !config.agentOptions && !config.persona && !config.toolFilter
  const modernSelection = hostVersion !== undefined && compareVersions(hostVersion, '0.2.2-alpha.2') >= 0
  const childRoute = {
    provider: SUBAGENT_PROVIDER,
    ...(modernSelection ? { modelSelection: true } : { modelSelectionSettings: true, backgroundMode: 'one-shot' }),
    maxDepth: 'provider-managed',
  }
  const convert = config => ({ ...config, ...childRoute })
  const ownedFields = Object.keys(childRoute)
  const restore = (current, original) => {
    const result = { ...current }, applied = convert(original)
    for (const key of ownedFields) {
      if (current[key] !== applied[key]) continue
      if (Object.hasOwn(original, key)) result[key] = original[key]
      else delete result[key]
    }
    return result
  }
  const configure = (fiber, config) => {
    if (!standard(fiber?.entry, config)) return config
    if (!originals.has(fiber)) originals.set(fiber, { ...config })
    return selected === 'codex' ? convert(config) : config
  }
  const select = (mode, { validate = true } = {}) => {
    if (!['dsh', 'codex'].includes(mode)) return Promise.reject(new Error('Invalid subagent backend'))
    const next = tail.catch(() => {}).then(async () => {
      if (disposed) throw new Error('Subagent backend is unavailable')
      const all = [...entries()]
      for (const entry of all) {
        if (entry.fiber && standard(entry, entry.fiber.config) && !originals.has(entry.fiber)) originals.set(entry.fiber, { ...entry.fiber.config })
      }
      if (mode === 'codex') {
        if (!originals.size && !all.some(entry => standard(entry, entry.options?.config))) throw new Error('No standard DSH independent subagent tool is available')
        if (validate) await prepare()
      }
      const changed = []
      const previous = selected
      selected = mode
      try {
        for (const [fiber, original] of originals) {
          if (fiber.entry && fiber.entry.fiber !== fiber) { originals.delete(fiber); continue }
          const before = { ...fiber.config }
          changed.push({ fiber, before })
          if (mode === 'codex' && before.provider !== SUBAGENT_PROVIDER) originals.set(fiber, { ...before })
          await fiber.update(mode === 'codex' ? convert(before) : restore(before, original), true)
        }
        await persist?.(mode)
      } catch (error) {
        selected = previous
        for (const { fiber, before } of changed.reverse()) await fiber.update(before, true)
        throw error
      }
    })
    tail = next
    return next
  }
  return {
    select,
    configure,
    async dispose() {
      await tail.catch(() => {})
      disposed = true
      selected = 'dsh'
      for (const [fiber, original] of originals) {
        if (fiber.config?.provider === SUBAGENT_PROVIDER) await fiber.update(restore(fiber.config, original), true)
      }
      originals.clear()
    },
  }
}

export { loadSubagentRuntime } from './subagent-runtime.js'
