import { readSubscriptionCredentials } from './subscription-credentials.js'
import { loadModelCatalogCache, saveModelCatalogCache } from './model-catalog-cache.js'
import { PACKAGE_VERSION, USER_AGENT } from './version.js'

export const CODEX_MODELS_URL = `https://chatgpt.com/backend-api/codex/models?client_version=${encodeURIComponent(PACKAGE_VERSION)}`

const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const DEFAULT_REFRESH_TIMEOUT_MS = 10_000
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
const positiveInteger = value => Number.isSafeInteger(value) && value > 0 ? value : undefined

function upgradeModelId(value) {
  const direct = typeof value.upgrade === 'string'
    ? nonEmpty(value.upgrade)
    : record(value.upgrade) ? nonEmpty(value.upgrade.model) : undefined
  return direct
    ?? (record(value.upgrade_info) ? nonEmpty(value.upgrade_info.model) : undefined)
    ?? (record(value.upgradeInfo) ? nonEmpty(value.upgradeInfo.model) : undefined)
}

// The HTTP catalog nests the notice as `upgrade: { model, retirement_at: '<ISO date>' }`;
// the app-server shape uses `upgradeInfo.retirementAt` in Unix seconds. Accept both.
function retirementMillis(value) {
  for (const source of [value, value.upgrade, value.upgrade_info, value.upgradeInfo]) {
    if (!record(source)) continue
    for (const raw of [source.retirement_at, source.retirementAt]) {
      const seconds = positiveInteger(raw)
      if (seconds !== undefined && Number.isSafeInteger(seconds * 1000)) return seconds * 1000
      if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/u.test(raw)) {
        const parsed = Date.parse(raw)
        if (Number.isFinite(parsed) && parsed > 0) return parsed
      }
    }
  }
  return undefined
}

