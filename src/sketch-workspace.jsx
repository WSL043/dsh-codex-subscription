import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { SketchStudio } from './sketch-studio.jsx'
export { SKETCH_CSS } from './sketch-styles.js'
export function SketchWorkspace({ preference, attachSketch, registerOpen, t, sessionId, rpc }) {
  const settings = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const [open, setOpen] = useState(false)
  const [incoming, setIncoming] = useState(null)
  const opener = useRef(null)
  useEffect(() => registerOpen((mode = 'sketch', source = document.activeElement, file) => {
    opener.current = source
    if (mode === 'sketch') {if(file)setIncoming({file});setOpen(true)}
  }), [registerOpen])
  return <>
    <SketchStudio agentEnabled={settings.imageSketchAgent} onOpen={() => { opener.current = document.activeElement; setOpen(true) }} sessionId={sessionId} rpc={rpc} incoming={incoming} open={open} onClose={() => { setOpen(false); opener.current?.focus() }} attachSketch={attachSketch} enabled={settings.imageSketch && settings.imageEditing} t={t} />
  </>
}
