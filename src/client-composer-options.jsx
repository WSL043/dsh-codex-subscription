import { useState, useSyncExternalStore } from 'react'
import { AdjustmentsHorizontalIcon } from '@heroicons/react/16/solid'
import { Menu } from './client-primitives.js'
import { usePreferenceSnapshot } from './client-shared.js'
import {
  OUTPUT_VERBOSITY_DEFAULT, OUTPUT_VERBOSITY_FIELD, OUTPUT_VERBOSITY_HIGH,
  OUTPUT_VERBOSITY_LOW, OUTPUT_VERBOSITY_MEDIUM, SPEED_MODE_FAST, SPEED_MODE_FIELD,
  SPEED_MODE_STANDARD, SPEED_MODE_ULTRAFAST, supportsCodexFastMode,
} from './settings-contract.js'

export function CodexComposerOptions({ available, directory, preference, t }) {
  const { current } = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const snapshot = usePreferenceSnapshot(preference)
  if (!available || current?.provider !== 'openai-codex') return null
  return <OptionsMenu key={current.model} model={current.model} snapshot={snapshot} preference={preference} t={t} />
}

function OptionsMenu({ model, snapshot, preference, t }) {
  const [open, setOpen] = useState(false)
  const fast = snapshot.fastModels?.includes(model) ?? supportsCodexFastMode(model)
  const ultrafast = snapshot.ultrafastModels?.includes(model) === true
  const verbosity = snapshot.verbosityModels.includes(model)
  const groups = []
  if (fast || ultrafast) {
    const options = [
      [SPEED_MODE_STANDARD, 'speedStandard', 'speedStandardHint'],
      ...(fast ? [[SPEED_MODE_FAST, 'speedFast', model === 'gpt-6-astra' ? 'speedFastAstraHint' : 'speedFastHint']] : []),
      ...(ultrafast ? [[SPEED_MODE_ULTRAFAST, 'speedUltrafast', 'speedUltrafastHint']] : []),
    ]
    groups.push({
      field: SPEED_MODE_FIELD, name: t('speedTitle'), options,
      selected: options.some(([id]) => id === snapshot.speedMode) ? snapshot.speedMode : SPEED_MODE_STANDARD,
    })
  }
  if (verbosity) groups.push({
    field: OUTPUT_VERBOSITY_FIELD, name: t('verbosityTitle'), selected: snapshot.outputVerbosity,
    options: [
      [OUTPUT_VERBOSITY_DEFAULT, 'verbosityDefault', 'verbosityDefaultHint'],
      [OUTPUT_VERBOSITY_LOW, 'verbosityLow', 'verbosityLowHint'],
      [OUTPUT_VERBOSITY_MEDIUM, 'verbosityMedium', 'verbosityMediumHint'],
      [OUTPUT_VERBOSITY_HIGH, 'verbosityHigh', 'verbosityHighHint'],
    ],
  })
  if (groups.length === 0) return null

  const label = groups.map(group => group.name).join(' / ')
  const writable = snapshot.status === 'ready' && snapshot.writable === true
  const select = id => {
    setOpen(false)
    const group = groups.find(({ options }) => options.some(([value]) => value === id))
    if (writable && group) void preference.set({ [group.field]: id })
  }
  if (Menu === undefined) return <select aria-label={label} value="" disabled={!writable} onChange={event => select(event.target.value)}>
    <option value="" disabled>{label}</option>
    {groups.map(({ field, name, options, selected }) => <optgroup key={field} label={name}>
      {options.map(([id, text]) => <option key={id} value={id}>{id === selected ? '✓ ' : ''}{t(text)}</option>)}
    </optgroup>)}
  </select>

  const items = groups.flatMap(({ field, name, options }) => [
    { type: 'label', id: field, text: name },
    ...options.map(([id, text, hint]) => ({
      id, disabled: !writable,
      label: <span className="codexComposerOptionText"><span>{t(text)}</span><small>{t(hint)}</small></span>,
    })),
  ])
  return <Menu open={open} items={items} selectedIds={groups.map(group => group.selected)}
    onSelect={select} onClose={() => setOpen(false)} align="end" side="top" portal compact
    anchor={<button className="codexComposerOptions" type="button" title={label} aria-label={label}
      aria-haspopup="menu" aria-expanded={open} disabled={!writable} onClick={() => setOpen(value => !value)}>
      <AdjustmentsHorizontalIcon aria-hidden="true" />
    </button>} />
}
