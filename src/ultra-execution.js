import { AsyncLocalStorage } from 'node:async_hooks'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { isDshAutoReview } from './pi-ai-runtime.js'
import { presetEntries, SUBAGENT_PROVIDER } from './subagent-backend.js'

const contextName = 'dsh-codex-subscription:ultra'
const providerId = 'openai-codex'
const unavailable = message => new LlmError(message, 'UNSUPPORTED_OPTION')
const scopedTools = agent => agent?.ctx?.get?.('tools') ?? (Object.hasOwn(agent?.ctx ?? {}, 'tools') ? agent.ctx.tools : undefined)

/** Native DSH tools/providers only; never install a provider or change a preset. */
function nativeDelegations(ctx, agent) {
  const tools = scopedTools(agent) ?? ctx.get?.('tools')
  const subagents = ctx.get?.('subagents')
  return presetEntries(ctx).flatMap(entry => {
    const config = entry.fiber?.effectiveConfig ?? entry.fiber?.config ?? entry.options?.config
    if (entry.options?.name !== '@deepseek-ai/dsh-tool-subagent' ||
      !['spawn', SUBAGENT_PROVIDER].includes(config?.provider) || !subagents?.getProvider?.(config.provider)) return []
    const name = config.toolName ?? 'subagent'
    const definition = tools?.get?.(name, agent)
    return agent && !definition ? [] : [{ name, definition }]
  })
}

/**
 * Ultra keeps its user-visible selection in Harness headers. Only the inner
 * adapter receives the model's native effort. DSH owns child scheduling,
 * sandbox/approval decisions, concurrency/depth budgets and cancellation.
 */
