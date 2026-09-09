import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { SketchWorkspace } from './sketch-workspace.jsx'
import { WorkspaceIcon } from './workspace-icons.jsx'

export function ImageWorkspace(props) {
  const { preference, t, registerOpen } = props
  const settings = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const [open, setOpen] = useState(false)
  const anchor = useRef(null)
  const workspace = useRef(null)
  const frame = useRef(null)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  const registerWorkspace = useCallback(callback => {
    workspace.current = callback
    const dispose = registerOpen(callback)
    return () => { workspace.current = null; dispose() }
  }, [registerOpen])
  const actions = [
    settings.imageShortcut && (settings.imageGeneration || settings.imageEditing) && { id: 'image', label: t('imageCreateAction') },
    settings.imageSketch && settings.imageEditing && { id: 'sketch', label: t('sketch') },
  ].filter(Boolean)
  const items = actions.length ? [{ type: 'label', id: 'create', text: t('imageCreateGroup') }, ...actions] : []
  return <>
    {items.length ? <span ref={anchor} className="codexImageWorkspaceAnchor">
      <Menu open={open} items={items} side="top" align="start" portal
        onClose={() => { setOpen(false); anchor.current?.querySelector('button')?.focus() }}
        onSelect={id => {
          setOpen(false)
          const source = anchor.current?.querySelector('button')
          cancelAnimationFrame(frame.current)
          frame.current = requestAnimationFrame(() => {
            workspace.current?.(id, source)
          })
        }} anchor={<Tooltip label={t('imageWorkspaceMenu')}>
          <Button variant="toolbar" size="sm" aria-label={t('imageWorkspaceMenu')}
            aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}
            icon={<WorkspaceIcon name="image" size={16} />} />
        </Tooltip>} />
    </span> : null}
    <SketchWorkspace {...props} registerOpen={registerWorkspace} />
  </>
}
