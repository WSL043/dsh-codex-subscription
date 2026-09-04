import {
  CONTEXT_MODE_FIELD,
  CUSTOM_CONTEXT_MODEL_CAPS,
  CUSTOM_CONTEXT_MODEL_DEFAULTS,
  CUSTOM_CONTEXT_MODEL_FIELDS,
  CUSTOM_CONTEXT_WINDOW_FIELD,
  LEGACY_QUICK_QUOTA_FIELD,
  normalizeContextMode,
  normalizeCustomContextWindow,
  normalizeOutputVerbosity,
  normalizeQuickQuotaMode,
  normalizeSearchProvider,
  normalizeSpeedMode,
  OUTPUT_VERBOSITY_FIELD,
  QUICK_QUOTA_MODE_FIELD,
  SEARCH_PROVIDER_FIELD,
  SPEED_MODE_FIELD,
} from './settings-contract.js'

const CHANNEL = '/codex-subscription'

const unwrap = response => {
  if (!response?.ok) throw new Error(response?.error?.message ?? 'Codex RPC failed')
  return response.value
}

export function createPreferenceController(scope, rpc) {
  let updating = false
  let error = false
  let fallbackStatus = 'loading'
  let fallback
  let pendingPatch
  let failedPatch
  let generation = 0
  let contextModels = []
  let verbosityModels = []
  const nativeSnapshot = () => scope.getSnapshot()
  const read = () => {
    const native = nativeSnapshot()
    const current = native.status === 'ready'
      ? native
      : fallbackStatus === 'ready'
        ? fallback
        : native
    const value = pendingPatch === undefined ? current.value : { ...current.value, ...pendingPatch }
    return Object.freeze({
      // Keep accepted ready surfaces mounted while a Host write is pending.
      status: current.status,
      quickQuotaMode: normalizeQuickQuotaMode(
        value?.[QUICK_QUOTA_MODE_FIELD],
        value?.[LEGACY_QUICK_QUOTA_FIELD],
      ),
      searchProvider: normalizeSearchProvider(value?.[SEARCH_PROVIDER_FIELD]),
      speedMode: normalizeSpeedMode(value?.[SPEED_MODE_FIELD]),
      outputVerbosity: normalizeOutputVerbosity(value?.[OUTPUT_VERBOSITY_FIELD]),
      contextMode: normalizeContextMode(value?.[CONTEXT_MODE_FIELD]),
      customContextWindow: normalizeCustomContextWindow(value?.[CUSTOM_CONTEXT_WINDOW_FIELD]),
      customContextWindows: Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [modelKey, normalizeCustomContextWindow(value?.[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey])])),
      contextModels,
      verbosityModels,
      writable: !updating && current.status === 'ready' && current.writable === true,
      saving: updating,
      error,
    })
  }
  let snapshot = read()
  const listeners = new Set()
  const publish = () => {
    snapshot = read()
    for (const listener of listeners) listener()
  }
  const disposeScope = scope.subscribe(() => {
    error = false
    if (!updating) failedPatch = undefined
    publish()
  })
  const acceptFallback = value => {
    contextModels = Array.isArray(value?.contextModels) ? value.contextModels : []
    verbosityModels = Array.isArray(value?.verbosityModels) ? value.verbosityModels : []
    fallbackStatus = 'ready'
    fallback = {
      status: 'ready',
      value: {
        [QUICK_QUOTA_MODE_FIELD]: normalizeQuickQuotaMode(
          value?.[QUICK_QUOTA_MODE_FIELD],
          value?.[LEGACY_QUICK_QUOTA_FIELD],
        ),
        [SEARCH_PROVIDER_FIELD]: normalizeSearchProvider(value?.[SEARCH_PROVIDER_FIELD]),
        [SPEED_MODE_FIELD]: normalizeSpeedMode(value?.[SPEED_MODE_FIELD]),
        [OUTPUT_VERBOSITY_FIELD]: normalizeOutputVerbosity(value?.[OUTPUT_VERBOSITY_FIELD]),
        [CONTEXT_MODE_FIELD]: normalizeContextMode(value?.[CONTEXT_MODE_FIELD]),
        [CUSTOM_CONTEXT_WINDOW_FIELD]: normalizeCustomContextWindow(value?.[CUSTOM_CONTEXT_WINDOW_FIELD]),
        ...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [field, normalizeCustomContextWindow(value?.[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey])])),
      },
      writable: value?.writable === true,
    }
  }
  const load = async () => {
    const current = ++generation
    updating = false
    pendingPatch = undefined
    fallbackStatus = 'loading'
    fallback = undefined
    error = false
    publish()
    try {
      const value = unwrap(await rpc.call(CHANNEL, 'preferences/status', {}))
      if (current !== generation) return
      if (nativeSnapshot().status === 'ready') {
        contextModels = Array.isArray(value?.contextModels) ? value.contextModels : []
        verbosityModels = Array.isArray(value?.verbosityModels) ? value.verbosityModels : []
      }
      else acceptFallback(value)
      publish()
    } catch {
      if (current !== generation || nativeSnapshot().status === 'ready') return
      fallbackStatus = 'unavailable'
      publish()
    }
  }
  const set = async patch => {
    if (snapshot.status !== 'ready' || snapshot.writable !== true) return
    const current = ++generation
    const entries = Object.entries(patch)
    updating = true
    pendingPatch = patch
    error = false
    failedPatch = undefined
    publish()
    try {
      const native = nativeSnapshot()
      if (native.status === 'ready') {
        for (const [field, value] of entries) {
          if (current !== generation) return
          await scope.set(field, value)
        }
        if (current !== generation) return
        const accepted = nativeSnapshot().value
        error = entries.some(([field, value]) => accepted?.[field] !== value)
        pendingPatch = undefined
      } else {
        const value = unwrap(await rpc.call(CHANNEL, 'preferences/update', patch))
        if (current !== generation) return
        acceptFallback(value)
        // The Host may normalize or reject a requested value; its response wins.
        pendingPatch = undefined
      }
    } catch {
      if (current === generation) {
        pendingPatch = undefined
        error = true
        failedPatch = patch
      }
    } finally {
      if (current === generation) {
        updating = false
        publish()
      }
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    load,
    set,
    retry: () => failedPatch === undefined ? load() : set(failedPatch),
    dispose: disposeScope,
  }
}
