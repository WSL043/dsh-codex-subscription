import { Switch, Tooltip } from './client-primitives.js'
import { usePreferenceSnapshot } from './client-shared.js'

export function ComposerPredictionPreference({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const description = t('composerPredictionsHint')
  const label = <span className="codexSubscriptionPreferenceLabel" tabIndex={0}
    title={Tooltip ? undefined : description} aria-description={Tooltip ? undefined : description}>{t('composerPredictions')}</span>
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy">
      {Tooltip ? <Tooltip label={description} side="bottom" portal maxWidth={360} openOnClick>{label}</Tooltip> : label}
      <span className="codexSubscriptionPreferenceHint">{t('composerPredictionsShortHint')}</span>
    </div>
    <Switch checked={snapshot.composerPredictions === 'on'} label={t('composerPredictions')}
      disabled={snapshot.status !== 'ready' || !snapshot.writable || snapshot.saving}
      onChange={on => { void preference.set({ composerPredictions: on ? 'on' : 'off' }) }} />
  </div>
}
