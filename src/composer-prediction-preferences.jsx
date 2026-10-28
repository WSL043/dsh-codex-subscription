import { SettingsLabel } from './client-hint.jsx'
import { Switch } from './client-primitives.js'
import { usePreferenceSnapshot } from './client-shared.js'

export function ComposerPredictionPreference({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy">
      <SettingsLabel description={t('composerPredictionsHint')}>{t('composerPredictions')} <small>Beta</small></SettingsLabel>
      <span className="codexSubscriptionPreferenceHint">{t('composerPredictionsShortHint')}</span>
    </div>
    <Switch checked={snapshot.composerPredictions === 'on'} label={t('composerPredictions')}
      disabled={snapshot.status !== 'ready' || !snapshot.writable || snapshot.saving}
      onChange={on => { void preference.set({ composerPredictions: on ? 'on' : 'off' }) }} />
  </div>
}
