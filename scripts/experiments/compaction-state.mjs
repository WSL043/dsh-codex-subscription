/** Experimental wire-state prototype; not imported by the shipped plugin. */
import { createHash } from 'node:crypto'
const clone = value => JSON.parse(JSON.stringify(value))
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const identity = scope => {
  if (!scope?.account || !scope?.model) throw new Error('Account and model scope are required')
  return digest([scope.account, scope.model])
}

/** Only completed responses can replace a checkpoint. Keep every trailing item. */
export function captureCheckpoint(input, response, scope) {
  if (!Array.isArray(input)) throw new Error('Expected a wire input array')
  if (response?.status !== 'completed' || !Array.isArray(response.output)) return undefined
  const index = response.output.findLastIndex(item => item.type === 'compaction')
  if (index < 0) return undefined
  const items = clone(response.output.slice(index))
  if (typeof items[0].encrypted_content !== 'string' || !items[0].encrypted_content) throw new Error('Invalid compaction item')
  return {
    version: 1, scope: identity(scope),
    // Require the exact original wire history before pruning; edits and forks fall back.
    prefixLength: input.length + response.output.length,
    prefixDigest: digest([...input, ...response.output]),
    items, itemsDigest: digest(items),
  }
}

/** Return undefined on a stale/foreign/corrupt checkpoint; caller keeps full history. */
export function replayCheckpoint(history, checkpoint, scope) {
  if (!checkpoint || checkpoint.version !== 1 || checkpoint.scope !== identity(scope)) return undefined
  if (!Array.isArray(history) || !Number.isSafeInteger(checkpoint.prefixLength) || checkpoint.prefixLength < 1 || checkpoint.prefixLength > history.length) return undefined
  if (!Array.isArray(checkpoint.items) || checkpoint.items[0]?.type !== 'compaction' || typeof checkpoint.items[0]?.encrypted_content !== 'string' || !checkpoint.items[0].encrypted_content) return undefined
  if (digest(checkpoint.items) !== checkpoint.itemsDigest || digest(history.slice(0, checkpoint.prefixLength)) !== checkpoint.prefixDigest) return undefined
  return clone([...checkpoint.items, ...history.slice(checkpoint.prefixLength)])
}
