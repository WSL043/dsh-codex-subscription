import { PACKAGE_VERSION, USER_AGENT } from './version.js'

export const CODEX_MODELS_URL = `https://chatgpt.com/backend-api/codex/models?client_version=${encodeURIComponent(PACKAGE_VERSION)}`

const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
const positiveInteger = value => Number.isSafeInteger(value) && value > 0 ? value : undefined

function reasoningMap(levels) {
  const supported = new Set((Array.isArray(levels) ? levels : [])
    .map(level => nonEmpty(record(level) ? level.effort : undefined))
    .filter(Boolean))
  const map = Object.fromEntries(LEVELS.map(level => [level, null]))
  if (supported.has('none')) map.off = 'none'
  for (const level of LEVELS.slice(1)) {
    if (supported.has(level)) map[level] = level
  }
  return map
}

function visibleModel(value) {
  if (!record(value)) return undefined
  const id = nonEmpty(value.slug)
  if (id === undefined || value.supported_in_api !== true || value.visibility !== 'list') return undefined
  const supported = Array.isArray(value.supported_reasoning_levels) ? value.supported_reasoning_levels : []
  const input = Array.isArray(value.input_modalities)
    ? value.input_modalities.filter(item => ['text', 'image'].includes(item))
    : ['text', 'image']
  return {
    id,
    name: nonEmpty(value.display_name) ?? id,
    description: nonEmpty(value.description),
    priority: Number.isFinite(value.priority) ? value.priority : 0,
    input: input.length > 0 ? input : ['text'],
    contextWindow: positiveInteger(value.context_window) ?? positiveInteger(value.max_context_window),
    reasoning: supported.length > 0,
    thinkingLevelMap: reasoningMap(supported),
    supportVerbosity: value.support_verbosity === true,
    defaultVerbosity: ['low', 'medium', 'high'].includes(value.default_verbosity) ? value.default_verbosity : undefined,
    supportsFast: [...(Array.isArray(value.additional_speed_tiers) ? value.additional_speed_tiers : []),
      ...(Array.isArray(value.service_tiers) ? value.service_tiers.map(tier => tier?.id) : [])]
      .some(tier => tier === 'fast' || tier === 'priority'),
  }
}

export function parseOfficialModelCatalog(value) {
  if (!record(value) || !Array.isArray(value.models)) throw new Error('Codex returned a malformed model catalog')
  const seen = new Set()
  return value.models
    .map(visibleModel)
    .filter(model => model !== undefined && !seen.has(model.id) && seen.add(model.id))
    .sort((left, right) => right.priority - left.priority)
}

function mergeModel(baseModels, remote) {
  const base = baseModels.find(model => model.id === remote.id)
    ?? baseModels.find(model => model.id !== 'gpt-5.3-codex-spark')
    ?? baseModels[0]
  if (base === undefined) return undefined
  return {
    ...base,
    id: remote.id,
    name: remote.name,
    input: remote.input,
    reasoning: remote.reasoning,
    thinkingLevelMap: remote.thinkingLevelMap,
    ...(remote.contextWindow === undefined ? {} : { contextWindow: remote.contextWindow }),
    // Subscription-backed models do not expose API billing to this plugin.
    ...(base.id === remote.id ? {} : { cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }),
  }
}

export function createOfficialModelCatalog(options = {}) {
  const fetchCatalog = options.fetch ?? fetch
  let models
  let metadata = new Map()
  let etag
  let revision = 0
  let refreshing

  const refresh = async ({ signal } = {}) => {
    if (refreshing !== undefined) return refreshing
    refreshing = (async () => {
      const auth = await options.getAuth({ signal })
      const credential = await options.readCredential({ signal })
      const access = auth?.auth?.apiKey
      const accountId = credential?.type === 'oauth' ? credential.accountId : undefined
      if (typeof access !== 'string' || access.length === 0 || typeof accountId !== 'string' || accountId.length === 0) {
        return false
      }
      const headers = {
        authorization: `Bearer ${access}`,
        'chatgpt-account-id': accountId,
        accept: 'application/json',
        originator: 'pi',
        'user-agent': USER_AGENT,
        ...(etag === undefined ? {} : { 'if-none-match': etag }),
      }
      const response = await fetchCatalog(CODEX_MODELS_URL, { method: 'GET', redirect: 'error', headers, signal })
      if (response.status === 304) return false
      if (!response.ok) throw new Error(`Codex model catalog failed (HTTP ${response.status})`)
      const remote = parseOfficialModelCatalog(await response.json())
      if (remote.length === 0) throw new Error('Codex returned an empty model catalog')
      const baseModels = options.baseModels()
      const next = remote.map(model => mergeModel(baseModels, model)).filter(Boolean)
      if (next.length === 0) throw new Error('Codex model catalog has no compatible models')
      models = next
      metadata = new Map(remote.map(model => [model.id, model]))
      etag = nonEmpty(response.headers.get('etag')) ?? etag
      revision += 1
      return true
    })().finally(() => { refreshing = undefined })
    return refreshing
  }

  return Object.freeze({
    refresh,
    getModels: fallback => models ?? fallback,
    metadata: modelId => metadata.get(modelId),
    revision: () => revision,
    clear() {
      models = undefined
      metadata = new Map()
      etag = undefined
      revision += 1
    },
  })
}
