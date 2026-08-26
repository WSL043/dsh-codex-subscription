export function buildImageEditDraft({ prompt = '', annotations = [], translate }) {
  if (typeof translate !== 'function') throw new TypeError('translate must be a function')
  const notes = annotations
    .map((annotation, index) => ({ number: index + 1, note: typeof annotation?.note === 'string' ? annotation.note.trim() : '' }))
    .filter(annotation => annotation.note !== '')
    .map(annotation => String(annotation.number) + '. ' + annotation.note)
  const base = prompt.trim() === '' ? translate('imageEditDefault') : prompt.trim()
  return notes.length === 0 ? base : base + '\n\n' + translate('imageRegionNotes') + '\n' + notes.join('\n')
}
