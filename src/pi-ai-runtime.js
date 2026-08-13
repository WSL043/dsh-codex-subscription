// Keep every dependency on pi-ai's Codex-specific public surface in one place.
// The exact peer version makes a DSH update fail visibly until this seam is
// re-audited instead of silently changing authentication or cache semantics.
export { createModels } from '@earendil-works/pi-ai'
export { getOpenAICodexWebSocketDebugStats } from '@earendil-works/pi-ai/api/openai-codex-responses'
export { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'

export const PI_AI_RUNTIME_VERSION = '0.82.1'
