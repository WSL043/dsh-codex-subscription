/**
 * Everything the plugin has cached on behalf of one signed-in account.
 *
 * An account change is not only a new access token: the model catalogue, the
 * quota reading, the plan history, the reset credits, the open WebSocket/SSE
 * sessions and the ChatGPT connector client all describe the account that was
 * active when they were read. Serving any of them after a switch would mix two
 * accounts — the failure this module exists to prevent.
 *
 * The account transaction itself has already committed when this runs, so a
 * failure here must never be reported as a failed switch. It is recorded as a
 * cleanup failure and the remaining invalidations still run.
 */

/**
 * @param {object} options
 * @param {string} [options.endpoint] - the account action that committed.
 * @param {object} [options.payload] - that action's payload (used to scope removal).
 * @param {() => void} [options.closeConnections] - drops the transport sessions.
 * @param {object} [options.usageReader]
 * @param {object} [options.accountUsageReader]
 * @param {object} [options.planHistoryReader]
 * @param {object} [options.usageProfileReader]
 * @param {object} [options.resetCreditService]
 * @param {object} [options.modelCatalog]
 * @param {() => void} [options.onAccountChanged] - wakes listeners parked on the old account.
 * @param {() => void} [options.onCleanupFailure]
 * @param {boolean} [options.refreshCatalog] - false for a sign-out, where there is no account to read.
 * @returns {Promise<void>} resolves once every invalidation settled.
 */
export async function applyAccountTransition({
  endpoint,
  payload,
  closeConnections,
  usageReader,
  accountUsageReader,
  planHistoryReader,
  usageProfileReader,
  resetCreditService,
  modelCatalog,
  onAccountChanged,
  onCleanupFailure,
  refreshCatalog = true,
} = {}) {
  const tasks = [
    () => closeConnections?.(),
    () => usageReader?.clearCache?.(),
    () => planHistoryReader?.clear?.(),
    () => usageProfileReader?.clear?.(),
    () => resetCreditService?.clear?.(),
    () => modelCatalog?.clear?.(),
    () => onAccountChanged?.(),
  ]
  if (endpoint === 'logout') tasks.push(() => usageReader?.clear?.(), () => accountUsageReader?.clear?.())
  if (endpoint === 'login/status') tasks.push(() => accountUsageReader?.clear?.())
  if (endpoint === 'account/remove' && typeof payload?.id === 'string') tasks.push(() => usageReader?.clearScope?.(payload.id))
  // A failover switch names no endpoint: it still has to drop every account-scoped
  // reading, and it must not clear the per-account usage readers, whose caches are
  // keyed by account id and stay valid for the accounts that did not change.
  const outcomes = await Promise.allSettled(tasks.map(task => Promise.resolve().then(task)))
  const shouldRefresh = refreshCatalog && endpoint !== 'logout'
  const catalogOutcomes = shouldRefresh
    ? await Promise.allSettled([Promise.resolve().then(() => modelCatalog?.initialize?.())])
    : []
  if ([...outcomes, ...catalogOutcomes].some(value => value.status === 'rejected')) {
    try { onCleanupFailure?.() } catch { /* diagnostics must not change the account result */ }
  }
  // The reload joins the transition but must not delay it: the switch has committed
  // and a slow catalogue read is exactly what a first request after it can wait on.
  if (shouldRefresh) void Promise.resolve().then(() => modelCatalog?.refresh?.({ signal: undefined })).catch(() => {})
}
