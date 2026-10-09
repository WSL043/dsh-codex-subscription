// Shared admission and cleanup for sketches and existing-image edits.
export function attachImageFiles(conversation, input, files, sessionId) {
  if (typeof conversation.createDrafts !== 'function' || typeof input.addAttachments !== 'function' || !sessionId) throw new Error('Image composer is unavailable')
  const created = conversation.createDrafts(sessionId, files)
  try {
    if (!input.addAttachments(created.map(item => item.id))) throw new Error('The composer is busy')
  } catch (error) {
    conversation.releaseDraftAttachments(created)
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
