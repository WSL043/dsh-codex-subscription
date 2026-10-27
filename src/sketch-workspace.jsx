import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createClientFeature, createFeatureReadiness } from './client-feature.js'
import { connectSketchAgent } from './sketch-agent-client.js'
import { FeatureLoadStatus } from './client-feature-status.jsx'

const feature = createClientFeature(() => import('./client-sketch.jsx'))

export function SketchWorkspace({ preference, attachSketch, registerOpen, t, sessionId, rpc, sessionState }) {
  const settings = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const snapshot = useSyncExternalStore(feature.subscribe, feature.getSnapshot)
  const [requested, setRequested] = useState(false)
  const [open, setOpen] = useState(false)
  const [incoming, setIncoming] = useState(null)
  const opener = useRef(null)
  const alive = useRef(true)
  const bridgeGeneration = useRef(0)
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
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; ready.current.cancel(Error('Sketch session disconnected')) }
  }, [])
  useEffect(() => registerOpen((mode = 'sketch', source = document.activeElement, file) => {
    opener.current = source
    if (mode === 'sketch') { if (file) setIncoming({ file }); setOpen(true); void activate().catch(() => {}) }
  }), [registerOpen, activate])
  useEffect(() => {
    if (!agentEnabled || !rpc || !sessionId) return
    const generation = ++bridgeGeneration.current
    const api = Object.freeze({ version: 2, sessionId,
      execute: request => agent(generation).then(value => value.execute(request)),
      export: format => agent(generation).then(value => value.export(format)),
    })
    window.dshSketchAgent = api
    const disconnect = connectSketchAgent(rpc, sessionId, api.execute,
      () => sessionState?.agentRun.current?.fail(),
      () => sessionState?.agentRun.current?.locked ? 350 : 2000)
    return () => {
      bridgeGeneration.current++
      disconnect()
      ready.current.cancel(Error('Sketch connection ended'))
      if (window.dshSketchAgent === api) delete window.dshSketchAgent
    }
  }, [agentEnabled, rpc, sessionId, sessionState, agent])
  const Studio = requested && snapshot.module?.SketchStudio
  return <>
    {requested && !Studio ? <FeatureLoadStatus compact failed={snapshot.status === 'error'} t={t}
      onRetry={() => { void activate().catch(() => {}) }} /> : null}
    {Studio ? <><style data-plugin="dsh-codex-subscription-sketch">{snapshot.module.SKETCH_CSS}</style>
      <Studio sessionState={sessionState} bridgeManaged onAgentReady={onAgentReady} onAgentError={onAgentError} agentEnabled={settings.imageSketchAgent} onOpen={() => { opener.current = document.activeElement; setOpen(true) }} sessionId={sessionId} rpc={rpc} incoming={incoming} open={open} onClose={() => { setOpen(false); opener.current?.focus() }} attachSketch={attachSketch} enabled={enabled} t={t} />
    </> : null}
  </>
}
