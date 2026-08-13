export const name = 'wsl043-codex-boundary'

const freeze = value => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) freeze(child)
  return Object.freeze(value)
}

export const CODEX_PROVIDER_POLICY = freeze({
  id: 'openai-codex',
  displayName: 'ChatGPT / Codex subscription',
  adapterOwner: '@wsl043/dsh-codex-subscription',
  auth: 'oauth',
  trustDomain: 'trusted',
  fallback: 'none',
  maturity: 'preview',
})

export function providerPolicy(provider) {
  if (provider !== CODEX_PROVIDER_POLICY.id) {
    throw new Error(`unknown provider: ${String(provider ?? '')}`)
  }
  return CODEX_PROVIDER_POLICY
}

const service = freeze({ resolve: providerPolicy, policy: CODEX_PROVIDER_POLICY })

export function apply(ctx) {
  ctx.provide('wsl043CodexBoundary', service)
}
