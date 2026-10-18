// name and description may be functions, so the entry follows the interface language.
const resolve = value => typeof value === 'function' ? value() : value
function createWorkspaceTrigger({ enabled, open, consume, name, aliases, description }) {
  return {
    trigger: '@', get name() { return resolve(name) }, showGroupTitle: false, order: -10,
    candidates: async (session, request) => enabled() && !request.quoted && aliases.some(alias => alias.startsWith(request.query.toLowerCase()))
      ? [{ name: resolve(name), description: resolve(description), value: aliases[0] }] : [],
    onPick: ({ session, span }) => {
      if (!enabled() || !consume(session.sessionId, span)) return undefined
      open(session.sessionId)
      return 'handled'
    },
  }
}

// Picking an Agent entry edits the composer; only the tool opens the board.
export const createSketchTrigger = options => createWorkspaceTrigger({ ...options, open:()=>{}, aliases: ['sketch', '草图'], name: options.name ?? 'Sketch · Beta', description: options.description ?? 'Ask the Agent to draw or edit a sketch' })
export const createImageTrigger = options => createWorkspaceTrigger({ ...options, aliases: ['image', '生图'], name: options.name ?? 'Image · 生图', description: options.description ?? 'Describe an image to generate or edit' })
