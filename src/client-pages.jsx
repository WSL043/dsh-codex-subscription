import { useId, useState } from 'react'
import { Hint } from './client-hint.jsx'
import { Switch, IconChevronDownOutline14, IconChevronRightOutline14 } from './client-primitives.js'
import { usePreferenceSnapshot } from './client-shared.js'
import { CapabilityPreferences } from './capability-preferences.jsx'
import { DefaultModelPreference } from './default-model-preferences.jsx'
import { RuntimeManagement } from './client-runtime-management.jsx'
import { RemoteControlCard } from './client-remote-control.jsx'
import { VoiceCallCard } from './client-voice-call.jsx'
import { DiagnosticsCard } from './client-diagnostics.jsx'
import { StorageCard } from './client-storage.jsx'
import {
  AutoQuotaRetryPreference, ConnectorsPreference, ContextWindowPreference, InputImageDetailPreference, ModelCatalogStatus,
  PickerModelsPreference, QuickQuotaPreference, ReasoningSummaryPreference, RetryPolicyPreference, SearchProviderPreference,
  StreamIdleTimeoutPreference,
} from './client-preferences.jsx'
import { OUTPUT_VERBOSITY_DEFAULT, OUTPUT_VERBOSITY_FIELD, OUTPUT_VERBOSITY_HIGH, OUTPUT_VERBOSITY_LOW, OUTPUT_VERBOSITY_MEDIUM, QUICK_QUOTA_MODE_OFF } from './settings-contract.js'
import { IMAGE_MODELS } from './image-models.js'
import { ImageChoice } from './image-preferences.jsx'

const ready = snapshot => snapshot.status === 'ready' && snapshot.writable === true
const modelLabel = model => model.replace('gpt-image-', 'GPT Image ').replace('-flare', ' Flare').replace('-sunburst', ' Sunburst')

