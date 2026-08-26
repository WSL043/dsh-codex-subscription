export const IMAGE_REFERENCE_ROLES = Object.freeze([
  { id: 'edit', label: 'imageRoleEdit' },
  { id: 'subject', label: 'imageRoleSubject', prompt: 'imageRoleSubjectPrompt' },
  { id: 'style', label: 'imageRoleStyle', prompt: 'imageRoleStylePrompt' },
  { id: 'composition', label: 'imageRoleComposition', prompt: 'imageRoleCompositionPrompt' },
])

export function buildImageEditDraft({ prompt = '', annotations = [], referenceRole = 'edit', translate }) {
  if (typeof translate !== 'function') throw new TypeError('translate must be a function')
  const notes = annotations
    .map((annotation, index) => ({ number: index + 1, note: typeof annotation?.note === 'string' ? annotation.note.trim() : '' }))
    .filter(annotation => annotation.note !== '')
    .map(annotation => String(annotation.number) + '. ' + annotation.note)
  const base = prompt.trim() === '' ? translate('imageEditDefault') : prompt.trim()
  const role = IMAGE_REFERENCE_ROLES.find(item => item.id === referenceRole)
  const request = role?.prompt === undefined ? base : translate(role.prompt) + '\n' + base
  return notes.length === 0 ? request : request + '\n\n' + translate('imageRegionNotes') + '\n' + notes.join('\n')
}
