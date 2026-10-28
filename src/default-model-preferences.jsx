import { Hint, SettingsLabel } from './client-hint.jsx'
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
  const resetId = '__dsh_default__'
  const items = [
    { id: resetId, label: t('defaultModelReset'), disabled: !snapshot.resetAvailable },
    ...(models.length ? [{ type: 'separator', id: 'default-model-separator' }, ...models.map(model => ({ id: model.id, label: model.name }))] : []),
  ]
  const disabled = snapshot.saving || snapshot.available !== true || (models.length === 0 && !snapshot.resetAvailable)
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy">
      <SettingsLabel description={snapshot.status === 'loading' ? undefined : [hint, snapshot.resetAvailable ? t('defaultModelResetHint') : undefined].filter(Boolean).join(' ')}>{t('defaultModelTitle')}</SettingsLabel>
      {snapshot.status === 'ready' && !snapshot.available ? <Hint>{hint}</Hint> : null}
      {snapshot.error ? <span className="codexSubscriptionError" role="alert">{t('defaultModelFailed')}</span> : null}
    </div>
    <Menu
      open={open}
      items={items}
      selectedId={snapshot.managed ? snapshot.model : undefined}
      onSelect={value => { setOpen(false); if (value === resetId) { if (snapshot.resetAvailable) void defaultModel.reset() } else void defaultModel.select(value) }}
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
