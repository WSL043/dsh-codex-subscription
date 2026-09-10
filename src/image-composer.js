// Shared admission and cleanup for sketches and existing-image edits.
export function attachImageFiles(conversation, input, files, sessionId) {
  // DSH 0.1.5 generalizes image drafts into session-owned attachments.
  const modern = typeof conversation.createDrafts === 'function'
  const create = modern ? () => conversation.createDrafts(sessionId, files) : () => conversation.createDraftImages(files)
  const release = modern ? items => conversation.releaseDraftAttachments(items) : items => conversation.releaseDraftImages(items)
  const add = modern ? input.addAttachments : input.addImages
  if (typeof add !== 'function' || (modern && !sessionId)) throw new Error('Image composer is unavailable')
  const created = create()
  try {
    if (!add.call(input, created.map(item => item.id))) throw new Error('The composer is busy')
  } catch (error) {
    release(created)
    throw error
  }
  return created
}

export function appendImagePrompt(input, text) {
  const current = input.state.getSnapshot()
  if (current.phase !== 'plain') throw new Error('The composer is busy')
  // Whole-draft writes would flatten reference chips. Leave them untouched.
  if (current.occurrences?.length) throw new Error('Keep existing references; add image instructions in the composer')
  input.setDraft([current.draft, text].filter(Boolean).join('\n\n'))
}
