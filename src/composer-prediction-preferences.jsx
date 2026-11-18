import { useEffect, useState } from 'react'
import { SettingsLabel } from './client-hint.jsx'
import { Switch } from './client-primitives.jsx'
import { CHANNEL, fill, unwrap, usePreferenceSnapshot } from './client-shared.js'

export function ComposerPredictionPreference({ preference, t, rpc, active, accountKey }) {
  const snapshot = usePreferenceSnapshot(preference)
  const [availability, setAvailability] = useState()
  useEffect(() => {
    if (!rpc || !active || !accountKey) return
    const request = new AbortController()
    Promise.resolve().then(() => {
      request.signal.throwIfAborted()
      return rpc.call(CHANNEL, 'predictions/models', {}, request.signal)
    }).then(unwrap).then(names => {
      if (!request.signal.aborted) setAvailability({ accountKey, names })
    }).catch(() => {
      if (!request.signal.aborted) setAvailability(undefined)
    })
    return () => request.abort()
  }, [rpc, active, accountKey, snapshot.availableModels])
  const names = availability?.accountKey === accountKey ? availability?.names : undefined
  const detail = names?.length ? fill(t('composerPredictionModels'), { models: names.join(', ') }) : undefined
  const help = [t('composerPredictionsHint'), detail].filter(Boolean).join('\n\n')
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy">
      <SettingsLabel description={help}>{t('composerPredictions')} <small>Beta</small></SettingsLabel>
      {snapshot.status === 'ready' ? <span className="codexSubscriptionPreferenceHint">{t(`state_predictions_${snapshot.composerPredictions === 'on' ? 'on' : 'off'}`)}</span> : null}
    </div>
    <Switch checked={snapshot.composerPredictions === 'on'} label={t('composerPredictions')}
      disabled={snapshot.status !== 'ready' || !snapshot.writable || snapshot.saving}
      onChange={on => { void preference.set({ composerPredictions: on ? 'on' : 'off' }) }} />
  </div>
}