/** One feature: what it does in a sentence, a switch (or a status when it has none) and, when it has options, a "Settings" fold-out. */
export function FeatureRow({ t, title, summary, beta, checked, onChange, disabled, reason, status, children, onMore, moreLabel }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <div className="codexFeatureRow" data-off={checked === false || undefined} data-blocked={reason ? 'true' : undefined}>
    <div className="codexFeatureMain">
      <div className="codexFeatureCopy">
        <span className="codexFeatureTitle">{title}{beta ? <small>Beta</small> : null}</span>
        <span className="codexFeatureSummary">{reason ?? summary}</span>
      </div>
      {status !== undefined && !children ? <span className="codexFeatureStatus">{status}</span> : null}
      {checked !== undefined ? <Switch checked={checked} label={title} disabled={disabled || Boolean(reason)} onChange={onChange} /> : null}
      {children ? <button type="button" className="codexFeatureMore" aria-label={`${title} · ${t('featureSettings')}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{status !== undefined ? <span>{status}</span> : null}<IconChevronDownOutline14 /></button>
        : onMore ? <button type="button" className="codexFeatureMore" aria-label={`${title} · ${moreLabel ?? t('featureDetails')}`} onClick={onMore}><IconChevronRightOutline14 /></button> : <span className="codexFeatureMoreSpace" />}
    </div>
    {children && open ? <div className="codexFeatureOptions" id={id}>{children}</div> : null}
  </div>
}

function SwitchRow({ t, title, hint, checked, disabled, reason, onChange }) {
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{title}</span><Hint t={t}>{reason ?? hint}</Hint></div>
    <Switch checked={checked} label={title} disabled={disabled || Boolean(reason)} onChange={onChange} />
  </div>
}

/** The first thing a new user sees: every feature, what it does, and how to turn it on. */
export function FeatureOverview({ preference, t, go }) {
  const snapshot = usePreferenceSnapshot(preference)
  const writable = ready(snapshot)
  const set = patch => { void preference.set(patch) }
  const imagesOn = snapshot.imageGeneration || snapshot.imageEditing
  const connectorsOn = snapshot.connectors !== 'off'
  return <section className="codexSubscriptionCard codexFeatureOverview" aria-label={t('featureOverviewTitle')}>
    <h3>{t('featureOverviewTitle')}</h3>
    <FeatureRow t={t} title={t('featureSearchTitle')} summary={t('featureSearchSummary')} status={`${t(`searchSource_${snapshot.searchProvider}`)} · ${t(`searchMode_${snapshot.searchMode}`)}`}>
      <SearchProviderPreference preference={preference} t={t} />
    </FeatureRow>
    <FeatureRow t={t} title={t('featureImageTitle')} summary={t('featureImageSummary')} checked={imagesOn} disabled={!writable}
      onChange={next => set({ imageGeneration: next, imageEditing: next })}>
      <SwitchRow t={t} title={t('imageGenerationRow')} hint={t('imageGenerationRowHint')} checked={snapshot.imageGeneration} disabled={!writable} onChange={next => set({ imageGeneration: next })} />
      <SwitchRow t={t} title={t('imageEditingRow')} hint={t('imageEditingRowHint')} checked={snapshot.imageEditing} disabled={!writable} onChange={next => set({ imageEditing: next })} />
    </FeatureRow>
    <FeatureRow t={t} title={t('featureConnectorsTitle')} summary={t('featureConnectorsSummary')} checked={connectorsOn} disabled={!writable}
      onChange={next => set({ connectors: next ? 'read' : 'off' })}>
      <ConnectorsPreference preference={preference} t={t} />
    </FeatureRow>
    <FeatureRow t={t} title={t('featureSketchTitle')} summary={t('featureSketchSummary')} beta checked={snapshot.imageSketch} disabled={!writable}
      reason={!imagesOn && !snapshot.imageSketch ? t('featureSketchNeedsImages') : undefined}
      onChange={next => set(next ? { imageSketch: true } : { imageSketch: false, imageSketchAgent: false })}>
      <SwitchRow t={t} title={t('sketchAgentRow')} hint={t('sketchAgentRowHint')} checked={snapshot.imageSketchAgent} disabled={!writable}
        reason={!snapshot.imageSketch ? t('sketchAgentNeedsBoard') : undefined} onChange={next => set({ imageSketchAgent: next })} />
    </FeatureRow>
    <FeatureRow t={t} title={t('featureVoiceTitle')} summary={t('featureVoiceSummary')} checked={snapshot.voiceCall === 'on'} disabled={!writable}
      onChange={next => set({ voiceCall: next ? 'on' : 'off' })} onMore={() => go('more')} />
    <FeatureRow t={t} title={t('featureRemoteTitle')} summary={t('featureRemoteSummary')} beta checked={snapshot.remoteControl === 'on'} disabled={!writable}
      onChange={next => set({ remoteControl: next ? 'on' : 'off' })} onMore={() => go('more')} moreLabel={t('featurePair')} />
    <div className="codexFeatureScope">
      <SwitchRow t={t} title={t('otherModelsTitle')} hint={t('otherModelsHint')} checked={snapshot.otherModels !== 'off'} disabled={!writable}
        onChange={next => set({ otherModels: next ? 'on' : 'off' })} />
    </div>
  </section>
}

/** Showing quota in the composer comes first; the alert only does something once there is something to look at. */
export function QuotaSettingsCard({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const hidden = snapshot.quickQuotaMode === QUICK_QUOTA_MODE_OFF
  return <section className="codexSubscriptionCard codexSubscriptionPreferencesCard" aria-label={t('quotaSettingsTitle')}>
    <h3>{t('quotaSettingsTitle')}</h3>
    <QuickQuotaPreference preference={preference} t={t} />
    <div className="codexSubscriptionDivider" />
    <div className="codexQuotaAlerts" data-disabled={hidden || undefined}>
      <CapabilityPreferences preference={preference} t={t} section="quota" disabled={hidden} />
      {hidden ? <p className="codexSubscriptionPreferenceHint">{t('quotaAlertsNeedDisplay')}</p> : null}
    </div>
    <div className="codexSubscriptionDivider" />
    <AutoQuotaRetryPreference preference={preference} t={t} />
  </section>
}

function OutputVerbosityPreference({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const writable = ready(snapshot)
  const values = [OUTPUT_VERBOSITY_DEFAULT, OUTPUT_VERBOSITY_LOW, OUTPUT_VERBOSITY_MEDIUM, OUTPUT_VERBOSITY_HIGH]
  const label = { [OUTPUT_VERBOSITY_DEFAULT]: 'verbosityDefault', [OUTPUT_VERBOSITY_LOW]: 'verbosityLow', [OUTPUT_VERBOSITY_MEDIUM]: 'verbosityMedium', [OUTPUT_VERBOSITY_HIGH]: 'verbosityHigh' }
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('verbosityTitle')}</span><Hint t={t}>{t('verbosityPageHint')}</Hint></div>
    <div className="codexSubscriptionQuotaModes" role="radiogroup" aria-label={t('verbosityTitle')} aria-busy={snapshot.saving || undefined}>
      {values.map(value => <label key={value} className="codexSubscriptionQuotaMode"><input type="radio" name="codex-output-verbosity" checked={snapshot.outputVerbosity === value} disabled={!writable} onChange={() => { void preference.set({ [OUTPUT_VERBOSITY_FIELD]: value }) }} /><span>{t(label[value])}</span></label>)}
    </div>
  </div>
}

function Radios({ snapshot, preference, field, values, label, name, text, disabled }) {
  return <div className="codexSubscriptionQuotaModes" role="radiogroup" aria-label={label} aria-busy={snapshot.saving || undefined}>
    {values.map(value => <label key={value} className="codexSubscriptionQuotaMode"><input type="radio" name={name} checked={snapshot[field] === value} disabled={disabled || !snapshot.writable} onChange={() => { void preference.set({ [field]: value }) }} /><span>{text(value)}</span></label>)}
  </div>
}

export function ModelsPage({ preference, t, defaultModel }) {
  const snapshot = usePreferenceSnapshot(preference)
  return <div className="codexSubscriptionAdvancedPreferences">
    {snapshot.restartRequired ? <p className="codexSubscriptionError" role="status">{t('settingsRestartRequired')}</p> : null}
    <section className="codexSubscriptionCard codexSubscriptionPreferencesCard" aria-label={t('modelsSectionTitle')}>
      <h3>{t('modelsSectionTitle')}</h3>
      {defaultModel === undefined ? null : <><DefaultModelPreference preference={preference} defaultModel={defaultModel} t={t} /><div className="codexSubscriptionDivider" /></>}
      <ModelCatalogStatus preference={preference} t={t} />
      <div className="codexSubscriptionDivider" />
      <PickerModelsPreference preference={preference} t={t} />
    </section>
    <section className="codexSubscriptionCard codexSubscriptionPreferencesCard" aria-label={t('answerStyleTitle')}>
      <h3>{t('answerStyleTitle')}</h3>
      <ReasoningSummaryPreference preference={preference} t={t} />
      <div className="codexSubscriptionDivider" />
      <OutputVerbosityPreference preference={preference} t={t} />
      <div className="codexSubscriptionDivider" />
      <InputImageDetailPreference preference={preference} t={t} />
    </section>
    <details className="codexSubscriptionCard codexAdvancedFold">
      <summary>{t('advancedTitle')}<span>{t('advancedSummary')}</span></summary>
      <div className="codexAdvancedBody">
        <ContextWindowPreference preference={preference} t={t} />
        <div className="codexSubscriptionDivider" />
        <RetryPolicyPreference preference={preference} t={t} />
        <div className="codexSubscriptionDivider" />
        <StreamIdleTimeoutPreference preference={preference} t={t} />
        <div className="codexSubscriptionDivider" />
        <div className="codexSubscriptionPreference">
          <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('connectionTitle')} <small>Beta</small></span><Hint t={t}>{t('connectionHint')}</Hint></div>
          <Radios snapshot={snapshot} preference={preference} field="connectionMode" values={['sse', 'websocket']} name="codex-connection-mode" label={t('connectionTitle')} text={value => t(`connection_${value}`)} />
        </div>
        <div className="codexSubscriptionDivider" />
        <div className="codexSubscriptionPreference">
          <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('compactionTitle')} <small>Beta</small></span><Hint t={t}>{t('compactionHint')}</Hint></div>
          <Radios snapshot={snapshot} preference={preference} field="compactionMode" values={['dsh', 'cloud']} name="codex-compaction-mode" label={t('compactionTitle')} text={value => t(`compaction_${value}`)} />
        </div>
      </div>
    </details>
  </div>
}

export function ToolsPage({ preference, rpc, t, go }) {
  const snapshot = usePreferenceSnapshot(preference)
  const others = snapshot.otherModels !== 'off'
  return <div className="codexSubscriptionAdvancedPreferences">
    <div className="codexScopeNote" data-others-off={others ? undefined : 'true'}>
      <span>{others ? t('toolsScopeOn') : t('toolsScopeOff')}</span>
      <button type="button" onClick={() => go('start')}>{t('toolsScopeChange')}</button>
    </div>
    <section className="codexSubscriptionCard codexSubscriptionPreferencesCard" aria-label={t('searchSectionTitle')}>
      <SearchProviderPreference preference={preference} t={t} />
    </section>
    <section className="codexSubscriptionCard codexSubscriptionPreferencesCard" aria-label={t('connectors')}>
      <ConnectorsPreference preference={preference} t={t} />
    </section>
    <section className="codexSubscriptionCard codexSubscriptionPreferencesCard" aria-label={t('reviewModelTitle')}>
      <div className="codexSubscriptionPreference">
        <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('reviewModelTitle')} <small>Beta</small></span><Hint t={t}>{t('reviewModelHint')}</Hint></div>
        <Radios snapshot={snapshot} preference={preference} field="reviewModel" values={['session', 'official']} name="codex-review-model" label={t('reviewModelTitle')} text={value => t(`reviewModel_${value}`)} />
      </div>
    </section>
    <section className="codexSubscriptionCard codexSubscriptionPreferencesCard" aria-label={t('subagentBackendTitle')}>
      <div className="codexSubscriptionPreference">
        <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('subagentBackendTitle')} <small>Beta</small></span><Hint t={t}>{t(snapshot.subagentBackendAvailable ? 'subagentBackendHint' : 'subagentBackendUnavailable')}</Hint></div>
        <Radios snapshot={snapshot} preference={preference} field="subagentBackend" values={['dsh', 'codex']} name="codex-subagent-backend" label={t('subagentBackendTitle')} text={value => t(`subagentBackend_${value}`)}
          disabled={!snapshot.subagentBackendAvailable} />
      </div>
      <RuntimeManagement rpc={rpc} preference={preference} t={t} />
    </section>
  </div>
}

export function CreatePage({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const writable = ready(snapshot)
  const set = patch => { void preference.set(patch) }
  const imagesOn = snapshot.imageGeneration || snapshot.imageEditing
  const disabled = !writable || snapshot.saving
  return <div className="codexSubscriptionAdvancedPreferences">
    <section className="codexSubscriptionCard codexSubscriptionPreferencesCard" aria-label={t('imageSettings')}>
      <h3>{t('imageSettings')}</h3>
      <SwitchRow t={t} title={t('imageGenerationRow')} hint={t('imageGenerationRowHint')} checked={snapshot.imageGeneration} disabled={disabled} onChange={next => set({ imageGeneration: next })} />
      <SwitchRow t={t} title={t('imageEditingRow')} hint={t('imageEditingRowHint')} checked={snapshot.imageEditing} disabled={disabled} onChange={next => set({ imageEditing: next })} />
      <SwitchRow t={t} title={t('imageShortcutRow')} hint={t('imageShortcutRowHint')} checked={snapshot.imageShortcut} disabled={disabled} onChange={next => set({ imageShortcut: next })} />
      <SwitchRow t={t} title={t('imageViewerRow')} hint={t('imageViewerRowHint')} checked={snapshot.imageViewer && snapshot.imageAnnotations} disabled={disabled} onChange={next => set({ imageViewer: next, imageAnnotations: next })} />
      <details className="codexAdvancedFold codexAdvancedInline">
        <summary>{t('imageAdvancedTitle')}<span>{imagesOn ? `${modelLabel(snapshot.imageModel)} · ${t(`imageQuality_${snapshot.imageQuality}`)}` : t('imageCapability_off')}</span></summary>
        <ImageChoice t={t} label={t('imageModel')} value={snapshot.imageModel} text={modelLabel(snapshot.imageModel)} disabled={disabled || !imagesOn}
          items={Object.keys(IMAGE_MODELS).map(id => ({ id, label: `${modelLabel(id)}${id.includes('2.5') ? ` · ${t('imageExperimental')}` : ''}` }))}
          onSelect={imageModel => set({ imageModel, imageQuality: 'auto' })} />
        <ImageChoice t={t} label={t('imageQuality')} value={snapshot.imageQuality} text={t(`imageQuality_${snapshot.imageQuality}`)} disabled={disabled || !imagesOn}
          items={IMAGE_MODELS[snapshot.imageModel].map(id => ({ id, label: t(`imageQuality_${id}`) }))} onSelect={imageQuality => set({ imageQuality })} />
        {snapshot.imageModel.includes('2.5') ? <Hint t={t} as="p">{t('imageModelHint')}</Hint> : null}
      </details>
    </section>
    <section className="codexSubscriptionCard codexSubscriptionPreferencesCard" aria-label={t('creativeSketch')}>
      <h3>{t('creativeSketch')}</h3>
      <SwitchRow t={t} title={t('featureSketchTitle')} hint={t('sketchBoardRowHint')} checked={snapshot.imageSketch} disabled={disabled}
        reason={!imagesOn && !snapshot.imageSketch ? t('featureSketchNeedsImages') : undefined}
        onChange={next => set(next ? { imageSketch: true } : { imageSketch: false, imageSketchAgent: false })} />
      <SwitchRow t={t} title={t('sketchAgentRow')} hint={t('sketchAgentRowHint')} checked={snapshot.imageSketchAgent} disabled={disabled}
        reason={!snapshot.imageSketch ? t('sketchAgentNeedsBoard') : undefined} onChange={next => set({ imageSketchAgent: next })} />
    </section>
    {snapshot.error ? <p className="codexSubscriptionError" role="alert">{t('preferenceFailed')}</p> : null}
  </div>
}

export function MorePage({ preference, rpc, t, diagnostics }) {
  const snapshot = usePreferenceSnapshot(preference)
  return <div className="codexSubscriptionAdvancedPreferences">
    <RemoteControlCard rpc={rpc} preference={preference} snapshot={snapshot} t={t} />
    <VoiceCallCard rpc={rpc} preference={preference} snapshot={snapshot} t={t} />
    <StorageCard rpc={rpc} t={t} />
    <DiagnosticsCard rpc={rpc} t={t} diagnostics={diagnostics} />
  </div>
}