export function createUltraExecutionPreset({ catalog, resolveAgent = () => undefined,
  defaultEffort = () => undefined, delegations = nativeDelegations } = {}) {
  const scope = new AsyncLocalStorage(), bindings = new Map()
  let context, installed = false
  const metadata = id => catalog?.metadata?.(id)?.ultra
  const available = () => installed && typeof context?.get?.('tools')?.guard === 'function'
    && delegations(context).length > 0
  const supported = id => available() && metadata(id) !== undefined
  const deactivate = binding => {
    binding.removeAbort?.(); binding.removeAbort = undefined
    if (binding.state) binding.state.active = false
  }
  const disposeAgent = agent => {
    const binding = bindings.get(agent)
    if (!binding) return
    deactivate(binding); binding.disposeGuard(); bindings.delete(agent)
  }
  const bind = agent => {
    let binding = bindings.get(agent)
    if (binding) return binding
    const tools = scopedTools(agent)
    if (typeof tools?.guard !== 'function') throw unavailable('Ultra requires the native DSH agent tool policy service')
    binding = { state: undefined }
    binding.disposeGuard = tools.guard(exec => {
      const state = binding.state
      if (!state || !state.tools.some(tool => tool.name === exec.name)) return
      if (!state.active || state.signal.aborted || exec.agent !== agent) return 'Ultra delegation belongs to an inactive or cancelled request'
      const tool = state.tools.find(tool => tool.name === exec.name)
      if (tools.get(exec.name, agent, exec.toolSet) !== tool.definition) return 'Ultra delegation tool changed after request preparation; retry the request'
      // Returning undefined cannot override another guard, approval or sandbox.
    })
    bindings.set(agent, binding)
    return binding
  }
  const request = (agent, config, signal, turn) => {
    const existing = bindings.get(agent)
    if (existing) deactivate(existing)
    const implicitUltra = config.reasoningEffort === undefined && defaultEffort(config.model) === 'ultra'
      && supported(config.model) && delegations(context, agent).length > 0 && typeof scopedTools(agent)?.guard === 'function'
    const selected = config.reasoningEffort ?? (implicitUltra ? 'ultra' : undefined)
    if (config.provider !== providerId || selected !== 'ultra') {
      const binding = bindings.get(agent)
      if (binding) { deactivate(binding); binding.state = undefined }
      return
    }
    signal.throwIfAborted()
    const preset = metadata(config.model)
    if (!supported(config.model) || !preset) throw unavailable('This account/model does not advertise an available DSH Ultra execution preset')
    const tools = [...new Map(delegations(context, agent).map(tool => [tool.name, tool])).values()]
    if (!tools.length) throw unavailable('Ultra requires an independent subagent tool in the selected Agent preset')
    const binding = bind(agent)
    deactivate(binding)
    const policy = Object.freeze({ version: 1, provider: config.provider, model: config.model,
      requestedEffort: 'ultra', effectiveEffort: preset.effectiveEffort, delegationPolicy: 'proactive',
      tools: Object.freeze(tools.map(tool => tool.name)), turn })
    const state = { policy, tools, signal, active: true, preset: { ...preset } }
    binding.state = state
    const abort = () => { state.active = false }
    signal.addEventListener('abort', abort, { once: true })
    binding.removeAbort = () => signal.removeEventListener('abort', abort)
  }
  const guidance = ({ agent, signal }) => {
    const state = bindings.get(agent)?.state
    if (!state?.active || state.signal !== signal || signal.aborted) return ''
    const { effectiveEffort, tools } = state.policy
    return `DSH Ultra execution preset: the selected model uses ${effectiveEffort} reasoning. Proactively delegate useful, bounded independent work with ${tools.join(' or ')} and continue useful work while it runs. Use the native subagent controls to receive results. Do simple work directly. Respect explicit user limits, the existing depth/concurrency limits, sandbox and approvals; this preset grants no additional permissions. Apply this guidance only while it is in the latest runtime context.`
  }
  const describe = info => !info?.reasoning || !supported(info.id) || resolveAgent() &&
    (!delegations(context, resolveAgent()).length || typeof scopedTools(resolveAgent())?.guard !== 'function') ? info : {
    ...info, reasoning: { ...info.reasoning, efforts: [...info.reasoning.efforts.filter(effort => effort.id !== 'ultra'), {
      id: 'ultra', name: `Ultra (DSH parallel · ${metadata(info.id).effectiveEffort})`,
    }] },
  }
  const stream = (factory, options, captured) => (async function* () {
    const auxiliary = ['session-title', 'compaction'].includes(options.purpose) || isDshAutoReview(options)
    let state
    let input = options
    if (options.provider === providerId && options.reasoningEffort === 'ultra') {
      if (!captured) throw unavailable('This account/model does not advertise Ultra')
      const agent = resolveAgent()
      if (!auxiliary) {
        state = bindings.get(agent)?.state
        if (!state?.active || state.signal.aborted || agent?.session?.id !== options.sessionId ||
          state.policy.model !== options.model || state.preset.effectiveEffort !== captured.effectiveEffort) {
          throw unavailable('Ultra requires a matching live DSH request policy; retry through the Agent')
        }
      }
      input = { ...options, reasoningEffort: captured.effectiveEffort === 'none' ? 'off' : captured.effectiveEffort }
    }
    // Explicitly clear inherited state for nested titles/review/non-Ultra calls.
    const iterator = scope.run(state, () => factory(input)[Symbol.asyncIterator]())
    try {
      for (;;) {
        const next = await scope.run(state, () => iterator.next())
        if (next.done) return next.value
        yield next.value
      }
    } finally { await scope.run(state, () => iterator.return?.()) }
  })()
  return {
    available, supported,
    snapshot: agent => { const state = bindings.get(agent)?.state; return state ? { ...state.policy, tools: [...state.policy.tools], active: state.active && !state.signal.aborted } : undefined },
    install(ctx) {
      if (installed) throw new Error('Ultra execution preset is already installed')
      const prompt = ctx.get?.('systemPrompt')
      if (typeof prompt?.context !== 'function' || typeof prompt.refreshContext !== 'function') return () => {}
      // DSH refreshes runtime context after agent/request, then commits the
      // resulting snapshot through the session surface. The request header
      // already owns the selected effort; no separate policy record is needed.
      const disposePrompt = prompt.context({ name: contextName, order: 9000, text: guidance, interpolate: false, required: true })
      context = ctx; installed = true
      const disposeRequest = ctx.on('agent/request', async ({ agent, signal, turn }, next) => {
        const config = await next()
        request(agent, config, signal, turn)
        return config
      })
      const disposeAgentListener = ctx.on('agent/disposed', ({ agent }) => disposeAgent(agent))
      const disposeEnd = ctx.on('session/event', (session, event) => {
        if (event.type !== 'turn/end') return
        for (const [agent, binding] of bindings) if (agent.session === session && binding.state?.policy.turn === event.data.turn) deactivate(binding)
      })
      return () => {
        installed = false
        disposePrompt(); disposeRequest(); disposeAgentListener(); disposeEnd()
        for (const agent of [...bindings.keys()]) disposeAgent(agent)
        context = undefined
      }
    },
    wrapAdapter(adapter) {
      return new Proxy(adapter, { get(target, property) {
        const value = Reflect.get(target, property, target)
        if (property === 'resolveModel' && typeof value === 'function') return async (...args) => args[0] === providerId ? describe(await value.apply(target, args)) : value.apply(target, args)
        if (property === 'prepareCall' && typeof value === 'function') return async (...args) => {
          const call = await value.apply(target, args)
          if (args[0] !== providerId) return call
          const captured = supported(args[1]) ? { ...metadata(args[1]) } : undefined
          return { ...call, model: describe(call.model), stream: options => stream(input => call.stream(input), options, captured) }
        }
        if (property === 'stream' && typeof value === 'function') return options => stream(input => value.call(target, input), options,
          supported(options.model) ? { ...metadata(options.model) } : undefined)
        return typeof value === 'function' ? value.bind(target) : value
      } })
    },
    preparePayload(payload) {
      const state = scope.getStore()
      if (!state) return payload
      if (!state.active || state.signal.aborted || payload.model !== state.policy.model) throw unavailable('Ultra request policy is no longer active')
      if (payload.reasoning?.effort === 'ultra' || payload.input?.some(item => item.type === 'configuration_update' && item.reasoning?.effort === 'ultra')) throw unavailable('Ultra must resolve to a native model effort before sending')
      return state.policy.effectiveEffort === 'none' ? { ...payload, reasoning: { ...payload.reasoning, effort: 'none' } } : payload
    },
  }
}
