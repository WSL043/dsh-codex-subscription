import { useSyncExternalStore } from 'react'
import { IMAGE_FEATURE_DEFAULTS } from './image-features.js'
import { IMAGE_MODELS } from './image-models.js'

export function ImagePreferences({ preference, t }) {
  const snapshot = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  return <details className="codexSubscriptionSearchOptions codexImageSettings"><summary>{t('imageSettings')}</summary>
    <label className="codexSubscriptionPreference"><span>{t('imageModel')}</span><select aria-label={t('imageModel')} value={snapshot.imageModel} disabled={!snapshot.writable} onChange={event => { void preference.set({imageModel:event.target.value,imageQuality:'auto'}) }}>{Object.keys(IMAGE_MODELS).map(model => <option key={model} value={model}>{model}{model.includes('2.5') ? ` · ${t('imageExperimental')}` : ''}</option>)}</select></label>
    <label className="codexSubscriptionPreference"><span>{t('imageQuality')}</span><select aria-label={t('imageQuality')} value={snapshot.imageQuality} disabled={!snapshot.writable} onChange={event => { void preference.set({imageQuality:event.target.value}) }}>{IMAGE_MODELS[snapshot.imageModel].map(quality => <option key={quality}>{quality}</option>)}</select></label>
    <p className="codexSubscriptionPreferenceHint">{t('imageModelHint')}</p>
    <div className="codexImageSwitches">{Object.keys(IMAGE_FEATURE_DEFAULTS).map(key => <label className="codexSubscriptionPreference" key={key}>
      <span>{t(key)}</span><input type="checkbox" role="switch" checked={snapshot[key]} disabled={!snapshot.writable} onChange={event => { void preference.set({ [key]: event.target.checked }) }} />
    </label>)}</div>
    <p className="codexSubscriptionPreferenceHint">{t('imageSettingsHint')}</p>
  </details>
}
