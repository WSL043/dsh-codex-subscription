import { useSyncExternalStore } from 'react'
import { BoltIcon } from '@heroicons/react/16/solid'
import { usePreferenceSnapshot } from './client-shared.js'
import { effectiveCodexSpeedMode, SPEED_MODE_FIELD, SPEED_SHORTCUT_FIELD, SPEED_MODE_STANDARD, SPEED_MODE_FAST, supportsCodexFastMode } from './settings-contract.js'

const labels = { standard: 'speedStandard', fast: 'speedFast', ultrafast: 'speedUltrafast' }
export function CodexSpeedShortcut({ directory, preference, t, locked }) {
  const { current } = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const status = usePreferenceSnapshot(preference)
  const mode = status[SPEED_SHORTCUT_FIELD]
  const modelId = current?.model
  const supportsFast = status.fastModels?.includes(modelId) ?? supportsCodexFastMode(modelId)
  if (mode === 'off' || current?.provider !== 'openai-codex' || !supportsFast || status.status !== 'ready') return null

  const speed = effectiveCodexSpeedMode(status.speedMode, modelId, {
    supportsFast, supportsUltrafast: status.ultrafastModels?.includes(modelId),
  })
  const next = speed === SPEED_MODE_STANDARD ? SPEED_MODE_FAST : SPEED_MODE_STANDARD
  const label = t(labels[speed])
  const hint = `${t('speedTitle')} · ${label} → ${t(labels[next])}${next === SPEED_MODE_FAST ? ` · ${t('speedFastHint')}` : ''}`
  const toggle = () => {
    const selected = directory.getSnapshot().current
    const saved = preference.getSnapshot()
    if (selected?.provider !== current.provider || selected?.model !== modelId ||
      saved.speedMode !== status.speedMode || saved.saving || !saved.writable) return
    void preference.set({ [SPEED_MODE_FIELD]: next })
  }
  return <span className="codexSpeedShortcutSeat" data-layout={mode} data-speed={speed}>
    <button type="button" className="codexSpeedShortcut" data-speed={speed}
      title={hint} aria-label={hint} aria-pressed={speed !== SPEED_MODE_STANDARD}
      disabled={locked || status.saving || !status.writable} onClick={toggle}>
      {mode === 'label' ? <span>{label}</span> : <span className="codexSpeedShortcutBolt"><BoltIcon aria-hidden="true" /></span>}
    </button>
  </span>
}

export const SPEED_SHORTCUT_CSS = `
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
  [data-slot="conversation.input.right"]:has(+[data-slot="conversation.input.model"])>.codexSpeedShortcutSeat[data-layout=hover][data-speed=standard]{position:relative;width:0}
  [data-slot="conversation.input.right"]:has(+[data-slot="conversation.input.model"])>.codexSpeedShortcutSeat[data-layout=hover][data-speed=standard]>.codexSpeedShortcut{
    position:absolute;inset-inline-end:0;opacity:0;visibility:hidden;background:var(--dsw-alias-bg-layer-1,Canvas);
    transition:opacity 150ms,visibility 0s 150ms
  }
  div:has(>[data-slot="conversation.input.right"]>.codexSpeedShortcutSeat[data-layout=hover][data-speed=standard]):has(>[data-slot="conversation.input.model"]:is(:hover,:focus-within)) .codexSpeedShortcut,
  .codexSpeedShortcutSeat[data-layout=hover][data-speed=standard]:is(:hover,:focus-within)>.codexSpeedShortcut{opacity:1;visibility:visible;transition:none}
}

/* Keep the labelled shortcut next to the native model trigger. */
div:has(>[data-slot="conversation.input.right"]>.codexSpeedShortcutSeat[data-layout=label]):has(>[data-slot="conversation.input.model"]){column-gap:0}
[data-slot="conversation.input.right"]:has(>.codexSpeedShortcutSeat[data-layout=label]):has(+[data-slot="conversation.input.model"]){display:contents}
div:has(>[data-slot="conversation.input.right"]>.codexSpeedShortcutSeat[data-layout=label])>[data-slot="conversation.input.model"]{order:1}
.codexSpeedShortcutSeat[data-layout=label]{order:2}
.codexSpeedShortcutSeat[data-layout=label]>.codexSpeedShortcut{padding-inline:7px}
.codexSpeedShortcutSeat[data-layout=label]>.codexSpeedShortcut:not([data-speed=standard]){font-weight:600}

`
