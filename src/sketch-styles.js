export const SKETCH_CSS = `
.codexSketchDialog{--sketch-bg:var(--dsw-alias-bg-layer-1,#f5f5f7);--sketch-fg:var(--dsw-alias-label-primary,#202124);--sketch-muted:var(--dsw-alias-label-secondary,#727279);--sketch-line:var(--dsw-alias-border-l2,#8883);--sketch-glass:color-mix(in srgb,var(--sketch-bg) 90%,transparent);box-sizing:border-box;width:min(860px,calc(100vw - 32px));max-height:94dvh;margin:auto;padding:20px 24px 14px;border:1px solid var(--sketch-line);border-radius:32px;background:var(--sketch-bg);color:var(--sketch-fg);box-shadow:0 24px 90px #0004;overflow:auto;font:13px/1.4 system-ui}
.codexSketchDialog::backdrop{background:#0005;backdrop-filter:blur(12px)}
.codexSketchDialog *{box-sizing:border-box}
.codexSketchDialog button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0}
.codexSketchDialog button:disabled{opacity:.35;cursor:default}
.codexSketchDialog button:focus-visible,.codexSketchCustom:focus-within,.codexSketchDialog input:focus-visible{outline:2px solid #0a84ff;outline-offset:3px}
.codexSketchTop{display:flex;align-items:center;justify-content:space-between;gap:12px}
.codexSketchHeading{display:flex;align-items:center;gap:8px;flex:1}.codexSketchHeading strong{font-size:16px;font-weight:600}.codexSketchHeading>span{font-size:10px;color:var(--sketch-muted);border:1px solid var(--sketch-line);border-radius:6px;padding:1px 5px}
.codexSketchRound{width:44px;height:44px;border-radius:50%}
.codexSketchTop>.codexSketchRound,.codexSketchLayersToggle,.codexSketchHistory{background:var(--sketch-glass)!important;border:1px solid var(--sketch-line)!important;box-shadow:0 2px 8px #0001;backdrop-filter:blur(16px)}
.codexSketchDialog .codexSketchConfirm{min-height:44px;padding:0 16px;border-radius:24px;background:#0a84ff;color:#fff;font-weight:600}
.codexSketchUtility{display:flex;justify-content:space-between;align-items:center;margin:14px 0}
.codexSketchHistory{display:flex;border-radius:24px;padding:0 2px}.codexSketchLayersToggle{height:44px;border-radius:24px;padding:0 14px}.codexSketchLayersToggle>span{font-variant-numeric:tabular-nums;color:var(--sketch-muted)}
.codexSketchDialog button:hover:not(:disabled){filter:brightness(.94)}
.codexLayerBody{position:relative;display:grid;place-items:center;min-width:0}
.codexLayerStudio canvas{display:block;width:min(100%,47dvh);height:auto;aspect-ratio:1;background:white;border-radius:12px;outline:1px solid #0001;box-shadow:0 5px 20px #0002;touch-action:none;cursor:crosshair}
.codexSketchControls{width:fit-content;max-width:100%;margin:18px auto 0;padding:6px 12px 10px;border:1px solid var(--sketch-line);border-radius:28px;background:var(--sketch-glass);box-shadow:0 5px 20px #0001;backdrop-filter:blur(18px)}
.codexSketchPill{display:flex;gap:4px;justify-content:center}.codexSketchPill button{min-width:58px;min-height:56px;flex-direction:column;gap:3px;padding:5px 8px;border-radius:18px}.codexSketchPill button>span{font-size:11px}
.codexSketchPill button[aria-pressed=true],.codexSketchSegment button[aria-pressed=true]{background:color-mix(in srgb,var(--sketch-fg) 9%,transparent);box-shadow:inset 0 0 0 1px var(--sketch-line)}
.codexLayerBrush{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px;margin:6px 0}
.codexSketchWidth{display:flex;align-items:center;gap:10px;color:var(--sketch-muted);font-size:11px}.codexSketchWidth input{width:110px;min-height:32px;accent-color:#0a84ff}.codexSketchWidth output{width:20px;font-variant-numeric:tabular-nums}
.codexSketchSegment{display:flex;padding:2px;border-radius:12px;background:color-mix(in srgb,var(--sketch-fg) 5%,transparent)}.codexSketchSegment button{min-height:40px;padding:0 10px;border-radius:10px;font-size:11px}
.codexSketchPalette{display:flex;align-items:center;justify-content:center;gap:4px}
.codexSketchDialog .codexSketchSwatch{position:relative;width:40px;height:40px;border-radius:50%;background:transparent}
.codexSketchSwatch::before{content:'';width:24px;height:24px;border-radius:50%;background:var(--swatch);box-shadow:inset 0 0 0 1px #8884}
.codexSketchSwatch[aria-pressed=true]::after{content:'';position:absolute;inset:3px;border:2px solid #0a84ff;border-radius:50%}
.codexSketchCustom{position:relative;display:grid;place-items:center;width:36px;height:36px;margin:2px;border-radius:50%;background:conic-gradient(#ff3936,#ffcc00,#34c759,#0088ff,#a855f7,#ff3936);cursor:pointer}.codexSketchCustom span{width:24px;height:24px;border:3px solid var(--sketch-bg);border-radius:50%}.codexSketchCustom input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.codexSketchHint{max-width:460px;margin:10px auto 0;text-align:center;color:var(--sketch-muted);font-size:11px;line-height:1.5}.codexSketchHint[role=alert]{color:var(--dsw-alias-state-error-primary,#e44)}
.codexSketchLayers{position:absolute;top:0;right:0;width:216px;max-height:100%;overflow:auto;padding:12px;border:1px solid var(--sketch-line);border-radius:20px;background:var(--sketch-glass);backdrop-filter:blur(24px);box-shadow:0 10px 40px #0003;z-index:2}
.codexSketchLayers header{display:flex;align-items:center;justify-content:space-between}.codexSketchLayers header button{height:40px;width:40px;border-radius:50%;font-size:22px}
.codexLayerList{max-height:180px;overflow:auto}.codexLayerRow{display:flex;align-items:center;border-radius:12px;margin:3px 0}.codexLayerRow[data-active=true]{background:color-mix(in srgb,#0a84ff 14%,transparent)}.codexLayerRow button{min-height:40px;padding:0 8px}.codexLayerRow button:last-child{flex:1;justify-content:flex-start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.codexSketchLayerLabel{display:block;color:var(--sketch-muted);font-size:11px;margin:10px 0 4px}.codexSketchLayers input{width:100%;padding:8px 10px;min-height:38px;font:inherit;color:inherit;background:color-mix(in srgb,var(--sketch-fg) 5%,transparent);border:1px solid var(--sketch-line);border-radius:10px}
.codexLayerActions{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px}.codexLayerActions button{min-height:40px;border-radius:10px;font-size:11px;justify-content:flex-start}.codexSketchClearLayer{width:100%;min-height:40px;margin-top:8px;border-top:1px solid var(--sketch-line)!important;color:var(--dsw-alias-state-error-primary,#e44)!important;font-size:11px!important}
@media(max-width:600px){.codexSketchDialog{width:calc(100vw - 16px);padding:12px;border-radius:26px;max-height:96dvh}.codexSketchHeading{gap:5px}.codexSketchHeading strong{font-size:14px}.codexSketchConfirm{padding:0 12px!important}.codexSketchUtility{margin:8px 0}.codexLayerStudio canvas{width:min(100%,42dvh)}.codexSketchControls{margin-top:12px;padding:5px 6px 8px;border-radius:24px}.codexSketchPill{gap:0}.codexSketchPill button{min-width:48px;padding:5px 4px}.codexSketchPalette{gap:0}.codexSketchSwatch{width:36px!important;height:40px!important}.codexSketchLayers{position:relative;width:100%;max-height:240px;margin-top:10px}.codexLayerBody.withLayers canvas{width:min(100%,28dvh)}.codexSketchLayers header{height:32px}.codexLayerList{max-height:84px}.codexSketchHint{font-size:10px}}
@media(prefers-reduced-transparency:reduce){.codexSketchControls,.codexSketchLayers{background:var(--sketch-bg);backdrop-filter:none}.codexSketchDialog::backdrop{backdrop-filter:none;background:#0009}}
@media(prefers-contrast:more){.codexSketchDialog{--sketch-line:currentColor}.codexSketchControls,.codexSketchLayers{background:var(--sketch-bg)}}
`
