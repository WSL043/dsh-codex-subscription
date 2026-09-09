import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { SketchStudio } from './sketch-studio.jsx'
export { SKETCH_CSS } from './sketch-styles.js'
export function SketchWorkspace({ preference, attachSketch, registerOpen, t }) {
  const settings = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const [open, setOpen] = useState(false)
  const opener = useRef(null)
  useEffect(() => registerOpen((mode = 'sketch', source = document.activeElement) => {
    opener.current = source
    if (mode === 'sketch') setOpen(true)
  }), [registerOpen])
  return <>
    <SketchStudio open={open} onClose={() => { setOpen(false); opener.current?.focus() }} attachSketch={attachSketch} enabled={settings.imageSketch && settings.imageEditing} t={t} />
  </>
}
