import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BoltIcon } from '@heroicons/react/16/solid'
import { IconCheckOutline16, IconChevronDownOutline14, IconChevronRightOutline14, Input, useAnchoredPosition, useDismissOnOutsidePointer, usePopover } from './client-primitives.jsx'
import { effectiveCodexSpeedMode, OUTPUT_VERBOSITY_DEFAULT, OUTPUT_VERBOSITY_FIELD, OUTPUT_VERBOSITY_HIGH, OUTPUT_VERBOSITY_LOW, OUTPUT_VERBOSITY_MEDIUM, SPEED_MODE_FAST, SPEED_MODE_FIELD, SPEED_MODE_STANDARD, SPEED_MODE_ULTRAFAST, supportsCodexFastMode } from './settings-contract.js'
import { fill, usePreferenceSnapshot, useSessionPreferenceSnapshot } from './client-shared.js'
export function createModelOptionsMenu() {
  const changes = new EventTarget()
  let request
  const set = value => {
    if (request === value) return
    request = value
    changes.dispatchEvent(new Event('change'))
  }
  return {
    getSnapshot: () => request,
    subscribe(listener) {
      changes.addEventListener('change', listener)
      return () => changes.removeEventListener('change', listener)
    },
    set,
    clearSession(sessionId) { if (request?.sessionId === sessionId) set(undefined) },
  }
}

// DSH owns the trigger and selection. Only decorate its published inline label.
export function CodexModelLabel({ available, sessionId, sessionPreferences, provider, model, placement, selected, preference, resolveText, t }) {
  const profile = usePreferenceSnapshot(preference)
  const tracksSpeed = available && placement === 'trigger' && selected && provider.id === 'openai-codex'
  const snapshot = useSessionPreferenceSnapshot(sessionPreferences, tracksSpeed ? sessionId : undefined)
  const supportsFast = profile.fastModels?.includes(model.id) ?? supportsCodexFastMode(model.id)
  const speed = effectiveCodexSpeedMode(snapshot.speedMode, model.id, {
    supportsFast, supportsUltrafast: profile.ultrafastModels?.includes(model.id) ?? false,
  })
  const badge = model.badge && <span className="codexModelCatalogBadge" data-tone={model.badge.tone}>{resolveText(model.badge.text)}</span>
  const shortcutShown = profile.speedShortcut && profile.speedShortcut !== 'off' && supportsFast
  const bolt = tracksSpeed && speed !== SPEED_MODE_STANDARD && !shortcutShown
  if (!badge && !bolt) return model.name
  return <span className="codexModelInlineLabel" data-placement={placement}>
    {bolt && <BoltIcon className="codexModelSelectBolt"
      aria-label={t(speed === SPEED_MODE_ULTRAFAST ? 'speedUltrafast' : 'speedFast')} />}
    {placement === 'trigger' && badge}{model.name}{placement !== 'trigger' && badge}
  </span>
}

export function CodexNativeModelOptions({ available, sessionId, sessionPreferences, locked, directory, preference, t, dismiss, reportFailure, optionsMenu }) {
  const { current } = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const profile = usePreferenceSnapshot(preference)
  const enabled = available && current?.provider === 'openai-codex'
  const snapshot = useSessionPreferenceSnapshot(sessionPreferences, enabled ? sessionId : undefined)
  if (!enabled) return null
  const fast = profile.fastModels?.includes(current.model) ?? supportsCodexFastMode(current.model)
  const ultrafast = profile.ultrafastModels?.includes(current.model) ?? false
  const verbosity = profile.verbosityModels.includes(current.model)
  const speed = snapshot.status === 'ready' ? effectiveCodexSpeedMode(snapshot.speedMode, current.model, { supportsFast: fast, supportsUltrafast: ultrafast }) : undefined
  const disabled = locked || snapshot.status !== 'ready' || !snapshot.writable || snapshot.saving
  const matchesModel = () => {
    const model = directory.getSnapshot().current
    return model?.provider === current.provider && model.model === current.model
  }
  const option = (id, label) => ({ id, label: t(label) })
  const speedItems = [option(SPEED_MODE_STANDARD, 'speedStandard')]
  if (fast) speedItems.push(option(SPEED_MODE_FAST, 'speedFast'))
  if (ultrafast) speedItems.push(option(SPEED_MODE_ULTRAFAST, 'speedUltrafast'))
  const verbosityItems = [
    option(OUTPUT_VERBOSITY_DEFAULT, 'verbosityDefault'),
    option(OUTPUT_VERBOSITY_LOW, 'verbosityLow'),
    option(OUTPUT_VERBOSITY_MEDIUM, 'verbosityMedium'),
    option(OUTPUT_VERBOSITY_HIGH, 'verbosityHigh'),
  ]
  const row = (field, label, items, value) => {
    const open = event => {
      const menu = event.currentTarget.closest('[role="menu"]')
      if (!menu?.id) return
      const trigger = [...menu.ownerDocument.querySelectorAll('button[aria-controls]')]
        .find(button => button.getAttribute('aria-controls') === menu.id)
      if (!trigger || disabled) return
      const { width, right, bottom } = menu.getBoundingClientRect()
      const { innerWidth, innerHeight } = menu.ownerDocument.defaultView
      const isCurrent = () => trigger.isConnected && matchesModel() && sessionPreferences.getSnapshot(sessionId) === snapshot
      optionsMenu.set({ sessionId, field, label, items, value, trigger, isCurrent, width, right: innerWidth - right, bottom: innerHeight - bottom,
        async select(next) {
          if (!isCurrent() || next === value) return
          const accepted = await sessionPreferences.set(sessionId, { [field]: next }, snapshot)
          if (accepted === false && trigger.isConnected && matchesModel() && sessionPreferences.getSnapshot(sessionId).error) reportFailure(t('preferenceFailed'))
        } })
      dismiss()
    }
    return <button type="button" role="menuitem" className="codexModelSelectCell" aria-haspopup="menu"
      data-codex-model-option={field} disabled={disabled} onClick={open} onKeyDown={event => {
        if (event.key !== 'ArrowRight') return
        event.preventDefault()
        event.stopPropagation()
        open(event)
      }}>
      <span className="codexModelSelectCellLabel">{label}</span>
      <span className="codexModelSelectCellValue">{items.find(item => item.id === value)?.label}</span>
      <IconChevronRightOutline14 className="codexModelSelectCellChevron" />
    </button>
  }
  return <>
    {(fast || ultrafast) && row(SPEED_MODE_FIELD, t('speedTitle'), speedItems, speed)}
    {verbosity && row(OUTPUT_VERBOSITY_FIELD, t('verbosityTitle'), verbosityItems, snapshot.outputVerbosity)}
  </>
}

