import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BoltIcon } from '@heroicons/react/16/solid'
import { IconCheckOutline16, IconChevronDownOutline14, IconChevronRightOutline14, Input, useAnchoredPosition, useDismissOnOutsidePointer, usePopover } from './client-primitives.jsx'
import { effectiveCodexSpeedMode, OUTPUT_VERBOSITY_DEFAULT, OUTPUT_VERBOSITY_FIELD, OUTPUT_VERBOSITY_HIGH, OUTPUT_VERBOSITY_LOW, OUTPUT_VERBOSITY_MEDIUM, SPEED_MODE_FAST, SPEED_MODE_FIELD, SPEED_MODE_STANDARD, SPEED_MODE_ULTRAFAST, supportsCodexFastMode } from './settings-contract.js'
import { fill, usePreferenceSnapshot } from './client-shared.js'
export function CodexNativeModelOptions({ locked, directory, preference, t, reportFailure }) {
  const { current } = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const snapshot = usePreferenceSnapshot(preference)
  if (current?.provider !== 'openai-codex') return null
  const fast = snapshot.fastModels?.includes(current.model) ?? supportsCodexFastMode(current.model)
  const ultrafast = snapshot.ultrafastModels?.includes(current.model) ?? false
  const verbosity = snapshot.verbosityModels.includes(current.model)
  const speed = effectiveCodexSpeedMode(snapshot.speedMode, current.model, { supportsFast: fast, supportsUltrafast: ultrafast })
  const disabled = locked || snapshot.status !== 'ready' || !snapshot.writable || snapshot.saving
  const change = async (field, value) => {
    await preference.set({ [field]: value })
    if (preference.getSnapshot().error) reportFailure(t('preferenceFailed'))
  }
  return <>
    {(fast || ultrafast) && <label className="codexNativeModelOption">
      <span>{speed !== SPEED_MODE_STANDARD && <BoltIcon className="codexModelSelectBolt" aria-hidden="true" />}{t('speedTitle')}</span>
      <select value={speed} disabled={disabled} onChange={event => { void change(SPEED_MODE_FIELD, event.target.value) }}>
        <option value={SPEED_MODE_STANDARD}>{t('speedStandard')}</option>
        {fast && <option value={SPEED_MODE_FAST}>{t('speedFast')}</option>}
        {ultrafast && <option value={SPEED_MODE_ULTRAFAST}>{t('speedUltrafast')}</option>}
      </select>
    </label>}
    {verbosity && <label className="codexNativeModelOption">
      <span>{t('verbosityTitle')}</span>
      <select value={snapshot.outputVerbosity} disabled={disabled} onChange={event => { void change(OUTPUT_VERBOSITY_FIELD, event.target.value) }}>
        <option value={OUTPUT_VERBOSITY_DEFAULT}>{t('verbosityDefault')}</option>
        <option value={OUTPUT_VERBOSITY_LOW}>{t('verbosityLow')}</option>
        <option value={OUTPUT_VERBOSITY_MEDIUM}>{t('verbosityMedium')}</option>
        <option value={OUTPUT_VERBOSITY_HIGH}>{t('verbosityHigh')}</option>
      </select>
    </label>}
  </>
}

