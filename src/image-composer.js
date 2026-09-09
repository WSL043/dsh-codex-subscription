// Shared admission and cleanup for sketches and existing-image edits.
export function attachImageFiles(conversation, input, files) {
  const created = conversation.createDraftImages(files)
  try {
    if (!input.addImages(created.map(item => item.id))) throw new Error('The composer is busy')
  } catch (error) {
    conversation.releaseDraftImages(created)
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
