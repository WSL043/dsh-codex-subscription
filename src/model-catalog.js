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
  const schedule = options.setTimeout ?? setTimeout
  const cancelTimer = options.clearTimeout ?? clearTimeout
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_REFRESH_TIMEOUT_MS
  const loadCache = options.loadCache ?? loadModelCatalogCache
  const saveCache = options.saveCache ?? saveModelCatalogCache
  const retryDelays = (options.retryDelaysMs ?? []).filter(delay => Number.isFinite(delay) && delay > 0)
  let models, rawCatalog, etag, accountId, initializing, refreshing, retryTimer
  let metadata = new Map(), generation = 0, revision = 0, retries = 0, initialized = false
  let source = 'unavailable', refreshStatus = 'idle', writeSequence = 0
  const writes = new Set()
  const notify = () => { try { options.onUpdated?.() } catch {} }
  const cacheError = error => { try { options.onCacheError?.(error) } catch {} }
  const stopRetry = () => { if (retryTimer !== undefined) cancelTimer(retryTimer); retryTimer = undefined }
  const cancelled = () => Object.assign(new Error('Codex model catalog operation cancelled'), { name: 'AbortError' })
  const current = flight => flight.generation === generation && !flight.controller.signal.aborted
  const wait = (promise, signal) => {
    if (!signal) return promise
    if (signal.aborted) return Promise.reject(signal.reason ?? cancelled())
    let abort
    const interrupted = new Promise((_, reject) => {
      abort = () => reject(signal.reason ?? cancelled())
      signal.addEventListener('abort', abort, { once: true })
    })
    return Promise.race([promise, interrupted]).finally(() => signal.removeEventListener('abort', abort))
  }
  const bounded = (label, work, signal) => {
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason ?? cancelled())
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    const flight = { generation, controller }
    const timer = schedule(() => controller.abort(new Error(`Codex model catalog ${label} timed out`)), timeoutMs)
    timer.unref?.()
    const task = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return work(flight, controller.signal) })
    flight.promise = wait(task, controller.signal).finally(() => {
      cancelTimer(timer)
      signal?.removeEventListener('abort', abort)
    })
    return flight
  }
  const scheduleRetry = expected => {
    if (expected !== generation || retryTimer !== undefined || retries >= retryDelays.length) return
    retryTimer = schedule(() => {
      retryTimer = undefined
      if (expected === generation) void refresh().catch(() => {})
    }, retryDelays[retries++])
    retryTimer.unref?.()
  }
  const restore = async (nextAccountId, flight, signal) => {
    if (!current(flight)) return false
    if (accountId !== nextAccountId) {
      const hadModels = models !== undefined
      accountId = nextAccountId
      models = rawCatalog = etag = undefined
      metadata = new Map()
      source = 'unavailable'
      if (hadModels) { revision += 1; notify() }
    }
    let cached
    if (nextAccountId && options.cacheDirectory !== undefined) {
      try { cached = await loadCache(nextAccountId, { directory: options.cacheDirectory, now: getNow(), parseCatalog: parseOfficialModelCatalog, signal }) }
      catch (error) { if (!current(flight)) throw error; cacheError(error) }
    }
    if (!current(flight) || accountId !== nextAccountId) return false
    if (cached !== undefined) {
      const remote = parseOfficialModelCatalog(cached.rawCatalog, getNow())
      const next = remote.map(model => mergeModel(options.baseModels(), model)).filter(Boolean)
      if (next.length) {
        models = next; rawCatalog = cached.rawCatalog; etag = cached.etag
        metadata = new Map(remote.map(model => [model.id, model]))
        source = 'cached'; revision += 1; notify()
      }
    }
    return true
  }
  const initialize = ({ signal } = {}) => {
    if (signal?.aborted) return Promise.reject(signal.reason ?? cancelled())
    if (initializing) return wait(initializing.promise, signal)
    if (initialized) return Promise.resolve(accountId !== undefined)
    const flight = bounded('initialization', async (flight, requestSignal) => {
      // Cached metadata needs the current vault identity, not an OAuth network refresh.
      // Actual authenticated requests still take their token and account from one snapshot.
      const credential = await options.readCredential?.({ signal: requestSignal })
      if (!current(flight)) return false
      const id = credential?.type === 'oauth' ? nonEmpty(credential.accountId) : undefined
      await restore(id, flight, requestSignal)
      if (!current(flight)) return false
      initialized = true
      return id !== undefined
    }, signal)
    initializing = flight
    flight.promise = flight.promise.finally(() => { if (initializing === flight) initializing = undefined })
    return flight.promise
  }
  const persist = (id, raw, nextEtag) => {
    if (options.cacheDirectory === undefined) return
    const expected = generation, sequence = ++writeSequence
    const flight = bounded('cache write', async (flight, signal) => {
      await saveCache(id, { rawCatalog: raw, etag: nextEtag }, {
        directory: options.cacheDirectory, now: getNow(), parseCatalog: parseOfficialModelCatalog, signal,
        isCurrent: () => current(flight) && accountId === id && writeSequence === sequence,
      })
    })
    writes.add(flight)
    flight.promise.catch(error => { if (expected === generation) cacheError(error) })
      .finally(() => writes.delete(flight))
  }
  const refresh = ({ signal } = {}) => {
    if (signal?.aborted) return Promise.reject(signal.reason ?? cancelled())
    if (refreshing) return wait(refreshing.promise, signal)
    refreshStatus = 'refreshing'
    const flight = bounded('refresh', async (flight, requestSignal) => {
      await initialize({ signal: requestSignal })
      if (!current(flight)) return false
      const credentials = await readSubscriptionCredentials(options.getAuth, options.readCredential, requestSignal)
      if (!current(flight)) return false
      if (!nonEmpty(credentials.access) || !nonEmpty(credentials.accountId)) {
        if (accountId !== undefined || models !== undefined) throw new Error('Codex model catalog credentials are unavailable')
        refreshStatus = 'idle'
        return false
      }
      if (credentials.accountId !== accountId) {
        await restore(credentials.accountId, flight, requestSignal)
        if (!current(flight)) return false
        initialized = true
      }
      const id = credentials.accountId
      const response = await fetchCatalog(CODEX_MODELS_URL, {
        method: 'GET', redirect: 'error', signal: requestSignal,
        headers: { authorization: `Bearer ${credentials.access}`, 'chatgpt-account-id': id, accept: 'application/json', originator: 'pi', 'user-agent': USER_AGENT, ...(etag === undefined ? {} : { 'if-none-match': etag }) },
      })
      if (!current(flight) || accountId !== id) return false
      if (response.status !== 304 && !response.ok) throw new Error(`Codex model catalog failed (HTTP ${response.status})`)
      const raw = response.status === 304 ? rawCatalog : await response.json()
      if (!current(flight) || accountId !== id) return false
      if (raw === undefined) throw new Error('Codex returned HTTP 304 without a cached model catalog')
      const remote = parseOfficialModelCatalog(raw, getNow())
      const next = remote.map(model => mergeModel(options.baseModels(), model)).filter(Boolean)
      if (!next.length) throw new Error('Codex returned an empty or incompatible model catalog')
      const changed = response.status !== 304 || JSON.stringify(next) !== JSON.stringify(models)
      const previousSource = source
      models = next; rawCatalog = raw
      metadata = new Map(remote.map(model => [model.id, model]))
      etag = nonEmpty(response.headers.get('etag')) ?? etag
      source = 'online'; refreshStatus = 'ok'
      if (changed) revision += 1
      if (changed || previousSource !== 'online') notify()
      // Cache availability must never hold back a valid directory or its host notification.
      if (current(flight) && accountId === id) persist(id, raw, etag)
      return changed
    }, signal)
    refreshing = flight
    flight.promise = flight.promise.then(value => {
      if (current(flight)) { retries = 0; stopRetry() }
      return value
    }, error => {
      if (flight.generation === generation) {
        refreshStatus = signal?.aborted ? 'idle' : 'failed'
        if (!signal?.aborted) scheduleRetry(flight.generation)
      }
      throw error
    }).finally(() => { if (refreshing === flight) refreshing = undefined })
    return flight.promise
  }
  return Object.freeze({
    initialize, refresh,
    getModels: () => models ?? [], metadata: id => metadata.get(id),
    reviewModel: id => officialReviewModel(rawCatalog, id), revision: () => revision,
    capabilityGaps: () => [...metadata.values()].filter(model => model.unsupported && /^[a-z][a-z0-9._-]{0,79}$/u.test(model.id)).slice(0, 20).map(model => ({ model: model.id, ...structuredClone(model.unsupported) })),
    status: () => ({ source, refresh: refreshStatus }),
    flushCache: () => Promise.all([...writes].map(flight => flight.promise.catch(() => {}))),
    clear() {
      generation += 1; writeSequence += 1
      initializing?.controller.abort(cancelled()); refreshing?.controller.abort(cancelled())
      for (const flight of writes) flight.controller.abort(cancelled())
      initializing = refreshing = undefined
      stopRetry(); retries = 0; initialized = false
      models = rawCatalog = etag = accountId = undefined
      metadata = new Map(); source = 'unavailable'; refreshStatus = 'idle'
      revision += 1; notify()
    },
  })
}

/** Gate actual asynchronous adapter entry points, while keeping the provider registered. */
export function withModelCatalogReady(adapter, catalog, { signal: lifetime } = {}) {
  const ready = async signal => {
    const active = lifetime && signal ? AbortSignal.any([lifetime, signal]) : lifetime ?? signal
    active?.throwIfAborted()
    await catalog.initialize({ signal: active })
    if (catalog.getModels().length === 0) await catalog.refresh({ signal: active })
    active?.throwIfAborted()
  }
  return new Proxy(adapter, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (typeof value === 'function' && ['resolveModel', 'prepareCall', 'listModels'].includes(property)) return async (...args) => {
        await ready(args[2])
        return value.apply(target, args)
      }
      if (property === 'stream' && typeof value === 'function') return async function* (options) {
        await ready(options?.signal)
        yield* value.call(target, options)
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
