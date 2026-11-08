import { useEffect, useSyncExternalStore } from 'react'
import { Button, Tooltip } from './client-primitives.jsx'
import { WorkspaceIcon } from './workspace-icons.jsx'

export function ImageWorkspace({ preference, t, sessionId, workspaces, openSketch }) {
  const settings = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const enabled = settings.imageSketch && settings.imageEditing
  useEffect(() => sessionId ? workspaces.attach(sessionId) : undefined, [sessionId, workspaces])
  if (!enabled) return null
  return <Tooltip label={t('sketch')} side="top" delayMs={350}>
    <Button variant="ghost" size="sm" aria-label={t('sketch')}
      onClick={event => openSketch(sessionId, event.currentTarget)}
      icon={<WorkspaceIcon name="pen" size={16} />} />
  </Tooltip>
}
