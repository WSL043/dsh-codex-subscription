import { createSketchLayers } from './sketch-layers.js'

// Owned by the plugin session, not the input slot. A slot can remount between tools.
export function createSketchSessionState() {
  const ref = current => ({current})
  return {
    doc:ref(createSketchLayers()), undo:ref([]), redo:ref([]), images:ref(new Map()),
    saved:ref(null), dirty:ref(false), documentId:ref(crypto.randomUUID()), documentRevision:ref(0),
    agentAdapter:ref({}), agentSession:ref(null), agentRun:ref(null),
  }
}

export function createSketchSessionRegistry() {
  const sessions = new Map()
  return {
    get(id) { if(!sessions.has(id))sessions.set(id,createSketchSessionState());return sessions.get(id) },
    dispose() { for(const value of sessions.values())value.agentRun.current?.dispose();sessions.clear() },
  }
}