export function retirementNotice(value, now = Date.now(), targetDisplayName) {
  if (!record(value) || !Number.isFinite(now)) return undefined
  const at = retirementMillis(value)
  if (at === undefined || at <= now) return undefined
  const date = new Date(at)
  if (!Number.isFinite(date.getTime())) return undefined
  const year = String(date.getUTCFullYear()).padStart(4, '0')
  const dateText = `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  const upgradeTo = upgradeModelId(value)
  const upgradeName = upgradeTo === undefined ? undefined : nonEmpty(targetDisplayName) ?? upgradeTo
  const text = `Retires on ${dateText} (UTC).${upgradeName === undefined ? '' : ` Switch to ${upgradeName} to keep working.`}`
  return { text, at, upgradeTo, dateText }
}

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

const capabilityNames = values => [...new Set(values.filter(value =>
  typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/u.test(value)))].sort().slice(0, 16)

const speedTierIds = value => [
  ...(Array.isArray(value.additional_speed_tiers) ? value.additional_speed_tiers : []),
  ...(Array.isArray(value.service_tiers) ? value.service_tiers.map(tier => tier?.id) : []),
]

// Speed tiers the plugin can honour, as the account's catalog words them; the phone shows them as its speed choice.
const HONOURED_TIERS = new Set(['priority', 'fast', 'ultrafast'])
function serviceTierEntries(value) {
  const entries = Array.isArray(value.service_tiers) ? value.service_tiers : []
  const found = entries.flatMap(tier => record(tier) && typeof tier.id === 'string' && HONOURED_TIERS.has(tier.id)
    ? [{ id: tier.id, name: nonEmpty(tier.name) ?? tier.id, description: nonEmpty(tier.description) ?? '' }]
    : [])
  for (const id of Array.isArray(value.additional_speed_tiers) ? value.additional_speed_tiers : []) {
    if (typeof id === 'string' && HONOURED_TIERS.has(id) && !found.some(tier => tier.id === id)) found.push({ id, name: id === 'ultrafast' ? 'Ultrafast' : 'Fast', description: '' })
  }
  return found
}

function unsupportedCapabilities(value) {
  const reasoning = capabilityNames((value.supported_reasoning_levels ?? []).map(item => item?.effort))
    .filter(level => !['none', ...LEVELS.slice(1)].includes(level))
  const inputs = capabilityNames(Array.isArray(value.input_modalities) ? value.input_modalities : [])
    .filter(input => !['text', 'image'].includes(input))
  const speeds = capabilityNames([
    ...(Array.isArray(value.additional_speed_tiers) ? value.additional_speed_tiers : []),
    ...(Array.isArray(value.service_tiers) ? value.service_tiers.map(tier => tier?.id) : []),
  ]).filter(tier => !['auto', 'default', 'standard', 'fast', 'priority', 'ultrafast'].includes(tier))
  return {
    ...(reasoning.length ? { reasoning } : {}),
    ...(inputs.length ? { inputs } : {}),
    ...(speeds.length ? { speeds } : {}),
  }
}

function visibleModel(value, displayNames, now) {
  if (!record(value)) return undefined
  const id = nonEmpty(value.slug)
  // Reserve is a manually selected experiment, only when the account catalog
  // actually advertises it. Do not expose other hidden models or invent it offline.
  const reserve = id === 'gpt-reserve' && ['list', 'hide'].includes(value.visibility)
  if (id === undefined || (value.visibility !== 'list' && !reserve)) return undefined
  const supported = Array.isArray(value.supported_reasoning_levels) ? value.supported_reasoning_levels : []
  const input = Array.isArray(value.input_modalities)
    ? value.input_modalities.filter(item => ['text', 'image'].includes(item))
    : ['text', 'image']
  const unsupported = unsupportedCapabilities({ ...value, supported_reasoning_levels: supported })
  const upgradeTo = upgradeModelId(value)
  const retirement = retirementNotice(value, now, displayNames.get(upgradeTo))
  const notice = retirement?.text
  const description = nonEmpty(value.description)
  return {
    ...(Object.keys(unsupported).length ? { unsupported } : {}),
    id,
    // The host's model menu only renders names for plugin models, so the date has
    // to live in the name to be visible. The id, and so any saved selection, is untouched.
    name: `${reserve ? 'GPT-Reserve (Experimental)' : nonEmpty(value.display_name) ?? id}${retirement === undefined ? '' : ` (retires ${retirement.dateText})`}`,
    description: notice === undefined ? description : description === undefined ? notice : `${description}\n${notice}`,
    ...(retirement === undefined ? {} : { retirement: { at: retirement.at, upgradeTo: retirement.upgradeTo } }),
    priority: Number.isFinite(value.priority) ? value.priority : 0,
    input: input.length > 0 ? input : ['text'],
    contextWindow: positiveInteger(value.context_window) ?? positiveInteger(value.max_context_window),
    ...(positiveInteger(value.max_context_window) === undefined ? {} : { maxContextWindow: value.max_context_window }),
    reasoning: supported.length > 0,
    supportsReasoningEffortUpdates: value.supports_reasoning_effort_updates === true,
    thinkingLevelMap: reasoningMap(supported),
    supportVerbosity: value.support_verbosity === true,
    defaultVerbosity: ['low', 'medium', 'high'].includes(value.default_verbosity) ? value.default_verbosity : undefined,
    serviceTiers: serviceTierEntries(value),
    supportsFast: speedTierIds(value).some(tier => tier === 'fast' || tier === 'priority'),
    // Only offered when this account's catalog lists it for the model (Pro 500 today).
    supportsUltrafast: speedTierIds(value).includes('ultrafast'),
  }
}

/** Codex's dedicated approval reviewer when the account catalog advertises it. */
export const CODEX_REVIEW_MODEL = 'codex-auto-review'

/**
 * Mirror Codex's reviewer selection: a parent model's override, else the
 * default reviewer, used only when the account catalog lists that slug (any
 * visibility), with low reasoning when the reviewer supports it.
 */
export function officialReviewModel(value, parentId) {
  if (!record(value) || !Array.isArray(value.models)) return undefined
  const parent = value.models.find(model => record(model) && model.slug === parentId)
  const id = nonEmpty(parent?.auto_review_model_override) ?? CODEX_REVIEW_MODEL
  const preset = value.models.find(model => record(model) && model.slug === id)
  if (preset === undefined) return undefined
  const levels = Array.isArray(preset.supported_reasoning_levels) ? preset.supported_reasoning_levels : []
  const effort = levels.some(level => (record(level) ? level.effort : level) === 'low')
    ? 'low'
    : nonEmpty(preset.default_reasoning_level)
  return { id, ...(effort === undefined ? {} : { effort }) }
}

export function parseOfficialModelCatalog(value, now = Date.now()) {
  if (!record(value) || !Array.isArray(value.models)) throw new Error('Codex returned a malformed model catalog')
  const displayNames = new Map()
  for (const model of value.models) {
    if (!record(model)) continue
    const id = nonEmpty(model.slug)
    const name = nonEmpty(model.display_name)
    if (id !== undefined && name !== undefined && !displayNames.has(id)) displayNames.set(id, name)
  }
  const seen = new Set()
  return value.models
    .map(model => visibleModel(model, displayNames, now))
    .filter(model => model !== undefined && !seen.has(model.id) && seen.add(model.id))
    .sort((left, right) => Number(left.id === 'gpt-reserve') - Number(right.id === 'gpt-reserve')
      || left.priority - right.priority)
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
    ...(remote.retirement === undefined || remote.description === undefined ? {} : { description: remote.description }),
    input: remote.input,
    reasoning: remote.reasoning,
    supportsReasoningEffortUpdates: remote.supportsReasoningEffortUpdates,
    thinkingLevelMap: remote.thinkingLevelMap,
    ...(remote.contextWindow === undefined ? {} : { contextWindow: remote.contextWindow }),
    ...(remote.maxContextWindow === undefined ? {} : { maxContextWindow: remote.maxContextWindow }),
    // Subscription-backed models do not expose API billing to this plugin.
    ...(base.id === remote.id ? {} : { cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }),
  }
}

/**
 * 创建带账号缓存、远端刷新和模型能力元数据的官方目录。
 * @param {object} options - 凭据、模型来源、网络和目录更新配置
 * @returns {object} 可初始化、刷新、查询和清除的模型目录
 */
export function createOfficialModelCatalog(options = {}) {
  const fetchCatalog = options.fetch ?? fetch
  const getNow = options.now ?? Date.now
  const scheduleTimeout = options.setTimeout ?? setTimeout
  const cancelTimeout = options.clearTimeout ?? clearTimeout
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_REFRESH_TIMEOUT_MS
  let models
  let metadata = new Map()
  let etag
  let rawCatalog
  let activeAccountId
  let source = 'unavailable'
  let initializing
  let revision = 0
  let refreshing
  let generation = 0
  let refreshStatus = 'idle'
  // Until the first catalog read succeeds the picker is empty, so a failed read (timeout, network block, proxy hiccup)
  // is tried again on its own after these delays instead of waiting for the settings page or a restart (#187).
  const retryDelays = Array.isArray(options.retryDelaysMs) ? options.retryDelaysMs.filter(delay => Number.isFinite(delay) && delay > 0) : []
  let retries = 0
  let retryTimer
  const stopRetry = () => { if (retryTimer !== undefined) cancelTimeout(retryTimer); retryTimer = undefined }
  const scheduleRetry = currentGeneration => {
    if (currentGeneration !== generation || retryTimer !== undefined || retries >= retryDelays.length) return
    retryTimer = scheduleTimeout(() => {
      retryTimer = undefined
      if (currentGeneration !== generation) return
      refresh().catch(() => {})
    }, retryDelays[retries++])
    retryTimer.unref?.()
  }

  /** 清除当前账号的内存目录并使未完成请求失效。 */
  const invalidate = (notify, preserveInitialization = false, advanceRevision = true) => {
    generation += 1
    const flight = refreshing
    refreshing = undefined
    flight?.cancel()
    stopRetry()
    retries = 0
    models = undefined
    rawCatalog = undefined
    metadata = new Map()
    etag = undefined
    activeAccountId = undefined
    source = 'unavailable'
    refreshStatus = 'idle'
    if (advanceRevision) revision += 1
    if (!preserveInitialization) initializing = undefined
    if (notify) options.onUpdated?.()
  }

  /** 读取当前账号并在远端刷新前恢复该账号的有效缓存。 */
  const initialize = () => {
    if (initializing !== undefined) return initializing.promise
    const startGeneration = generation
    const promise = (async () => {
      const { accountId } = await readSubscriptionCredentials(options.getAuth, options.readCredential)
      if (startGeneration !== generation) return false
      if (typeof accountId !== 'string' || accountId.length === 0) {
        if (activeAccountId !== undefined || models !== undefined) throw new Error('Codex model catalog credentials are unavailable')
        return false
      }
      if (accountId === activeAccountId) return true
      const hadState = activeAccountId !== undefined || models !== undefined
      const hadModels = models !== undefined
      invalidate(false, true, hadState)
      const cacheGeneration = generation
      activeAccountId = accountId
      let cache
      if (options.cacheDirectory !== undefined) {
        try {
          cache = await loadModelCatalogCache(accountId, {
            directory: options.cacheDirectory,
            now: getNow(),
            parseCatalog: parseOfficialModelCatalog,
          })
        } catch (error) {
          if (options.onCacheError === undefined) throw error
          options.onCacheError(error)
        }
      }
      if (cacheGeneration !== generation || activeAccountId !== accountId) return false
      if (cache !== undefined) {
        const remote = parseOfficialModelCatalog(cache.rawCatalog, getNow())
        const next = remote.map(model => mergeModel(options.baseModels(), model)).filter(Boolean)
        if (next.length > 0) {
          models = next
          rawCatalog = cache.rawCatalog
          metadata = new Map(remote.map(model => [model.id, model]))
          etag = cache.etag
          source = 'cached'
          revision += 1
          options.onUpdated?.()
          return true
        }
      }
      if (hadModels) options.onUpdated?.()
      return true
    })().finally(() => {
      if (initializing?.promise === promise) initializing = undefined
    })
    initializing = { generation: startGeneration, promise }
    return promise
  }

  /** 确认账号缓存已初始化后刷新远端目录。 */
  const refresh = ({ signal } = {}) => {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('Codex model catalog refresh aborted'))
    if (refreshing?.generation === generation) return refreshing.promise
    const currentGeneration = generation
    refreshStatus = 'refreshing'
    return initialize().then(initialized => {
      if (!initialized) {
        if (currentGeneration === generation) refreshStatus = 'idle'
        return false
      }
      return refreshInitialized(signal)
    }, error => {
      if (currentGeneration === generation) {
        refreshStatus = 'failed'
        scheduleRetry(currentGeneration)
      }
      throw error
    })
  }

  /** 使用已初始化的账号凭据请求目录，并提交仍属于当前账号的响应。 */
  const refreshInitialized = signal => {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('Codex model catalog refresh aborted'))
    if (refreshing?.generation === generation) return refreshing.promise
    const currentGeneration = generation
    refreshStatus = 'refreshing'
    let outcome = 'idle'
    const controller = new AbortController()
    const abort = () => {
      if (!controller.signal.aborted) controller.abort(signal?.reason ?? new Error('Codex model catalog refresh aborted'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    const requestSignal = controller.signal
    let timer
    const timeoutError = new Error('Codex model catalog refresh timed out')
    const work = (async () => {
      const { access, accountId } = await readSubscriptionCredentials(options.getAuth, options.readCredential, requestSignal)
      if (currentGeneration !== generation || requestSignal.aborted) return false
      if (typeof access !== 'string' || access.length === 0 || typeof accountId !== 'string' || accountId.length === 0) {
        if (activeAccountId !== undefined || models !== undefined) throw new Error('Codex model catalog credentials are unavailable')
        return false
      }
      if (accountId !== activeAccountId) {
        invalidate(true)
        await initialize()
        if (activeAccountId === accountId) void refresh().catch(() => {})
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
      const response = await fetchCatalog(CODEX_MODELS_URL, { method: 'GET', redirect: 'error', headers, signal: requestSignal })
      if (currentGeneration !== generation || requestSignal.aborted) return false
      if (response.status === 304) {
        // An unchanged catalog can still have crossed a retirement date since it was parsed.
        if (rawCatalog === undefined) throw new Error('Codex returned HTTP 304 without a cached model catalog')
        const remote = parseOfficialModelCatalog(rawCatalog, getNow())
        const next = remote.map(model => mergeModel(options.baseModels(), model)).filter(Boolean)
        if (next.length === 0) throw new Error('Codex returned an empty model catalog')
        const changed = JSON.stringify(next) !== JSON.stringify(models)
        const previousSource = source
        const nextEtag = nonEmpty(response.headers.get('etag')) ?? etag
        if (changed) {
          models = next
          metadata = new Map(remote.map(model => [model.id, model]))
          revision += 1
        }
        etag = nextEtag
        source = 'online'
        if (options.cacheDirectory !== undefined) {
          try {
            await saveModelCatalogCache(accountId, { rawCatalog, etag: nextEtag }, {
              directory: options.cacheDirectory,
              now: getNow(),
              parseCatalog: parseOfficialModelCatalog,
              isCurrent: () => currentGeneration === generation && !requestSignal.aborted,
            })
          } catch (error) {
            if (options.onCacheError === undefined) throw error
            options.onCacheError(error)
          }
        }
        if (currentGeneration !== generation || requestSignal.aborted) return false
        outcome = 'ok'
        refreshStatus = 'ok'
        if (changed || previousSource !== 'online') options.onUpdated?.()
        return changed
      }
      if (!response.ok) throw new Error(`Codex model catalog failed (HTTP ${response.status})`)
      const raw = await response.json()
      const remote = parseOfficialModelCatalog(raw, getNow())
      if (currentGeneration !== generation || requestSignal.aborted) return false
      if (remote.length === 0) throw new Error('Codex returned an empty model catalog')
      const baseModels = options.baseModels()
      const next = remote.map(model => mergeModel(baseModels, model)).filter(Boolean)
      if (next.length === 0) throw new Error('Codex model catalog has no compatible models')
      if (currentGeneration !== generation || requestSignal.aborted) return false
      const nextEtag = nonEmpty(response.headers.get('etag')) ?? etag
      models = next
      rawCatalog = raw
      metadata = new Map(remote.map(model => [model.id, model]))
      etag = nextEtag
      revision += 1
      source = 'online'
      if (options.cacheDirectory !== undefined) {
        try {
          await saveModelCatalogCache(accountId, { rawCatalog: raw, etag: nextEtag }, {
            directory: options.cacheDirectory,
            now: getNow(),
            parseCatalog: parseOfficialModelCatalog,
            isCurrent: () => currentGeneration === generation && !requestSignal.aborted,
          })
        } catch (error) {
          if (options.onCacheError === undefined) throw error
          options.onCacheError(error)
        }
      }
      if (currentGeneration !== generation || requestSignal.aborted) return false
      outcome = 'ok'
      refreshStatus = 'ok'
      options.onUpdated?.()
      return true
    })()
    let rejectAborted
    const abortPromise = new Promise((_, reject) => {
      rejectAborted = () => reject(requestSignal.reason ?? new Error('Codex model catalog refresh aborted'))
      if (requestSignal.aborted) rejectAborted()
      else requestSignal.addEventListener('abort', rejectAborted, { once: true })
    })
    timer = scheduleTimeout(() => controller.abort(timeoutError), timeoutMs)
    timer.unref?.()
    const promise = Promise.race([work, abortPromise]).catch(error => {
      outcome = 'failed'
      throw error
    }).finally(() => {
      cancelTimeout(timer)
      signal?.removeEventListener('abort', abort)
      requestSignal.removeEventListener('abort', rejectAborted)
      if (refreshing?.promise === promise) {
        refreshing = undefined
        refreshStatus = outcome
      }
      if (outcome === 'ok') { retries = 0; stopRetry() } else if (outcome === 'failed') scheduleRetry(currentGeneration)
    })
    refreshing = { generation: currentGeneration, promise, cancel: () => controller.abort() }
    return promise
  }

  return Object.freeze({
    refresh,
    // The account's catalog is the only list. Signed out, or before the first
    // successful read, there are no models: without the account or the network
    // no request could succeed, so a bundled list would only mislead.
    getModels: () => models ?? [],
    metadata: modelId => metadata.get(modelId),
    reviewModel: parentId => officialReviewModel(rawCatalog, parentId),
    revision: () => revision,
    capabilityGaps: () => [...metadata.values()]
      .filter(model => model.unsupported && /^[a-z][a-z0-9._-]{0,79}$/u.test(model.id))
      .slice(0, 20)
      .map(model => ({ model: model.id, ...structuredClone(model.unsupported) })),
    status: () => ({ source, refresh: refreshStatus }),
    initialize,
    clear() {
      invalidate(true)
    },
  })
}