export function CodexModelSelect({ locked, available, directory, load, select, preference, t }) {
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const preferenceSnapshot = usePreferenceSnapshot(preference)
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState('root')
  const [query, setQuery] = useState('')
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const id = useId()
  const choices = useMemo(() => state.groups.flatMap(group => group.models.map(model => ({
    group,
    model,
    selection: {
      provider: group.id,
      model: model.id,
      ...(model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: model.reasoning.defaultEffort }),
    },
  }))), [state.groups])
  const visibleGroups = useMemo(() => {
    const hidden = new Set(preferenceSnapshot.disabledModels)
    // A group whose every model is hidden keeps its title, so the menu says why it is empty.
    return state.groups.map(group => group.id === 'openai-codex'
      ? { ...group, models: group.models.filter(model => !hidden.has(model.id)), allHidden: group.models.length > 0 && group.models.every(model => hidden.has(model.id)) }
      : group).filter(group => group.models.length > 0 || group.allHidden === true)
  }, [state.groups, preferenceSnapshot.disabledModels])
  const currentChoice = choices.find(choice => choice.selection.provider === state.current?.provider && choice.selection.model === state.current?.model)
  const reasoning = currentChoice?.model.reasoning
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('providerDefault')
      : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortChoices = useMemo(() => reasoning === undefined ? [] : [
    ...(reasoning.defaultEffort === undefined ? [{ key: 'provider-default', effort: undefined, label: t('providerDefault') }] : []),
    ...reasoning.efforts.map(effort => ({
      key: `effort:${effort.id}`,
      effort: effort.id,
      label: effort.name,
      ...(effort.description === undefined ? {} : { description: effort.description }),
    })),
  ], [reasoning, t])
  const modelLabel = currentChoice?.model.name ?? t('selectModel')
  // Like DSH's own picker, a search field appears once there are more than four models; it covers every provider.
  const searchable = visibleGroups.reduce((total, group) => total + group.models.length, 0) > 4
  const needle = searchable ? query.trim().toLocaleLowerCase() : ''
  const shownGroups = needle === '' ? visibleGroups : visibleGroups.map(group => ({
    ...group,
    models: group.models.filter(model => [model.name, model.id, model.description, group.name].some(text => typeof text === 'string' && text.toLocaleLowerCase().includes(needle))),
  })).filter(group => group.models.length > 0)
  const speedSupported = state.current?.provider === 'openai-codex' && (preferenceSnapshot.fastModels?.includes(state.current?.model) ?? supportsCodexFastMode(state.current?.model))
  const speedWritable = preferenceSnapshot.status === 'ready' && preferenceSnapshot.writable === true && !preferenceSnapshot.saving
  const ultrafastSupported = state.current?.provider === 'openai-codex' && (preferenceSnapshot.ultrafastModels ?? []).includes(state.current?.model)
  const effectiveSpeed = effectiveCodexSpeedMode(preferenceSnapshot.speedMode, state.current?.model, {
    supportsFast: speedSupported,
    supportsUltrafast: ultrafastSupported,
  })
  const ultrafast = effectiveSpeed === SPEED_MODE_ULTRAFAST
  const fast = effectiveSpeed !== SPEED_MODE_STANDARD
  const speedKey = ultrafast ? 'speedUltrafast' : fast ? 'speedFast' : 'speedStandard'
  const verbositySupported = state.current?.provider === 'openai-codex' && preferenceSnapshot.verbosityModels.includes(state.current?.model)
  const verbosityWritable = preferenceSnapshot.status === 'ready' && preferenceSnapshot.writable === true
  const verbosityItems = [
    { id: OUTPUT_VERBOSITY_DEFAULT, label: t('verbosityDefault'), description: t('verbosityDefaultHint') },
    { id: OUTPUT_VERBOSITY_LOW, label: t('verbosityLow'), description: t('verbosityLowHint') },
    { id: OUTPUT_VERBOSITY_MEDIUM, label: t('verbosityMedium'), description: t('verbosityMediumHint') },
    { id: OUTPUT_VERBOSITY_HIGH, label: t('verbosityHigh'), description: t('verbosityHighHint') },
  ]
  const verbosityLabel = verbosityItems.find(item => item.id === preferenceSnapshot.outputVerbosity)?.label ?? t('verbosityDefault')
  const busy = state.status === 'selecting'

  useEffect(() => {
    if (available) load()
  }, [available, load])
  useEffect(() => {
    if (pane !== 'model') setQuery('')
  }, [pane])
  useEffect(() => {
    if (!speedSupported && !ultrafastSupported && pane === 'speed') setPane('root')
    if (!verbositySupported && pane === 'verbosity') setPane('root')
  }, [pane, speedSupported, ultrafastSupported, verbositySupported])

  const close = (restoreFocus = false) => {
    setOpen(false)
    setPane('root')
    setQuery('')
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus())
  }
  usePopover(menuRef, open)
  const menuPos = useAnchoredPosition({ open, anchorRef: triggerRef, panelRef: menuRef, side: 'top', align: 'end' })
  useDismissOnOutsidePointer(triggerRef, open, close, menuRef)
  if (!available) return null
  const settleSelection = accepted => {
    if (accepted) close(true)
  }
  const chooseModel = selection => {
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      close(true)
      return
    }
    void select(selection).then(settleSelection)
  }
  const chooseEffort = effort => {
    if (state.current === null) return
    if (effectiveEffort === effort) {
      close(true)
      return
    }
    void select({
      provider: state.current.provider,
      model: state.current.model,
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
    }).then(settleSelection)
  }
  const chooseSpeed = speedMode => {
    close(true)
    void preference.set({ [SPEED_MODE_FIELD]: speedMode })
  }
  const chooseVerbosity = outputVerbosity => {
    close(true)
    void preference.set({ [OUTPUT_VERBOSITY_FIELD]: outputVerbosity })
  }
  const option = ({ key, label, description, selected, disabled, onClick }) => <button
    key={key}
    type="button"
    role="menuitemradio"
    aria-checked={selected}
    className="codexModelSelectOption"
    disabled={disabled}
    onClick={onClick}
  >
    <span className="codexModelSelectOptionCopy"><span className="codexModelSelectOptionName">{label}</span>{description === undefined ? null : <span className="codexModelSelectOptionDescription">{description}</span>}</span>
    <span className="codexModelSelectCheck">{selected ? <IconCheckOutline16 /> : null}</span>
  </button>
  // Like DSH's own picker, a row opens its choices in the same menu; Escape goes back.
  const cell = (target, label, value) => <button
    type="button"
    role="menuitem"
    className="codexModelSelectCell"
    onClick={() => { setQuery(''); setPane(target) }}
  >
    <span className="codexModelSelectCellLabel">{label}</span>
    <span className="codexModelSelectCellValue">{value}</span>
    <IconChevronRightOutline14 className="codexModelSelectCellChevron" />
  </button>
  const group = (key, label, children) => <section key={key} role="group" aria-label={label}>
    <div className="codexModelSelectGroupTitle">{label}</div>{children}
  </section>

  let content = null
  if (pane === 'root') {
    content = <>
      {cell('model', t('modelLabel'), modelLabel)}
      {reasoning === undefined ? null : cell('effort', t('effortLabel'), effortLabel)}
      {(speedSupported || ultrafastSupported) && cell('speed', t('speedTitle'), t(speedKey))}
      {verbositySupported && cell('verbosity', t('verbosityTitle'), verbosityLabel)}
    </>
  } else if (pane === 'model') {
    content = <>
      {searchable ? <div className="codexModelSelectSearchRow"><Input className="codexModelSelectSearch" type="text" role="searchbox" value={query} autoFocus placeholder={t('modelSearch')} aria-label={t('modelSearch')} onChange={event => setQuery(event.target.value)} /></div> : null}
      {state.status === 'loading' ? <div className="codexModelSelectStatus">{t('modelsLoading')}</div> : null}
      {state.error === null ? null : <div className="codexModelSelectError"><span>{fill(t('modelFailed'), { value: state.error })}</span><button className="codexModelSelectRetry" type="button" onClick={load}>{t('modelRetry')}</button></div>}
      {state.failures.map(failure => <div className="codexModelSelectWarning" key={failure.id}>{fill(t('groupFailed'), { name: failure.name, value: failure.message })}</div>)}
      <div className="codexModelSelectGroups scrollable" role="menu" aria-label={t('modelLabel')}>{shownGroups.map(entry => group(entry.id, entry.name, <>
        {entry.allHidden === true ? <div className="codexModelSelectEmpty">{t('modelsHidden')}</div> : null}
        {entry.models.map(model => option({
          key: model.id,
          label: model.name,
          selected: state.current?.provider === entry.id && state.current.model === model.id,
          disabled: busy,
          onClick: () => chooseModel({ provider: entry.id, model: model.id }),
        }))}
      </>))}</div>
      {state.status === 'ready' && visibleGroups.length === 0 ? <div className="codexModelSelectEmpty">{t(choices.length === 0 ? 'modelsEmpty' : 'modelsHidden')}</div> : null}
      {state.status === 'ready' && visibleGroups.length > 0 && shownGroups.length === 0 ? <div className="codexModelSelectEmpty">{t('modelNoMatch')}</div> : null}
    </>
  } else if (pane === 'effort') {
    content = effortChoices.length === 0 ? <div className="codexModelSelectEmpty">{t('effortsEmpty')}</div> : effortChoices.map(level => option({
      key: level.key,
      label: level.label,
      description: level.description,
      selected: effectiveEffort === level.effort,
      disabled: busy,
      onClick: () => chooseEffort(level.effort),
    }))
  } else if (pane === 'speed') {
    content = <>
      {option({ key: SPEED_MODE_STANDARD, label: t('speedStandard'), description: t('speedStandardHint'), selected: !fast, disabled: !speedWritable, onClick: () => chooseSpeed(SPEED_MODE_STANDARD) })}
      {speedSupported && option({ key: SPEED_MODE_FAST, label: t('speedFast'), description: t(state.current?.model === 'gpt-6-astra' ? 'speedFastAstraHint' : 'speedFastHint'), selected: fast && !ultrafast, disabled: !speedWritable, onClick: () => chooseSpeed(SPEED_MODE_FAST) })}
      {ultrafastSupported && option({ key: SPEED_MODE_ULTRAFAST, label: t('speedUltrafast'), description: t('speedUltrafastHint'), selected: ultrafast, disabled: !speedWritable, onClick: () => chooseSpeed(SPEED_MODE_ULTRAFAST) })}
    </>
  } else if (pane === 'verbosity') {
    content = verbosityItems.map(item => option({ key: item.id, label: item.label, description: item.description, selected: preferenceSnapshot.outputVerbosity === item.id, disabled: !verbosityWritable, onClick: () => chooseVerbosity(item.id) }))
  }

  const menu = open ? <div
    ref={menuRef}
    id={`${id}-menu`}
    className="codexModelSelectMenu"
    popover="manual"
    style={{ ...menuPos, visibility: menuPos ? 'visible' : 'hidden' }}
    role={pane === 'model' ? 'group' : 'menu'}
    aria-label={t('modelMenuAria')}
    aria-busy={state.status === 'loading' || busy}
    onKeyDown={event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (pane === 'root') close(true)
      else setPane('root')
    }}
  >{content}</div> : null

  return <div className="codexModelSelect" onKeyDown={event => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    if (pane === 'root') close(true)
    else setPane('root')
  }}>
    <button
      ref={triggerRef}
      type="button"
      className="codexModelSelectTrigger"
      aria-label={fast ? `${modelLabel} · ${t(speedKey)}` : modelLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? `${id}-menu` : undefined}
      title={fast ? `${modelLabel} · ${t(speedKey)}` : modelLabel}
      disabled={locked}
      onClick={() => open ? close() : (setPane('root'), setOpen(true), load())}
    >
      {fast && <BoltIcon className="codexModelSelectBolt" aria-hidden="true" />}
      <span className="codexModelSelectLabel">{modelLabel}</span>
      {effortLabel === undefined ? null : <span className="codexModelSelectEffort">{effortLabel}</span>}
      <IconChevronDownOutline14 className="codexModelSelectChevron" />
    </button>
    {menu}
  </div>
}
