// Match the model scope documented for Codex composer predictions.
const models = new Map([
  ['gpt-6-astra', 'GPT-6 Astra'],
  ['gpt-6.1-sol', 'GPT-6.1 Sol'],
  ['gpt-6.1-terra', 'GPT-6.1 Terra'],
])

export const composerPredictionModelNames = [...models.values()].join(', ')
export const supportsComposerPrediction = model => models.has(model)
