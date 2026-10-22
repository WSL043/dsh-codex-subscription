// Boundary replay adapted from pi-openai-reasoning@0.2.0 (MIT, Jose Mocito).
// Source and complete license: THIRD_PARTY_NOTICES.md. No telemetry or Pi session writer is used.
import { createHash } from 'node:crypto'
import { boundedStringify } from './reasoning-json.js'

export const REASONING_STATE_KEY = 'codexReasoningV1'
export const REASONING_LIMITS = Object.freeze({ items: 20_000, bytes: 16 * 1024 * 1024, updates: 128 })
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const efforts = new Set(['low', 'medium', 'high', 'xhigh', 'max'])
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
export const reasoningHash = text => createHash('sha256').update(text).digest('hex')
export const reasoningDigest = value => {
  const text = boundedStringify(value, REASONING_LIMITS.bytes)
  return text === undefined ? undefined : reasoningHash(text)
}
const boundary = (value, update = false) => record(value) && Object.keys(value).every(key => ['offset', 'hash', ...(update ? ['effort'] : [])].includes(key)) &&
  Number.isInteger(value.offset) && value.offset >= 0 && value.offset <= REASONING_LIMITS.items && isHash(value.hash)
export function isReasoningState(value) {
  if (!record(value) || value.version !== 1 || !isHash(value.scope) || !isHash(value.envelope) ||
    !efforts.has(value.baseline) || !boundary(value.last) || !Array.isArray(value.updates) || value.updates.length > REASONING_LIMITS.updates ||
    Object.keys(value).some(key => !['version', 'scope', 'envelope', 'baseline', 'updates', 'last'].includes(key))) return false
  let offset = -1
  for (const update of value.updates) {
    if (!boundary(update, true) || !efforts.has(update.effort) || update.offset <= offset || update.offset > value.last.offset) return false
    offset = update.offset
  }
  return true
}

export function supportsReasoningUpdates(model) {
  if (model?.provider !== 'openai-codex' || model.id !== 'gpt-6.1-sol' || model.api !== 'openai-codex-responses' || !model.reasoning) return false
  try {
    const url = new URL(model.baseUrl)
    return url.origin === 'https://chatgpt.com' && !url.username && !url.password && !url.search && !url.hash &&
      ['/backend-api', '/backend-api/codex', '/backend-api/codex/responses'].includes(url.pathname.replace(/\/+$/u, ''))
  } catch { return false }
}

/** Raw provider input only: the bridge owns replaying its updates, never transcript messages. */
export function rewriteReasoning(payload, { model, scope, previous, fresh = false }) {
  const skip = reason => ({ payload, reason })
  if (!supportsReasoningUpdates(model) || !record(payload) || payload.model !== model.id || !Array.isArray(payload.input) ||
    !record(payload.reasoning) || !efforts.has(payload.reasoning.effort)) return skip('unsupported-request')
  if (payload.context_management !== undefined) return skip('cloud-compaction')
  if (payload.multi_agent !== undefined || payload.reasoning.mode !== undefined && payload.reasoning.mode !== 'standard' ||
    payload.previous_response_id !== undefined || payload.conversation !== undefined || payload.background === true ||
    payload.truncation !== undefined && payload.truncation !== 'disabled' ||
    payload.input.some(item => ['configuration_update', 'agent_message', 'compaction', 'compaction_trigger'].includes(item?.type))) return skip('incompatible-history')
  if (!isHash(scope) || !payload.input.length) return skip('unknown-window')
  if (previous !== undefined && (!isReasoningState(previous) || previous.scope !== scope)) return skip('changed-account-or-state')
  if (previous === undefined && !fresh) return skip('unknown-window')
  if (payload.input.length > REASONING_LIMITS.items) return skip('history-limit')
  const hash = createHash('sha256'), hashes = [hash.copy().digest('hex')]
  let bytes = 0
  for (const item of payload.input) {
    const text = boundedStringify(item, REASONING_LIMITS.bytes - bytes)
    if (text === undefined) return skip('history-limit')
    bytes += Buffer.byteLength(text)
    hash.update(text).update('\n'); hashes.push(hash.copy().digest('hex'))
  }
  // A fork/reconnect may get a different provider-owned cache hint without changing prompt semantics.
  const { input, reasoning, prompt_cache_key: _cacheKey, ...outer } = payload
  const { effort: selected, ...reasoningOuter } = reasoning
  const envelopeText = boundedStringify({ ...outer, reasoning: reasoningOuter }, REASONING_LIMITS.bytes - bytes)
  if (envelopeText === undefined) return skip('history-limit')
  const envelope = reasoningHash(envelopeText)
  if (previous && (previous.envelope !== envelope || hashes[previous.last.offset] !== previous.last.hash ||
    previous.updates.some(update => hashes[update.offset] !== update.hash))) return skip('history-changed')
  const baseline = previous?.baseline ?? selected
  const updates = previous?.updates.map(update => ({ ...update })) ?? []
  const last = { offset: input.length, hash: hashes[input.length] }
  const retry = previous?.last.offset === last.offset && previous.last.hash === last.hash
  const effective = updates.at(-1)?.effort ?? baseline
  // Never silently ignore a newly selected effort, or replace an update already dispatched.
  if (retry && effective !== selected) return { error: 'Reasoning effort changed while retrying the same input. Keep the original effort for this retry, or send a new message.' }
  if (effective !== selected) {
    let offset = input.findIndex((item, index) => index >= previous.last.offset && item?.role === 'user')
    if (offset < 0 || updates.at(-1)?.offset === offset) offset = input.length
    if (updates.at(-1)?.offset === offset) return skip('adjacent-update')
    updates.push({ offset, hash: hashes[offset], effort: selected })
  }
  if (updates.length > REASONING_LIMITS.updates) return skip('update-limit')
  const output = []
  let cursor = 0
  for (let offset = 0; offset <= input.length; offset++) {
    if (updates[cursor]?.offset === offset) output.push({ type: 'configuration_update', reasoning: { effort: updates[cursor++].effort } })
    if (offset < input.length) output.push(input[offset])
  }
  return {
    payload: { ...payload, input: output, reasoning: { ...reasoning, effort: baseline } },
    state: { version: 1, scope, envelope, baseline, updates, last },
    reason: retry ? 'replay' : updates.length ? 'active' : 'baseline',
  }
}
