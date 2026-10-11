// The plugin's retry setting as the retry policy DSH's own retry layer understands. "default" leaves the policy
// out, so DSH applies its standard one (a few retries with backoff).

/** @param {string} choice a RETRY_POLICIES value @param {Function | undefined} resolve DSH's resolveRetryPolicy */
export function retryPolicyFor(choice, resolve) {
  if (choice === 'default' || typeof resolve !== 'function') return undefined
  try {
    if (choice === 'unlimited') return resolve({ mode: 'always' }, 'codex-subscription retryPolicy')
    return resolve({ mode: 'normal', maxRetries: choice === 'off' ? 0 : Number(choice) }, 'codex-subscription retryPolicy')
  } catch {
    // A DSH build that rejects the shape keeps its own default.
    return undefined
  }
}
