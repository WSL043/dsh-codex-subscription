import { RPC_ENDPOINTS } from './rpc-contract.js'

const knownCodes = new Set(['unavailable', 'invalid-input', 'not-found', 'internal', 'operation-error', 'timeout'])
const pickerStages = new Set(['opened', 'model-list', 'pointer-down', 'activated', 'already-selected', 'submitted', 'rejected', 'threw', 'matched-at-return', 'different-at-return', 'readback-unavailable', 'closed'])

export function createClientIncidentDiagnostics(now = Date.now) {
  const failures = new Map()
  const pending = new Set()
  const modelPicker = []
  let activeCount = 0
  let menuId = 0
  let pickerTruncated = false
  return {
    openPicker() {
      const id = ++menuId
      const record = stage => {
        if (!pickerStages.has(stage)) return
        modelPicker.push({ id, stage, at: now() })
        if (modelPicker.length > 32) { modelPicker.shift(); pickerTruncated = true }
      }
      record('opened')
      return record
    },
    async observeRpc(endpoint, run, signal) {
      if (!RPC_ENDPOINTS.includes(endpoint) || endpoint === 'diagnostics') return run()
      const start = now()
      const entry = { endpoint, start }
      activeCount++
      if (pending.size < 32) pending.add(entry)
      let active = true
      const finish = () => {
        if (active) { active = false; activeCount--; pending.delete(entry) }
      }
      const fail = (kind, code) => failures.set(endpoint, {
        endpoint, kind, at: now(), durationMs: Math.max(0, now() - start),
        ...(knownCodes.has(code) ? { code } : {}),
      })
      const aborted = () => {
        finish()
        if (signal.reason?.code === 'timeout' || signal.reason?.name === 'TimeoutError') fail('timeout')
      }
      if (signal?.aborted) aborted()
      else signal?.addEventListener('abort', aborted, { once: true })
      try {
        const result = await run()
        if (!signal?.aborted) {
          if (result?.ok !== true) fail(result?.ok === false ? 'rpc-rejected' : 'invalid-response', result?.error?.code)
          else {
            const last = failures.get(endpoint)
            if (last && last.nextSuccessAt === undefined) last.nextSuccessAt = now()
          }
        }
        return result
      } catch (error) {
        if (!signal?.aborted) fail('transport-threw', error?.code)
        throw error
      } finally {
        signal?.removeEventListener('abort', aborted)
        finish()
      }
    },
    snapshot() {
      const at = now()
      const active = Array.from(pending).slice(0, 32)
      return {
        ...(failures.size ? { rpcFailures: Array.from(failures.values(), value => ({ ...value })) } : {}),
        ...(active.length ? { inFlight: active.map(({ endpoint, start }) => ({ endpoint, ageMs: Math.max(0, at - start) })) } : {}),
        ...(modelPicker.length ? { modelPicker: modelPicker.slice() } : {}),
        ...(pickerTruncated || activeCount > active.length ? { truncated: true } : {}),
      }
    },
  }
}

// Compare the catalog's current value at acknowledgment time. DSH can still publish a later update.
export async function selectWithDiagnostics(directory, selection, record) {
  record?.('submitted')
  let result
  try { result = await directory.select(selection) } catch { record?.('threw'); return false }
  if (result?.ok === false) { record?.('rejected'); return false }
  if (record) {
    let current
    try { current = directory.store.getSnapshot().current } catch {
      record('readback-unavailable')
      return true
    }
    const matches = current?.provider === selection.provider && current?.model === selection.model &&
      (selection.reasoningEffort === undefined || current?.reasoningEffort === selection.reasoningEffort)
    record(matches ? 'matched-at-return' : 'different-at-return')
  }
  return true
}
