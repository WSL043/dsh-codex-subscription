// Public API identifiers are candidates, not a promise of subscription access.
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2'
const experimentalQuality = Object.freeze(['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
export const IMAGE_MODELS = Object.freeze({
  'gpt-image-2': Object.freeze(['auto', 'low', 'medium', 'high']),
  'gpt-image-2.5-flare': experimentalQuality,
  'gpt-image-2.5-sunburst': experimentalQuality,
  'gpt-image-2.6-flare': experimentalQuality,
  'gpt-image-2.6-sunburst': experimentalQuality,
})

export const isExperimentalImageModel = model => model !== DEFAULT_IMAGE_MODEL && Object.hasOwn(IMAGE_MODELS, model)
export const imageModelLabel = model => model.replace('gpt-image-', 'GPT Image ').replace('-flare', ' Flare').replace('-sunburst', ' Sunburst')

export function resolveImageModel(model = DEFAULT_IMAGE_MODEL) {
  if (typeof model !== 'string' || !Object.hasOwn(IMAGE_MODELS, model)) throw new Error('Unknown image model')
  return model
}

export function validateImageQuality(model, quality) {
  if (!IMAGE_MODELS[resolveImageModel(model)].includes(quality)) throw new Error(`Unsupported quality for ${model}`)
}
