import { useLayoutEffect, useSyncExternalStore } from 'react'
import { BoltIcon } from '@heroicons/react/16/solid'
import { usePreferenceSnapshot, useSessionPreferenceSnapshot } from './client-shared.js'
import { resolveSessionSpeedMode } from './settings-contract.js'
import { effectiveCodexSpeedMode, SPEED_MODE_FIELD, SPEED_SHORTCUT_FIELD, SPEED_MODE_STANDARD, SPEED_MODE_FAST, supportsCodexFastMode } from './settings-contract.js'

const labels = { standard: 'speedStandard', fast: 'speedFast', ultrafast: 'speedUltrafast' }
export function CodexSpeedShortcut({ available, sessionId, sessionPreferences, directory, preference, t, locked }) {
  const { current } = useSyncExternalStore(listener => directory.subscribe(listener), () => directory.getSnapshot())
  const profile = usePreferenceSnapshot(preference)
  const mode = profile[SPEED_SHORTCUT_FIELD]
  const modelId = current?.model
  const supportsFast = profile.fastModels?.includes(modelId) ?? supportsCodexFastMode(modelId)
  const codex = available && current?.provider === 'openai-codex' && profile.status === 'ready'
  const enabled = codex && mode !== 'off' && supportsFast
  // Keep the composer subscription while a detached submenu is open, even
  // with the shortcut off and another plugin claiming the model-label slot.
  const tracksSession = enabled || (codex && profile.composerModelPickerActive)
  const status = useSessionPreferenceSnapshot(sessionPreferences, tracksSession ? sessionId : undefined)
  const visible = enabled && status.status === 'ready'
  useLayoutEffect(() => {
    if (!visible) return
    const style = document.createElement('style')
    style.textContent = SPEED_SHORTCUT_CSS
    document.head.append(style)
    return () => style.remove()
  }, [visible])
  if (!visible) return null

  const speed = effectiveCodexSpeedMode(resolveSessionSpeedMode(status.speedMode, profile.speedMode), modelId, {
    supportsFast, supportsUltrafast: profile.ultrafastModels?.includes(modelId),
  })
  const next = speed === SPEED_MODE_STANDARD ? SPEED_MODE_FAST : SPEED_MODE_STANDARD
  const label = t(labels[speed])
  const hint = `${t('speedTitle')} · ${label} → ${t(labels[next])}${next === SPEED_MODE_FAST ? ` · ${t('speedFastHint')}` : ''}`
  const toggle = () => {
    const selected = directory.getSnapshot().current
    if (locked || selected?.provider !== current.provider || selected?.model !== modelId) return
    void sessionPreferences.set(sessionId, { [SPEED_MODE_FIELD]: next }, status)
  }
  return <span className="codexSpeedShortcutSeat" data-layout={mode} data-speed={speed}>
    <button type="button" className="codexSpeedShortcut" data-speed={speed}
      title={hint} aria-label={hint} aria-pressed={speed !== SPEED_MODE_STANDARD}
      disabled={locked || status.saving || !status.writable} onClick={toggle}>
      {mode === 'label' ? <span>{label}</span> : <span className="codexSpeedShortcutBolt"><BoltIcon aria-hidden="true" /></span>}
    </button>
  </span>
}

const SPEED_SHORTCUT_CSS = `
.codexSpeedShortcutSeat{display:inline-flex;align-items:center;flex:none}
.codexSpeedShortcut{display:inline-flex;align-items:center;justify-content:center;min-width:25px;min-height:27px;padding:2px 5px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,CanvasText);font:inherit;font-size:12px;line-height:1.2;white-space:nowrap;cursor:pointer}
.codexSpeedShortcutBolt{display:grid;place-items:center}
.codexSpeedShortcut svg{width:14px;height:14px;display:block}
.codexSpeedShortcut[data-speed=standard] svg{fill:none;stroke:currentColor;stroke-width:.9}
.codexSpeedShortcut:not([data-speed=standard]){color:var(--dsw-alias-label-primary,CanvasText)}
.codexSpeedShortcut:hover:not(:disabled){background:color-mix(in srgb,currentColor 10%,transparent)}
.codexSpeedShortcut:focus-visible{outline:2px solid currentColor;outline-offset:1px}
.codexSpeedShortcut:disabled{cursor:default;opacity:.5}

[data-slot="conversation.input.right"]:has(.codexSpeedShortcutSeat:is([data-layout=icon],[data-layout=hover])){display:flex;align-items:center}
div:has(>[data-slot="conversation.input.right"]>.codexSpeedShortcutSeat:is([data-layout=icon],[data-layout=hover])):has(>[data-slot="conversation.input.model"]){column-gap:0}

@media(hover:hover) and (pointer:fine){
  /* The composer group stays hovered across the seam between the model and shortcut. */
  [data-slot="conversation.input.right"]:has(+[data-slot="conversation.input.model"])>.codexSpeedShortcutSeat[data-layout=hover][data-speed=standard]>.codexSpeedShortcut{
    opacity:0;pointer-events:none;transition:opacity 150ms
  }
  div:is(:hover,:focus-within)>[data-slot="conversation.input.right"]:has(+[data-slot="conversation.input.model"])>.codexSpeedShortcutSeat[data-layout=hover][data-speed=standard]>.codexSpeedShortcut{opacity:1;pointer-events:auto;transition:none}
}

/* Keep the labelled shortcut next to the native model trigger. */
div:has(>[data-slot="conversation.input.right"]>.codexSpeedShortcutSeat[data-layout=label]):has(>[data-slot="conversation.input.model"]){column-gap:0}
[data-slot="conversation.input.right"]:has(>.codexSpeedShortcutSeat[data-layout=label]):has(+[data-slot="conversation.input.model"]){display:contents}
div:has(>[data-slot="conversation.input.right"]>.codexSpeedShortcutSeat[data-layout=label])>[data-slot="conversation.input.model"]{order:1}
.codexSpeedShortcutSeat[data-layout=label]{order:2}
.codexSpeedShortcutSeat[data-layout=label]>.codexSpeedShortcut{padding-inline:7px}
.codexSpeedShortcutSeat[data-layout=label]>.codexSpeedShortcut:not([data-speed=standard]){font-weight:600}

`
