import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createClientFeature, createFeatureReadiness } from './client-feature.js'
import { connectSketchAgent } from './sketch-agent-client.js'
import { FeatureLoadStatus } from './client-feature-status.jsx'

const feature = createClientFeature(() => import('./client-sketch.jsx'))

export function SketchWorkspaceHost({ workspaces, sketchSessions, openers, attachSketch, preference, rpc, t }) {
  const entries = useSyncExternalStore(workspaces.subscribe, workspaces.getSnapshot)
  const snapshot = useSyncExternalStore(feature.subscribe, feature.getSnapshot)
  return <>
    {snapshot.module && entries.length ? <style data-plugin="dsh-codex-subscription-sketch">{snapshot.module.SKETCH_CSS}</style> : null}
    {entries.map(({ id, visible }) => <SketchWorkspace key={id} sessionId={id} visible={visible} workspaces={workspaces}
      sessionState={sketchSessions.get(id)} openers={openers} attachSketch={blob => attachSketch(id, blob)} preference={preference} rpc={rpc} t={t} />)}
  </>
}

export function SketchWorkspace({ preference, attachSketch, registerOpen, openers, t, sessionId, rpc, sessionState, workspaces, visible = true }) {
  const settings = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const snapshot = useSyncExternalStore(feature.subscribe, feature.getSnapshot)
  const [requested, setRequested] = useState(false)
  const [open, setOpen] = useState(false)
  const [incoming, setIncoming] = useState(null)
  const opener = useRef(null)
  const alive = useRef(true)
  const bridgeGeneration = useRef(0)
  const bridgeApi = useRef(null)
  const activated = useRef(false)
  const ready = useRef(null)
  ready.current ??= createFeatureReadiness()
  const enabled = settings.imageSketch && settings.imageEditing
  const agentEnabled = enabled && settings.imageSketchAgent
  const activate = useCallback(() => {
    if (!alive.current) return Promise.reject(Error('Sketch session disconnected'))
    activated.current = true
    setRequested(true)
    return feature.load()
  }, [])
  const agent = useCallback(async generation => {
    if (!activated.current) { opener.current = document.activeElement; setOpen(true) }
    await activate()
    if (!alive.current || bridgeGeneration.current !== generation) throw Error('Sketch session disconnected')
    const api = await ready.current.wait()
    if (!alive.current || bridgeGeneration.current !== generation) throw Error('Sketch session disconnected')
    return api
  }, [activate])
  const onAgentReady = useCallback(api => ready.current.set(api), [])
  const onAgentError = useCallback(error => ready.current.fail(error), [])
  useEffect(() => sessionState?.retain?.(), [sessionState])
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; ready.current.cancel(Error('Sketch session disconnected')) }
  }, [])
  useEffect(() => {
    const openBoard = (mode = 'sketch', source = document.activeElement, file) => {
      opener.current = source
      if (mode === 'sketch') {
        workspaces?.focus(sessionId)
        if (file) setIncoming({ file })
        setOpen(true)
        void activate().catch(() => {})
      }
    }
    return openers ? openers.register(sessionId, openBoard) : registerOpen(openBoard)
  }, [openers, registerOpen, sessionId, activate, workspaces])
  useEffect(() => {
    if (!agentEnabled || !rpc || !sessionId) return
    const generation = ++bridgeGeneration.current
    const execute = operation => workspaces ? workspaces.run(sessionId, operation) : operation()
    const api = Object.freeze({ version: 2, sessionId,
      execute: request => execute(() => agent(generation).then(value => value.execute(request))),
      export: format => agent(generation).then(value => value.export(format)),
    })
    bridgeApi.current = api
    const disconnect = connectSketchAgent(rpc, sessionId, api.execute,
      () => sessionState?.agentRun.current?.fail(),
      () => sessionState?.agentRun.current?.locked ? 350 : workspaces?.visible(sessionId) === false ? 4000 : 2000)
    return () => {
      bridgeGeneration.current++
      disconnect()
      ready.current.cancel(Error('Sketch connection ended'))
      bridgeApi.current = null
    }
  }, [agentEnabled, rpc, sessionId, sessionState, agent, workspaces])
  useEffect(() => {
    const api = bridgeApi.current
    if (!visible || !api) return
    window.dshSketchAgent = api
    return () => { if (window.dshSketchAgent === api) delete window.dshSketchAgent }
  }, [visible, agentEnabled, rpc, sessionId, sessionState, agent, workspaces])
  const Studio = requested && snapshot.module?.SketchStudio
  return <>
    {visible && requested && !Studio ? <FeatureLoadStatus compact failed={snapshot.status === 'error'} t={t}
      onRetry={() => { void activate().catch(() => {}) }} /> : null}
    {Studio ? <Studio sessionState={sessionState} onAgentReady={onAgentReady} onAgentError={onAgentError}
      onAgentState={state => workspaces?.setDrawing(sessionId, state === 'drawing')} agentEnabled={settings.imageSketchAgent}
      visible={visible} onOpen={() => { opener.current = document.activeElement; setOpen(true) }} sessionId={sessionId}
      incoming={incoming} open={visible && open} onClose={() => { setOpen(false); opener.current?.focus() }}
      attachSketch={attachSketch} enabled={enabled} t={t} /> : null}
  </>
}
