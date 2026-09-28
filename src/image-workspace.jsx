import { useCallback, useRef, useSyncExternalStore } from 'react'
import { ComposerControl } from './client-composer-space.jsx'
import { Button, Tooltip } from './client-primitives.js'
import { SketchWorkspace } from './sketch-workspace.jsx'
import { WorkspaceIcon } from './workspace-icons.jsx'

export function ImageWorkspace(props) {
  const { preference, t, registerOpen } = props
  const settings = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const workspace = useRef(null)
  const registerWorkspace = useCallback(callback => {
    workspace.current = callback
    const dispose = registerOpen(callback)
    return () => { workspace.current = null; dispose() }
  }, [registerOpen])
  return <>
    {settings.imageSketch && settings.imageEditing ? <ComposerControl priority={2}><Tooltip label={t('sketch')}>
      <Button variant="toolbar" size="sm" aria-label={t('sketch')}
        onClick={event => workspace.current?.('sketch', event.currentTarget)}
        icon={<WorkspaceIcon name="pen" size={16} />} />
    </Tooltip></ComposerControl> : null}
    <SketchWorkspace key={props.sessionId} {...props} registerOpen={registerWorkspace} />
  </>
}
