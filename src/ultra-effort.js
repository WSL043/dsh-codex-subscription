// Codex protocol ModelInfo::resolve_reasoning_effort (0.164.0-alpha.11.1).
// Ultra is an execution preset, never a Responses reasoning.effort value.
export const NATIVE_CODEX_EFFORTS = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

export function ultraCatalogPreset(value) {
  const supported = (Array.isArray(value?.supported_reasoning_levels) ? value.supported_reasoning_levels : [])
    .map(item => item?.effort).filter(effort => typeof effort === 'string')
  if (!supported.includes('ultra')) return undefined
  const override = value.multi_agent_reasoning_effort
  const effectiveEffort = override !== 'ultra' && supported.includes(override)
    ? override : supported.includes('max') ? 'max' : supported.findLast(effort => effort !== 'ultra') ?? 'medium'
  // Do not manufacture an HTTP capability from an unknown future catalog value.
  return NATIVE_CODEX_EFFORTS.includes(effectiveEffort) ? Object.freeze({ effectiveEffort }) : undefined
}
