import { mkdir } from 'node:fs/promises'
import { authenticatedSubagentChild, createSubagentTokens } from './subagent-auth.js'
import { resolveCodexOAuthProxy } from './oauth-network.js'

export const SUBAGENT_BACKEND_FIELD = 'subagentBackend'
export const SUBAGENT_PROVIDER = 'codex-subscription-subagent'
const MODES = new Set(['read-only', 'workspace-write', 'danger-full-access'])

export function subagentThreadPolicy(parent, policy) {
  if (!MODES.has(policy?.mode)) throw new Error('DSH subagent sandbox policy is unavailable')
  const selected = parent.session.requestHeader?.()?.config ?? parent.options ?? {}
  const subscription = selected.provider === 'openai-codex' && typeof selected.model === 'string'
  return {
    model: subscription ? selected.model : 'gpt-5.6-luna',
    modelProvider: 'openai',
    approvalPolicy: 'never',
    sandbox: policy.mode,
    config: { model_reasoning_effort: subscription ? selected.reasoningEffort ?? 'low' : 'low' },
  }
}

/** Reuse the official DSH process/turn provider; keep only subscription auth here. */
export function createSubscriptionSubagent({ ctx, nativeHome, resolveAuth, store, refresh, loadRuntime }) {
  let runtime
  const load = () => runtime ??= loadRuntime().catch(error => { runtime = undefined; throw error })
  const active = new Set()
  let disposed = false
  const provider = {
    name: SUBAGENT_PROVIDER,
    capabilities: { agentOptions: false, outputSchema: false, depthLimit: false, toolFilter: false, persona: false },
    inheritsParentContext: false,
    async start(request) {
      if (disposed) throw new Error('Codex subagent is unavailable')
      const controller = new AbortController()
      active.add(controller)
      const signal = AbortSignal.any([request.signal, controller.signal])
      let run
      try {
        const thread = subagentThreadPolicy(request.parent, ctx.sandboxPolicy.resolve({ session: request.parent.session }))
        const getTokens = await createSubagentTokens({ resolveAuth, store, refresh, signal })
        const { official, Transport } = await load()
        const proxy = await resolveCodexOAuthProxy({ target: new URL('https://chatgpt.com/') })
        signal.throwIfAborted()
        await mkdir(nativeHome, { recursive: true })
        const env = { CODEX_HOME: nativeHome, ...(proxy ? { HTTPS_PROXY: proxy, HTTP_PROXY: proxy, ALL_PROXY: proxy } : {}) }
        let delegate
        official.apply({
          subagents: { registerProvider(value) { delegate = value } },
          subprocess: { spawn: spec => authenticatedSubagentChild(ctx.subprocess.spawn({ ...spec, env: { ...spec.env, ...env } }), {
            Transport, getTokens, thread, signal,
          }) },
          logger: { warn: () => ctx.logger?.warn?.('Codex subscription subtask failed') },
        }, { model: thread.model, env, permissionMode: 'never', disposeGraceMs: 1000 })
        run = await delegate.start({ ...request, signal })
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
    prepare: load,
    dispose() { disposed = true; for (const controller of active) controller.abort() },
  }
}

/** Change only standard independent spawn tools; leave fork/custom tools untouched. */
export function createSubagentBackendSwitcher({ entries, prepare, persist }) {
  const originals = new Map()
  let selected = 'dsh'
  let tail = Promise.resolve()
  let disposed = false
  const standard = (entry, config) => entry?.options?.name === '@deepseek-ai/dsh-tool-subagent'
    && config?.provider === 'spawn' && !config.agentOptions && !config.persona && !config.toolFilter
  const convert = config => ({ ...config, provider: SUBAGENT_PROVIDER, modelSelectionSettings: false, backgroundMode: 'one-shot', maxDepth: 'provider-managed' })
  const configure = (fiber, config) => {
    if (!standard(fiber.entry, config)) return config
    if (!originals.has(fiber)) originals.set(fiber, { ...config })
    return selected === 'codex' ? convert(config) : config
  }
  const select = mode => {
    if (!['dsh', 'codex'].includes(mode)) return Promise.reject(new Error('Invalid subagent backend'))
    const next = tail.catch(() => {}).then(async () => {
      if (disposed) throw new Error('Subagent backend is unavailable')
      const all = [...entries()]
      for (const entry of all) {
        if (entry.fiber && standard(entry, entry.fiber.config) && !originals.has(entry.fiber)) originals.set(entry.fiber, { ...entry.fiber.config })
      }
      if (mode === 'codex') {
        if (!originals.size && !all.some(entry => standard(entry, entry.options?.config))) throw new Error('No standard DSH independent subagent tool is available')
        await prepare()
      }
      const changed = []
      const previous = selected
      selected = mode
      try {
        for (const [fiber, original] of originals) {
          if (fiber.entry && fiber.entry.fiber !== fiber) { originals.delete(fiber); continue }
          const before = { ...fiber.config }
          changed.push({ fiber, before })
          await fiber.update(mode === 'codex' ? convert(original) : original, true)
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
        if (fiber.config?.provider === SUBAGENT_PROVIDER) await fiber.update(original, true)
      }
      originals.clear()
    },
  }
}

export async function loadSubagentRuntime() {
  const [official, { JsonRpcLineTransport: Transport }] = await Promise.all([
    import('@deepseek-ai/dsh-subagent-codex'), import('@deepseek-ai/dsh-sdk-protocol'),
  ])
  return { official, Transport }
}
