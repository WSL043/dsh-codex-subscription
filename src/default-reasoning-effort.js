import { normalizeDefaultReasoningEffort } from './settings-contract.js'

// A preference is a default, never a profile-wide explicit effort: the latter
// makes PiAiAdapter reject models which do not support that level.
function modelInfo(info, preference, modelDefault) {
  const efforts = info?.reasoning?.efforts
  if (!Array.isArray(efforts)) return info
  const supported = effort => efforts.some(value => value.id === effort)
  const fallback = supported(modelDefault) ? modelDefault : info.reasoning.defaultEffort
  const selected = preference !== 'auto' && supported(preference) ? preference : fallback
  return supported(selected) ? { ...info, reasoning: { ...info.reasoning, defaultEffort: selected } } : info
}

export function withDefaultReasoningEffort(adapter, { provider = 'openai-codex', preference, modelDefault } = {}) {
  const snapshot = model => ({ choice: normalizeDefaultReasoningEffort(preference?.()), fallback: modelDefault?.(model) })
  const optionsFor = (options, info) => options.reasoningEffort !== undefined || options.provider !== provider || options.model !== info.id || info.reasoning?.defaultEffort === undefined
    ? options : { ...options, reasoningEffort: info.reasoning.defaultEffort }
  const prepare = async (target, args, captured) => {
    const call = await target.prepareCall(...args)
    const info = modelInfo(call.model, captured.choice, captured.fallback)
    return { ...call, model: info, stream: options => call.stream(optionsFor(options, info)) }
  }
  return new Proxy(adapter, { get(target, property) {
    const value = Reflect.get(target, property, target)
    if (property === 'resolveModel' && typeof value === 'function') return async (...args) => {
      if (args[0] !== provider) return value.apply(target, args)
      const captured = snapshot(args[1])
      return modelInfo(await value.apply(target, args), captured.choice, captured.fallback)
    }
    if (property === 'prepareCall' && typeof value === 'function') return (...args) => args[0] === provider
      ? prepare(target, args, snapshot(args[1])) : value.apply(target, args)
    if (property === 'stream' && typeof value === 'function') return options => {
      if (options.provider !== provider) return value.call(target, options)
      const captured = snapshot(options.model)
      return (async function* () {
        let call
        try {
          if (typeof target.prepareCall === 'function') call = await prepare(target, [options.provider, options.model, options.signal], captured)
          else {
            const info = modelInfo(await target.resolveModel(options.provider, options.model, options.signal), captured.choice, captured.fallback)
            call = { stream: input => value.call(target, optionsFor(input, info)) }
          }
        } catch {
          // Native stream owns its error contract (including unknown
          // models and cancellation); do not turn those into generator throws.
          yield* value.call(target, options)
          return
        }
        yield* call.stream(options)
      })()
    }
    return typeof value === 'function' ? value.bind(target) : value
  } })
}
