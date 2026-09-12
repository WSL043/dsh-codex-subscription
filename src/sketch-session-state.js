import { createSketchLayers } from './sketch-layers.js'

// Owned by the plugin session, not the input slot. A slot can remount between tools.
export function createSketchSessionState() {
  const ref = current => ({current})
  return {
    doc:ref(createSketchLayers()), undo:ref([]), redo:ref([]), images:ref(new Map()),
    saved:ref(null), dirty:ref(false), documentId:ref(crypto.randomUUID()), documentRevision:ref(0), restoreId:ref(null), mounts:0,
    agentAdapter:ref({}), agentSession:ref(null), agentRun:ref(null),
  }
}

export function createSketchSessionRegistry({ maxIdle = 8 } = {}) {
  const sessions = new Map(), archived = new Map()
  const prune = () => {
    const idle = [...sessions].filter(([,s])=>!s.mounts&&!s.dirty.current&&!s.agentRun.current?.locked&&s.agentRun.current?.state!=='stopped')
    for(const [id,state] of idle.slice(0,Math.max(0,idle.length-maxIdle))) {
      // Saved documents can be loaded by ID; unsaved documents are never evicted.
      if(!state.saved.current && state.doc.current.layers.some(l=>l.image||l.strokes.length))continue
      const restoreId=state.saved.current?.id??state.restoreId.current
      if(restoreId)archived.set(id,restoreId)
      state.agentRun.current?.dispose();state.images.current.clear();sessions.delete(id)
    }
  }
  return {
    get(id) {
      let state=sessions.get(id)
      if(!state){state=createSketchSessionState();state.restoreId.current=archived.get(id)??null;archived.delete(id);sessions.set(id,state)}
      state.retain=()=>{state.mounts++;return ()=>{state.mounts--;prune()}}
      // Refresh insertion order for least-recently-used idle eviction.
      sessions.delete(id);sessions.set(id,state)
      return state
    },
    prune,
    stats:()=>({resident:sessions.size,archived:archived.size}),
    dispose() { for(const value of sessions.values())value.agentRun.current?.dispose();sessions.clear();archived.clear() },
  }
}
