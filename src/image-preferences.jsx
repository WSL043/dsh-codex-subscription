import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Menu, IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { IMAGE_MODELS } from './image-models.js'
import { IMAGE_SETTING_GROUPS, imageGroupValue, imageGroupPatch } from './image-setting-groups.js'

export function ImageChoice({ label, hint, value, text, items, disabled, onSelect }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef(null)
  useEffect(() => {
    if (!open || disabled) return
    // The host settings modal also listens for Escape. Dismiss only this layer.
    const escape = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      anchor.current?.focus()
    }
    window.addEventListener('keydown', escape, true)
    return () => window.removeEventListener('keydown', escape, true)
  }, [open, disabled])
  return <div className="codexSubscriptionPreference codexImagePreference">
    <div className="codexSubscriptionPreferenceCopy">
      <span>{label}</span>
      {hint ? <span className="codexSubscriptionPreferenceHint">{hint}</span> : null}
    </div>
    <Menu open={open && !disabled} items={items} selectedId={value}
      onSelect={id => { setOpen(false); onSelect(id) }} onClose={() => setOpen(false)}
      align="end" side="bottom" portal compact anchor={
        <button ref={anchor} type="button" className="codexSubscriptionContextTrigger"
          aria-label={label} aria-haspopup="menu" aria-expanded={open && !disabled}
          disabled={disabled} onClick={() => setOpen(current => !current)}>
          <span>{text}</span><IconChevronDownOutline14 />
        </button>
      } />
  </div>
}
const modelLabel = model => model.replace('gpt-image-', 'GPT Image ').replace('-flare', ' Flare').replace('-sunburst', ' Sunburst')
export function ImagePreferences({ preference, t }) {
  const snapshot = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const disabled = snapshot.status !== 'ready' || !snapshot.writable || snapshot.saving
  const active = snapshot.imageGeneration || snapshot.imageEditing
  return <details className="codexSubscriptionSearchOptions codexImageSettings">
    <summary>{t('imageSettings')}</summary>
    {Object.keys(IMAGE_SETTING_GROUPS).map(group => {
      const value = imageGroupValue(snapshot, group)
      return <ImageChoice key={group} label={t(group)} hint={t(`${group}Hint`)}
        value={value} text={t(value === 'mixed' ? 'imageGroupMixed' : `${group}_${value}`)}
        disabled={disabled} items={['on', 'off'].map(id => ({ id, label: t(`${group}_${id}`) }))}
        onSelect={id => { void preference.set(imageGroupPatch(group, id === 'on')) }} />
    })}
    <div className="codexImageDefaultsGroup">
      <ImageChoice label={t('imageModel')} value={snapshot.imageModel} text={modelLabel(snapshot.imageModel)}
        disabled={disabled || !active}
        items={Object.keys(IMAGE_MODELS).map(id => ({ id, label: `${modelLabel(id)}${id.includes('2.5') ? ` · ${t('imageExperimental')}` : ''}` }))}
        onSelect={imageModel => { void preference.set({ imageModel, imageQuality: 'auto' }) }} />
      <ImageChoice label={t('imageQuality')} value={snapshot.imageQuality} text={t(`imageQuality_${snapshot.imageQuality}`)}
        disabled={disabled || !active}
        items={IMAGE_MODELS[snapshot.imageModel].map(id => ({ id, label: t(`imageQuality_${id}`) }))}
        onSelect={imageQuality => { void preference.set({ imageQuality }) }} />
    </div>
    {snapshot.imageModel.includes('2.5') ? <p className="codexSubscriptionPreferenceHint">{t('imageModelHint')}</p> : null}
  </details>
}
