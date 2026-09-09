// Preserve old per-feature values until the user deliberately changes a group.
export const IMAGE_SETTING_GROUPS = Object.freeze({
  imageCapability: ['imageGeneration', 'imageEditing'],
  imageEntryPoints: ['imageShortcut', 'imageSketch', 'imageTemplates'],
  imageBrowsing: ['imageViewer', 'imageAnnotations', 'imageGallery', 'imageCompare'],
})
export function imageGroupValue(snapshot, group) {
  const fields = IMAGE_SETTING_GROUPS[group]
  if (fields.every(field => snapshot[field] === true)) return 'on'
  if (fields.every(field => snapshot[field] === false)) return 'off'
  return 'mixed'
}
export function imageGroupPatch(group, enabled) {
  return Object.fromEntries(IMAGE_SETTING_GROUPS[group].map(field => [field, enabled]))
}
