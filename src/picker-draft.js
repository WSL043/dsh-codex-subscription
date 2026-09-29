// The preference controller ignores a write that arrives while another one is
// saving. Quick toggles therefore live in a local draft and go out as one write
// once the previous one has settled.

export const toggleModelId = (draft, modelId) => draft.includes(modelId)
  ? draft.filter(id => id !== modelId)
  : [...draft, modelId]

/**
 * What to do with the draft after a render.
 * - adopt: nothing pending, follow the saved value
 * - wait: a change is pending but a write is still in flight
 * - save: send the draft
 * - settled: the pending change already equals the saved value
 */
export function draftStep({ dirty, writable, draft, saved }) {
  if (!dirty) return 'adopt'
  if (!writable) return 'wait'
  return JSON.stringify(draft) === JSON.stringify(saved) ? 'settled' : 'save'
}
