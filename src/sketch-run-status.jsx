import { WorkspaceIcon } from './workspace-icons.jsx'

export function SketchRunStatus({state,t,floating=false,onOpen,onStop,onResume,onDismiss}) {
  if(state==='idle')return null
  const drawing=state==='drawing',recover=state==='stopped'||state==='failed'
  return <div className={floating?'codexSketchBackgroundStatus':'codexSketchAgentStatus'} role="status" aria-live="polite">
    <WorkspaceIcon name={drawing?'pen':state==='finished'?'check':'rectangle'} size={15}/>
    {floating?<button type="button" onClick={onOpen}>{t(`sketchRun_${state}`)}</button>:<span>{t(`sketchRun_${state}`)}</span>}
    {drawing?<button type="button" className="codexSketchStop" onClick={onStop}><WorkspaceIcon name="stop" size={12}/>{t('sketchRunStop')}</button>:<>
      {recover?<button type="button" title={t('sketchRunResumeHint')} onClick={onResume}>{t('sketchRunResume')}</button>:null}
      {!recover?<button type="button" aria-label={t('sketchDismissStatus')} title={t('sketchDismissStatus')} onClick={onDismiss}><WorkspaceIcon name="close" size={14}/></button>:null}
    </>}
  </div>
}
