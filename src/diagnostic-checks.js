const states = new Set(['pass', 'fail', 'warn', 'unknown', 'not-applicable'])

/** Adapters return bounded reason codes, never exceptions or raw service data. */
export async function collectChecks(definitions, { timeoutMs = 1500, now = Date.now } = {}) {
  return Promise.all(definitions.map(async ({ id, capability, run }) => {
    const startedAt = now()
    let timer
    const controller = new AbortController()
    const base = { id, capability, source: 'server', scope: 'plugin-process' }
    try {
      if (!run) return { ...base, status: 'unknown', reason: 'not-instrumented', observedAt: now() }
      const result = await Promise.race([
        Promise.resolve().then(() => run(controller.signal)),
        new Promise(resolve => { timer = setTimeout(() => {
          controller.abort()
          resolve({ status: 'unknown', reason: 'inspection-timeout' })
        }, timeoutMs) }),
      ])
      const valid = states.has(result?.status) && /^[a-z][a-z0-9-]{0,63}$/u.test(result?.reason ?? '')
      return { ...base, status: valid ? result.status : 'unknown', reason: valid ? result.reason : 'invalid-inspection-result', observedAt: now(), elapsedMs: Math.max(0, now() - startedAt) }
    } catch {
      return { ...base, status: 'unknown', reason: 'inspection-failed', observedAt: now(), elapsedMs: Math.max(0, now() - startedAt) }
    } finally { clearTimeout(timer) }
  }))
}

// Coverage is explicit even where the current implementation has no evidence.
export const diagnosticCapabilities = Object.freeze([
  'account', 'accounts', 'settings', 'models', 'quota', 'search', 'images',
  'sketch', 'subagents', 'compaction', 'transport', 'storage', 'host-ui',
])
