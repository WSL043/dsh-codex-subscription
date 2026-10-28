import { createHash } from 'node:crypto'
import { createSharedRequests } from './shared-request.js'

const BASE = 'https://chatgpt.com/backend-api'
const MODELS = new Set(['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra'])
const invalid = () => Object.assign(new Error('Invalid prediction request'), { code: 'invalid-input' })
const cancelled = () => new DOMException('Prediction scope changed', 'AbortError')

export function predictionInput(value) {
  if (!value || !MODELS.has(value.model) || typeof value.sessionId !== 'string' || !value.sessionId || value.sessionId.length > 512
    || typeof value.turnId !== 'string' || !value.turnId || value.turnId.length > 512
    || !Array.isArray(value.messages) || value.messages.length < 2 || value.messages.length > 12) throw invalid()
  let length = 0
  const messages = value.messages.map(message => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string' || !message.text.trim()) throw invalid()
    length += message.text.length
    return { role: message.role, text: message.text }
  })
  if (length > 24_000 || messages.at(-1).role !== 'assistant' || !messages.some(message => message.role === 'user')) throw invalid()
  return { sessionId: value.sessionId, turnId: value.turnId, model: value.model, messages }
}

async function boundedText(response, limit) {
  if (!response.body) throw new Error('Empty prediction response')
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw new Error('Prediction response too large') }
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { reader.releaseLock() }
}

export function predictionText(sse) {
  let completed
  for (const line of sse.split(/\r?\n/u)) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    const event = JSON.parse(line.slice(6))
    if (event.type === 'error' || event.type === 'response.failed' || event.type === 'response.incomplete') throw new Error('Prediction generation failed')
    if (event.type === 'response.completed') completed = event.response
  }
  if (completed?.status !== 'completed' || !Array.isArray(completed.output)
    || completed.output.some(item => !['reasoning', 'message'].includes(item.type))) throw new Error('Prediction did not complete as text')
  const text = completed.output.filter(item => item.type === 'message' && item.role === 'assistant')
    .flatMap(item => item.content ?? []).filter(part => part.type === 'output_text').map(part => part.text).join('')
  const result = JSON.parse(text)
  if (result.suggestion === null || result.suggestion === '') return null
  if (typeof result.suggestion !== 'string' || result.suggestion.length > 600 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(result.suggestion)) throw new Error('Invalid prediction text')
  return result.suggestion.trim() || null
}

/** Optional, isolated next-message inference. Never runs tools or mutates the source conversation. */
export function createComposerPredictions({ fetch, credentials, enabled, userAgent, now = Date.now, base = BASE, timeoutMs = 30_000 }) {
  const requests = createSharedRequests(), results = new Map()
  let generation = 0, accountId, config
  const clear = () => {
    generation++; accountId = undefined; config = undefined; results.clear(); requests.clear(cancelled())
  }
  const active = (auth, signal) => {
    signal?.throwIfAborted()
    if (auth.generation !== generation || !enabled()) throw cancelled()
  }
  const headers = auth => ({ authorization: `Bearer ${auth.access}`, 'chatgpt-account-id': auth.accountId, 'user-agent': userAgent })
  const configuration = async (auth, signal) => {
    active(auth, signal)
    if (config && now() - config.at < 300_000) return config.value
    return requests.run('config', async sharedSignal => {
      const response = await fetch(`${base}/wham/predictions/config`, { redirect: 'error', headers: { ...headers(auth), accept: 'application/json' }, signal: AbortSignal.any([sharedSignal, AbortSignal.timeout(15_000)]) })
      if (!response.ok) { await response.body?.cancel(); throw new Error('Prediction capability unavailable') }
      const value = JSON.parse(await boundedText(response, 32_000))
      if (typeof value?.is_enabled !== 'boolean' || (value.is_enabled && (typeof value.prompt !== 'string' || !value.prompt || value.prompt.length > 16_000))
        || value.unsupported_models !== undefined && (!Array.isArray(value.unsupported_models) || value.unsupported_models.some(model => typeof model !== 'string'))) throw new Error('Invalid prediction capability')
      active(auth, sharedSignal)
      config = { at: now(), value }
      return value
    }, signal)
  }
  return {
    clear,
    async generate(raw, signal) {
      signal?.throwIfAborted()
      if (!enabled()) return { prediction: null, reason: 'disabled' }
      const input = predictionInput(raw), initialGeneration = generation
      const credential = await credentials(signal)
      signal?.throwIfAborted()
      if (initialGeneration !== generation) throw cancelled()
      if (!credential?.access || !credential.accountId) return { prediction: null, reason: 'authentication' }
      if (accountId !== undefined && credential.accountId !== accountId) clear()
      accountId = credential.accountId
      const auth = { ...credential, generation }
      const cap = await configuration(auth, signal)
      active(auth, signal)
      if (!cap.is_enabled || cap.unsupported_models?.includes(input.model)) return { prediction: null, reason: 'unavailable' }
      const key = createHash('sha256').update(JSON.stringify(input)).digest('hex')
      const cached = results.get(key)
      if (cached && now() - cached.at < 300_000) return { prediction: cached.prediction }
      return requests.run(`prediction:${key}`, async sharedSignal => {
        active(auth, sharedSignal)
        const metadata = JSON.stringify({ thread_source: 'composer_predictions', turn_trigger: 'composer_predictions', model: input.model,
          prediction_source_thread_id: input.sessionId, prediction_source_turn_id: input.turnId, prediction_trigger: 'live' })
        const effort = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(cap.prediction_reasoning_effort) ? cap.prediction_reasoning_effort : 'high'
        const body = { model: input.model, instructions: 'Predict a follow-up message from the user, using the conversation. Return only the requested JSON. Do not call tools or perform tasks.',
          input: [...input.messages.map(message => ({ role: message.role, content: [{ type: message.role === 'user' ? 'input_text' : 'output_text', text: message.text }] })),
            { role: 'user', content: [{ type: 'input_text', text: cap.prompt }] }],
          reasoning: { effort }, tools: [], tool_choice: 'none', parallel_tool_calls: false, store: false, stream: true,
          include: ['reasoning.encrypted_content'], text: { format: { type: 'json_schema', name: 'composer_prediction', strict: true,
            schema: { type: 'object', properties: { suggestion: { type: ['string', 'null'] } }, required: ['suggestion'], additionalProperties: false } } },
          client_metadata: { 'x-codex-turn-metadata': metadata } }
        const response = await fetch(`${base}/codex/responses`, { method: 'POST', redirect: 'error',
          headers: { ...headers(auth), accept: 'text/event-stream', 'content-type': 'application/json', 'x-codex-turn-metadata': metadata },
          body: JSON.stringify(body), signal: AbortSignal.any([sharedSignal, AbortSignal.timeout(timeoutMs)]) })
        if (!response.ok) { await response.body?.cancel(); throw new Error(`Prediction request failed (HTTP ${response.status})`) }
        const prediction = predictionText(await boundedText(response, 1024 * 1024))
        active(auth, sharedSignal)
        if (results.size >= 32) results.delete(results.keys().next().value)
        results.set(key, { at: now(), prediction })
        return { prediction }
      }, signal)
    },
  }
}
