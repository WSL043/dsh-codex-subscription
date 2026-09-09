import { useCallback, useRef, useSyncExternalStore } from 'react'
import { Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
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
    {settings.imageSketch && settings.imageEditing ? <Tooltip label={t('sketch')}>
      <Button variant="toolbar" size="sm" aria-label={t('sketch')}
        onClick={event => workspace.current?.('sketch', event.currentTarget)}
        icon={<WorkspaceIcon name="pen" size={16} />} />
    </Tooltip> : null}
    <SketchWorkspace {...props} registerOpen={registerWorkspace} />
  </>
}
