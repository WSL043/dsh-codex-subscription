import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { SketchStudio } from './sketch-studio.jsx'
export { SKETCH_CSS } from './sketch-styles.js'
export function SketchWorkspace({ preference, attachSketch, appendPrompt, registerOpen, t }) {
  const settings = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const opener = useRef(null)
  useEffect(() => registerOpen((mode = 'sketch', source = document.activeElement) => {
    opener.current = source
    setError('')
    if (mode === 'image') {
      try { appendPrompt(t('imageInlinePrompt'), 'image') } catch { setError(t('imageDraftFailed')) }
    } else if (mode === 'sketch') setOpen(true)
  }), [registerOpen, appendPrompt, t])
  return <>
    <SketchStudio open={open} onClose={() => { setOpen(false); opener.current?.focus() }} attachSketch={attachSketch} enabled={settings.imageSketch && settings.imageEditing} t={t} />
    {error ? <span role="alert">{error}</span> : null}
  </>
}
