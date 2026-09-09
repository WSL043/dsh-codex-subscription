import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS, resolveImageModel } from './image-models.js'
export const IMAGE_FEATURE_DEFAULTS = Object.freeze({
  imageGeneration: true,
  imageShortcut: true,
  imageEditing: true,
  imageViewer: true,
  imageAnnotations: true,
  imageSketch: true,
  imageTemplates: true,
  imageGallery: true,
  imageCompare: true,
})

export function readImageFeatures(value = {}) {
  return Object.fromEntries(Object.entries(IMAGE_FEATURE_DEFAULTS).map(([key, fallback]) => [key,
    typeof value?.[key] === 'boolean' ? value[key] : fallback]))
}

export function readImageDefaults(value = {}) {
  const imageModel = Object.hasOwn(IMAGE_MODELS, value?.imageModel) ? value.imageModel : DEFAULT_IMAGE_MODEL
  return { imageModel, imageQuality: IMAGE_MODELS[imageModel].includes(value?.imageQuality) ? value.imageQuality : 'auto' }
}

export function imageFeaturePatch(value = {}) {
  const patch = {}
  if (Object.hasOwn(value, 'imageModel')) patch.imageModel = resolveImageModel(value.imageModel)
  if (Object.hasOwn(value, 'imageQuality')) {
    if (!['auto','low','medium','high','xhigh','max'].includes(value.imageQuality)) throw new Error('Invalid image quality')
    patch.imageQuality = value.imageQuality
  }
  for (const key of Object.keys(IMAGE_FEATURE_DEFAULTS)) {
    if (!Object.hasOwn(value, key)) continue
    if (typeof value[key] !== 'boolean') throw new Error('Invalid image feature preference')
    patch[key] = value[key]
  }
  return patch
}

export function assertImageOperation(features, editing) {
  const current = readImageFeatures(features)
  if (!(editing ? current.imageEditing : current.imageGeneration)) {
    throw new Error(editing ? 'Image editing is disabled in subscription settings' : 'Image generation is disabled in subscription settings')
  }
}
