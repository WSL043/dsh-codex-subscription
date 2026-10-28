import { SettingsLabel } from './client-hint.jsx'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button, Menu, IconChevronDownOutline14 } from './client-primitives.js'
import { IMAGE_MODELS } from './image-models.js'
import { IMAGE_SETTING_GROUPS, imageGroupValue, imageGroupPatch } from './image-setting-groups.js'

export function ImageChoice({ t, label, hint, title, value, text, items, disabled, onSelect }) {
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
      <SettingsLabel className="" description={[hint, title].filter(Boolean).join(' ')}>{label}</SettingsLabel>
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
export function ImagePreferences({ preference, t, section = 'image' }) {
  const snapshot = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const disabled = snapshot.status !== 'ready' || !snapshot.writable || snapshot.saving
  const active = snapshot.imageGeneration || snapshot.imageEditing
  const sketch = section === 'sketch'
  const title = t(sketch ? 'creativeSketch' : 'imageSettings')
  return <section className="codexSubscriptionCard codexImageSettings" aria-label={title}>
    <div className="codexSubscriptionSectionHead"><h3>{title}</h3><span className="codexSubscriptionBadge">{sketch ? 'Beta' : active ? modelLabel(snapshot.imageModel) : t('imageCapability_off')}</span></div>
    <div className="codexSubscriptionSettingRows">
    {Object.keys(IMAGE_SETTING_GROUPS).filter(group => group.startsWith('sketch') === sketch).map(group => {
      const value = imageGroupValue(snapshot, group)
      return <ImageChoice t={t} key={group} label={t(sketch ? `${group}Setting` : group)} hint={t(`${group}Hint`)}
        value={value} text={t(value === 'mixed' ? 'imageGroupMixed' : `${group}_${value}`)}
        disabled={disabled} items={['on', 'off'].map(id => ({ id, label: t(`${group}_${id}`) }))}
        onSelect={id => { void preference.set(imageGroupPatch(group, id === 'on')) }} />
    })}
    {!sketch ? <div className="codexImageDefaultsGroup">
      <ImageChoice t={t} label={t('imageModel')} hint={snapshot.imageModel.includes('2.5') ? t('imageModelHint') : undefined} value={snapshot.imageModel} text={modelLabel(snapshot.imageModel)}
        disabled={disabled || !active}
        items={Object.keys(IMAGE_MODELS).map(id => ({ id, label: `${modelLabel(id)}${id.includes('2.5') ? ` · ${t('imageExperimental')}` : ''}` }))}
        onSelect={imageModel => { void preference.set({ imageModel, imageQuality: 'auto' }) }} />
      <ImageChoice t={t} label={t('imageQuality')} value={snapshot.imageQuality} text={t(`imageQuality_${snapshot.imageQuality}`)}
        disabled={disabled || !active}
        items={IMAGE_MODELS[snapshot.imageModel].map(id => ({ id, label: t(`imageQuality_${id}`) }))}
        onSelect={imageQuality => { void preference.set({ imageQuality }) }} />
    </div> : null}
    </div>
    {snapshot.error ? <div className="codexSubscriptionRecover" role="alert"><p className="codexSubscriptionError">{t('preferenceFailed')}</p><Button type="button" variant="outline" onClick={() => { void preference.retry() }}>{t('preferenceRetry')}</Button></div> : null}
  </section>
}
