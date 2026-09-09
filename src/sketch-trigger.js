function createWorkspaceTrigger({ enabled, open, consume, name, aliases, description }) {
  return {
    trigger: '@', name, showGroupTitle: false, order: -10,
    candidates: async (session, request) => enabled() && !request.quoted && aliases.some(alias => alias.startsWith(request.query.toLowerCase()))
      ? [{ name, description, value: aliases[0] }] : [],
    onPick: ({ session, span }) => {
      if (!enabled() || !consume(session.sessionId, span)) return undefined
      open(session.sessionId)
      return 'handled'
    },
  }
}

export const createSketchTrigger = options => createWorkspaceTrigger({ ...options, name: 'Sketch', aliases: ['sketch', '草图'], description: 'Draw a reference image' })
export const createImageTrigger = options => createWorkspaceTrigger({ ...options, name: 'Image · 生图', aliases: ['image', '生图'], description: 'Describe an image to generate or edit' })
