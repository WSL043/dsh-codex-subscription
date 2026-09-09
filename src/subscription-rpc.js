import { PREFERENCE_FIELDS } from './preference-fields.js'
import { capabilityPatch } from './capability-settings.js'
import { ORIGINAL_IMAGE_CHUNK_BYTES, ORIGINAL_IMAGE_ID_PATTERN } from './image-original-contract.js'
import { CUSTOM_CONTEXT_MODEL_CAPS, CUSTOM_CONTEXT_MODEL_FIELDS, CUSTOM_CONTEXT_WINDOW_FIELD, normalizeCustomContextWindow } from './settings-contract.js'
const publicError = (code, message) => ({
  ok: false,
  error: { code, message, details: { issues: [] } },
})

export function createSubscriptionRpcHandler({ authHandler, usageReader, resetCreditService, preferences, diagnosticsReader, modelCatalog, originalImages, resolveInheritedOriginal }) {
  return async (endpoint, payload, signal) => {
    if (endpoint === 'image/original/chunk') {
      try {
        signal.throwIfAborted()
        if (typeof payload?.sessionId !== 'string' || payload.sessionId.length === 0 || payload.sessionId.length > 512
          || typeof payload?.assetId !== 'string' || !ORIGINAL_IMAGE_ID_PATTERN.test(payload.assetId)
          || !Number.isSafeInteger(payload?.offset) || payload.offset < 0 || payload.offset % ORIGINAL_IMAGE_CHUNK_BYTES !== 0) {
          return publicError('invalid-input', 'Invalid original image request')
        }
        const inherited = resolveInheritedOriginal?.(payload.sessionId, payload.assetId)
        const chunk = await originalImages?.chunk(payload.sessionId, payload.assetId, payload.offset, inherited)
        if (chunk === undefined) return publicError('not-found', 'Original image is unavailable')
        return { ok: true, value: chunk }
      } catch (error) {
        if (signal.aborted) throw error
        return publicError('internal', 'Could not read the original image')
      }
    }
    if (endpoint === 'diagnostics') {
      try {
        signal.throwIfAborted()
        return { ok: true, value: await diagnosticsReader() }
      } catch (error) {
        if (signal.aborted) throw error
        return publicError('internal', 'Could not create support diagnostics')
      }
    }
    if (endpoint === 'preferences/models') {
      try {
        signal.throwIfAborted()
        if (typeof modelCatalog?.refresh !== 'function' || typeof preferences?.status !== 'function') {
          return publicError('internal', 'Could not refresh Codex model catalog')
        }
        await modelCatalog.refresh({ signal })
        const value = preferences.status()
        return {
          ok: true,
          value: {
            contextModels: Array.isArray(value?.contextModels) ? value.contextModels : [],
            verbosityModels: Array.isArray(value?.verbosityModels) ? value.verbosityModels : [],
            fastModels: Array.isArray(value?.fastModels) ? value.fastModels : [],
            catalogStatus: value?.catalogStatus,
          },
        }
      } catch (error) {
        if (signal.aborted) throw error
        return publicError('internal', 'Could not refresh Codex model catalog')
      }
    }
    if (endpoint === 'preferences/status' || endpoint === 'preferences/update') {
      try {
        signal.throwIfAborted()
        if (endpoint === 'preferences/update') {
          const patch = capabilityPatch(payload)
          for (const [field, rule] of Object.entries(PREFERENCE_FIELDS)) {
            if (!Object.hasOwn(payload ?? {}, field)) continue
            if (!rule.choices.includes(payload[field])) return publicError('internal', rule.error)
            patch[field] = payload[field]
          }
          if (Object.hasOwn(payload ?? {}, CUSTOM_CONTEXT_WINDOW_FIELD)) {
            if (normalizeCustomContextWindow(payload[CUSTOM_CONTEXT_WINDOW_FIELD]) !== payload[CUSTOM_CONTEXT_WINDOW_FIELD]) {
              return publicError('internal', 'Invalid custom context window')
            }
            patch[CUSTOM_CONTEXT_WINDOW_FIELD] = payload[CUSTOM_CONTEXT_WINDOW_FIELD]
          }
          for (const [modelKey, field] of Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS)) {
            if (!Object.hasOwn(payload ?? {}, field)) continue
            if (normalizeCustomContextWindow(payload[field], CUSTOM_CONTEXT_MODEL_CAPS[modelKey]) !== payload[field]) {
              return publicError('internal', 'Invalid custom model context window')
            }
            patch[field] = payload[field]
          }
          if (Object.keys(patch).length === 0) {
            return publicError('internal', 'Invalid preference update')
          }
          await preferences.update(patch)
        }
        return { ok: true, value: preferences.status() }
      } catch (error) {
        if (signal.aborted) throw error
        return publicError('internal', 'Could not update preferences')
      }
    }
    if (endpoint === 'usage') {
      try {
        signal.throwIfAborted()
        return { ok: true, value: await usageReader.read({ force: payload?.force === true, signal }) }
      } catch (error) {
        if (signal.aborted) throw error
        const known = new Set([
          'ChatGPT subscription is not signed in',
          'ChatGPT sign-in needs to be renewed',
        ])
        const message = error instanceof Error && known.has(error.message)
          ? error.message
          : 'Could not read ChatGPT usage'
        return publicError('internal', message)
      }
    }
    if (endpoint === 'reset-credit/inspect' || endpoint === 'reset-credit/prepare' || endpoint === 'reset-credit/consume') {
      try {
        signal.throwIfAborted()
        const value = endpoint === 'reset-credit/inspect'
          ? await resetCreditService.inspect({ signal })
          : endpoint === 'reset-credit/prepare'
            ? await resetCreditService.prepare({ creditRef: payload?.creditRef, signal })
            : await resetCreditService.consume({
            challengeId: payload?.challengeId,
            acknowledged: payload?.acknowledged,
            signal,
            })
        return { ok: true, value }
      } catch (error) {
        if (signal.aborted) throw error
        const known = new Set([
          'ChatGPT subscription is not signed in',
          'ChatGPT sign-in needs to be renewed',
          'No quota reset is available',
          'No usable quota reset is available',
          'The available quota reset expires too soon',
          'This quota reset confirmation is no longer valid',
          'This quota reset is already in progress',
          'Wait before confirming this quota reset',
          'You must acknowledge that one quota reset will be consumed',
          'The signed-in ChatGPT account changed',
        ])
        const fallback = endpoint === 'reset-credit/inspect'
          ? 'Could not read quota reset details'
          : endpoint === 'reset-credit/prepare'
            ? 'Could not prepare a quota reset'
            : 'Could not use the quota reset'
        const message = error instanceof Error && known.has(error.message) ? error.message : fallback
        return publicError('internal', message)
      }
    }
    const result = await authHandler(endpoint, payload, signal)
    if (endpoint === 'account/remove' && result.ok === true && typeof payload?.id === 'string') {
      await usageReader.clearScope(payload.id)
    }
    if (endpoint === 'logout' && result.ok === true) {
      await usageReader.clear()
      resetCreditService.clear()
      modelCatalog?.clear()
    } else if (result.ok === true && (endpoint === 'account/select' || endpoint === 'account/remove'
      || (endpoint === 'login/status' && result.value?.authenticated === true))) {
      usageReader.clearCache()
      resetCreditService.clear()
      modelCatalog?.clear()
      void modelCatalog?.refresh({ signal: undefined }).catch(() => {})
    } else if (result.ok === true && (endpoint === 'status' || result.value?.authenticated === true)) {
      void modelCatalog?.refresh({ signal: undefined }).catch(() => {})
    }
    return result
  }
}