export function CodexModelOptionsOverlay({ optionsMenu }) {
  const request = useSyncExternalStore(optionsMenu.subscribe, optionsMenu.getSnapshot)
  return request ? <ModelOptionChoices key={`${request.sessionId}:${request.field}`} request={request} close={() => optionsMenu.set(undefined)} /> : null
}

function ModelOptionChoices({ request, close }) {
  const panel = useRef(null)
  const outside = useRef(null)
  usePopover(panel, true)
  useDismissOnOutsidePointer(outside, true, close, panel)
  useLayoutEffect(() => {
    const menu = panel.current
    const selected = menu.querySelector('[aria-checked="true"]') ?? menu.firstElementChild
    selected?.focus()
  }, [])
  const returnToMenu = () => {
    close()
    if (!request.isCurrent()) return
    request.trigger.click()
    requestAnimationFrame(() => {
      const menu = request.trigger.ownerDocument.getElementById(request.trigger.getAttribute('aria-controls'))
      menu?.querySelector(`[data-codex-model-option="${request.field}"]`)?.focus()
    })
  }
  const select = value => {
    close()
    if (request.isCurrent()) {
      request.trigger.focus()
      void request.select(value)
    }
  }
  const onKeyDown = event => {
    const { key } = event
    if (!['Escape', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'].includes(key)) return
    if (key === 'Tab' && !event.shiftKey) {
      close()
      if (request.isCurrent()) request.trigger.focus()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (key === 'Escape' || key === 'ArrowLeft' || key === 'Tab' && event.shiftKey) { returnToMenu(); return }
    const choices = [...panel.current.children]
    const index = choices.indexOf(event.target)
    const next = key === 'Home' ? 0 : key === 'End' ? choices.length - 1
      : (index + (key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length
    choices[next]?.focus()
  }
  return <div ref={panel} popover="manual" className="codexModelSelectMenu codexModelOptionsMenu" role="menu" aria-label={request.label}
    style={{
      right: `min(${request.right}px, max(12px, calc(100vw - ${request.width + 12}px)))`,
      bottom: `min(${request.bottom}px, max(12px, calc(100dvh - 240px)))`,
      maxHeight: `min(360px, calc(100dvh - ${request.bottom + 12}px))`,
      minWidth: 0,
      width: request.width,
    }} onKeyDown={onKeyDown}>
    {request.items.map(item => <button key={item.id} type="button" role="menuitemradio" className="codexModelSelectOption"
      aria-checked={item.id === request.value} onClick={() => select(item.id)}>
      <span className="codexModelSelectOptionCopy"><span className="codexModelSelectOptionName">{item.label}</span></span>
      <span className="codexModelSelectCheck">{item.id === request.value && <IconCheckOutline16 />}</span>
    </button>)}
  </div>
}

export function CodexModelSelect({ locked, available, sessionId, sessionPreferences, directory, load, select, preference, t, openPickerTrace }) {
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const preferenceSnapshot = usePreferenceSnapshot(preference)
  const local = useSessionPreferenceSnapshot(sessionPreferences, available && state.current?.provider === 'openai-codex' ? sessionId : undefined)
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState('root')
  const trace = useRef(null)
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
  const sessionReady = local.status === 'ready'
  const sessionWritable = sessionReady && local.writable && !local.saving && !locked
  const ultrafastSupported = state.current?.provider === 'openai-codex' && (preferenceSnapshot.ultrafastModels ?? []).includes(state.current?.model)
  const effectiveSpeed = effectiveCodexSpeedMode(local.speedMode, state.current?.model, {
    supportsFast: speedSupported,
    supportsUltrafast: ultrafastSupported,
  })
  const ultrafast = effectiveSpeed === SPEED_MODE_ULTRAFAST
  const fast = effectiveSpeed !== SPEED_MODE_STANDARD
  const speedKey = ultrafast ? 'speedUltrafast' : fast ? 'speedFast' : 'speedStandard'
  const verbositySupported = state.current?.provider === 'openai-codex' && preferenceSnapshot.verbosityModels.includes(state.current?.model)
  const verbosityItems = [
    { id: OUTPUT_VERBOSITY_DEFAULT, label: t('verbosityDefault'), description: t('verbosityDefaultHint') },
    { id: OUTPUT_VERBOSITY_LOW, label: t('verbosityLow'), description: t('verbosityLowHint') },
    { id: OUTPUT_VERBOSITY_MEDIUM, label: t('verbosityMedium'), description: t('verbosityMediumHint') },
    { id: OUTPUT_VERBOSITY_HIGH, label: t('verbosityHigh'), description: t('verbosityHighHint') },
  ]
  const verbosityLabel = verbosityItems.find(item => item.id === local.outputVerbosity)?.label
  const busy = state.status === 'selecting'

  useLayoutEffect(() => {
    setOpen(false)
    setPane('root')
    setQuery('')
    return () => {
      trace.current?.('closed')
      trace.current = null
    }
  }, [sessionId])
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
    trace.current?.('closed')
    trace.current = null
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
    trace.current?.('activated')
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      trace.current?.('already-selected')
      close(true)
      return
    }
    void select(selection, trace.current).then(settleSelection)
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
  const choosePreference = (field, value) => {
    const model = directory.getSnapshot().current
    if (!sessionWritable || model?.provider !== state.current?.provider || model?.model !== state.current?.model) return
    close(true)
    void sessionPreferences.set(sessionId, { [field]: value }, local)
  }
  const option = ({ key, label, description, selected, disabled, onClick, onPointerDown }) => <button
    key={key}
    type="button"
    role="menuitemradio"
    aria-checked={selected}
    className="codexModelSelectOption"
    disabled={disabled}
    onPointerDown={onPointerDown}
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
    onClick={() => { if (target === 'model') trace.current?.('model-list'); setQuery(''); setPane(target) }}
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
      {(speedSupported || ultrafastSupported) && cell('speed', t('speedTitle'), sessionReady ? t(speedKey) : undefined)}
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
          onPointerDown: () => trace.current?.('pointer-down'),
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
      {option({ key: SPEED_MODE_STANDARD, label: t('speedStandard'), description: t('speedStandardHint'), selected: sessionReady && !fast, disabled: !sessionWritable, onClick: () => choosePreference(SPEED_MODE_FIELD, SPEED_MODE_STANDARD) })}
      {speedSupported && option({ key: SPEED_MODE_FAST, label: t('speedFast'), description: t(state.current?.model === 'gpt-6-astra' ? 'speedFastAstraHint' : 'speedFastHint'), selected: fast && !ultrafast, disabled: !sessionWritable, onClick: () => choosePreference(SPEED_MODE_FIELD, SPEED_MODE_FAST) })}
      {ultrafastSupported && option({ key: SPEED_MODE_ULTRAFAST, label: t('speedUltrafast'), description: t('speedUltrafastHint'), selected: ultrafast, disabled: !sessionWritable, onClick: () => choosePreference(SPEED_MODE_FIELD, SPEED_MODE_ULTRAFAST) })}
    </>
  } else if (pane === 'verbosity') {
    content = verbosityItems.map(item => option({ key: item.id, label: item.label, description: item.description, selected: local.outputVerbosity === item.id, disabled: !sessionWritable, onClick: () => choosePreference(OUTPUT_VERBOSITY_FIELD, item.id) }))
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
    onMouseDown={event => {
      // Keep the search field focused until the option's click, as in the native DSH picker.
      if (pane === 'model' && event.button === 0 && event.target.closest?.('button[role="menuitemradio"]')
        && event.currentTarget.ownerDocument.activeElement?.getAttribute('role') === 'searchbox') event.preventDefault()
    }}
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
      onClick={() => {
        if (open) { close(); return }
        trace.current = openPickerTrace?.()
        setPane('root'); setOpen(true); load()
      }}
    >
      {fast && (!preferenceSnapshot.speedShortcut || preferenceSnapshot.speedShortcut === 'off' || !speedSupported) && <BoltIcon className="codexModelSelectBolt" aria-hidden="true" />}
      <span className="codexModelSelectLabel">{modelLabel}</span>
      {effortLabel === undefined ? null : <span className="codexModelSelectEffort">{effortLabel}</span>}
      <IconChevronDownOutline14 className="codexModelSelectChevron" />
    </button>
    {menu}
  </div>
}
