import { useEffect, useState, useSyncExternalStore } from 'react'
import { IconChevronDownOutline14, Menu } from './client-primitives.js'
import { fill, usePreferenceSnapshot } from './client-shared.js'

/**
 * Choose the model a new conversation opens with. DSH owns that selection, so
 * the control always shows the live value, including a model chosen in a chat
 * and any non-subscription default the user set elsewhere.
 */
export function DefaultModelPreference({ preference, defaultModel, t }) {
  const snapshot = useSyncExternalStore(defaultModel.subscribe, defaultModel.getSnapshot)
  const models = usePreferenceSnapshot(preference).availableModels
  const [open, setOpen] = useState(false)
  useEffect(() => { void defaultModel.load() }, [defaultModel])
  const selected = models.find(model => model.id === snapshot.model)
  const label = snapshot.managed ? selected?.name ?? snapshot.model : t('defaultModelFollow')
  const current = snapshot.provider === undefined
    ? t('defaultModelUnknown')
    : `${snapshot.provider} / ${snapshot.model ?? t('defaultModelUnknown')}`
  const hint = snapshot.status === 'error'
    ? t('defaultModelFailed')
    : snapshot.available !== true
      ? t('defaultModelUnavailable')
      : models.length === 0
        ? t('defaultModelNoCatalog')
        : snapshot.managed
          ? t('defaultModelHint')
          : fill(t('defaultModelFollowHint'), { value: current })
  const items = models.map(model => ({ id: model.id, label: model.name }))
  const disabled = snapshot.saving || snapshot.available !== true || models.length === 0
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy">
      <span className="codexSubscriptionPreferenceLabel">{t('defaultModelTitle')}</span>
      <span className="codexSubscriptionPreferenceHint">{hint}</span>
      {snapshot.error ? <span className="codexSubscriptionError" role="alert">{t('defaultModelFailed')}</span> : null}
    </div>
    <Menu
      open={open}
      items={items}
      selectedId={snapshot.managed ? snapshot.model : undefined}
      onSelect={value => { setOpen(false); void defaultModel.select(value) }}
      onClose={() => setOpen(false)}
      align="end"
      side="bottom"
      portal
      compact
      anchor={<button
        className="codexSubscriptionContextTrigger"
        type="button"
        aria-label={t('defaultModelTitle')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={snapshot.saving || undefined}
        title={label}
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
      ><span>{label}</span><IconChevronDownOutline14 /></button>}
    />
  </div>
}
