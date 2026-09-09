export const SKETCH_CSS = `
.codexWorkspaceLaunch{border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;padding:5px 9px;border-radius:9px;transition:background .15s}
.codexWorkspaceLaunch:hover{background:#8882}
.codexSketchDialog{box-sizing:border-box;width:min(760px,94vw);max-height:92dvh;overflow:auto;border:1px solid #8882;border-radius:28px;padding:24px;background:var(--dsw-alias-background-surface,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 24px 100px #0002}
.codexSketchDialog::backdrop{background:#e8e9ecb8;backdrop-filter:blur(7px)}
.codexSketchDialog h2{font-size:20px;font-weight:600;margin:0 0 14px}
.codexSketchDialog button,.codexSketchDialog select{font:inherit;padding:8px 12px;border:1px solid #8883;border-radius:12px;color:inherit;background:transparent;cursor:pointer}
.codexSketchDialog button:disabled{opacity:.35;cursor:default}
.codexSketchDialog button:focus-visible,.codexSketchCustom:focus-within{outline:3px solid #007aff;outline-offset:4px}
.codexSketchDialog footer{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
.codexSketchDialog p{font-size:13px;line-height:1.6}
.codexTemplateForm{display:grid;gap:16px}
.codexTemplateForm textarea{min-height:180px;padding:16px;font:inherit;color:inherit;background:transparent;border:1px solid #8884;border-radius:16px;resize:vertical}
.codexTemplateForm textarea:focus{outline:2px solid #007aff;outline-offset:2px;border-color:transparent}
.codexImageDefaults{width:fit-content;margin:0;padding:5px 10px;border:1px solid #8882;border-radius:999px;color:var(--dsw-alias-label-secondary,#73737b)}
.codexSketchDialog footer button:last-child{background:#007aff;color:white;border-color:transparent}
.codexSketchStudio{width:min(720px,94vw,calc(92dvh - 190px));padding:24px 28px 12px;border:0;border-radius:40px;background:#fff;color:#171719;overflow:hidden}
.codexSketchTop{display:flex;align-items:center;justify-content:space-between;gap:10px}
.codexSketchStudio button{display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;color:#171719;flex-shrink:0}
.codexSketchStudio .codexSketchRound{width:48px;height:48px;border:1px solid #ededee;border-radius:50%;background:#fff;box-shadow:0 2px 7px #00000008}
.codexSketchPill{display:flex;align-items:center;padding:5px;gap:2px;border-radius:34px;border:1px solid #ededee;box-shadow:0 3px 12px #0000000c;background:white}
.codexSketchPill button{height:44px;width:44px;border-radius:50%}
.codexSketchPill button[aria-pressed=true]{background:#f0f0f2}
.codexSketchPill button:hover,.codexSketchRound:not(:disabled):hover{background:#f5f5f7}
.codexSketchHistory{display:flex;gap:7px}
.codexSketchHistory .codexSketchRound{width:38px;height:38px;box-shadow:none;border:0}
.codexSketchBrush{height:28px;margin:12px 0 0;display:flex;justify-content:center;align-items:center;gap:12px;color:#8b8b90}
.codexSketchBrush>span{border-radius:50%;max-width:24px;max-height:24px;min-width:4px;flex-shrink:0}
.codexSketchBrush input{width:96px;height:3px;accent-color:#171719}
.codexSketchBrush button{width:28px;height:28px;margin-left:8px;color:#8b8b90}
.codexSketchStudio canvas{display:block;width:100%;height:auto;aspect-ratio:1;background:#fff;touch-action:none;cursor:crosshair}
.codexSketchBottom{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:8px 0}
.codexSketchPalette{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:1;max-width:470px}
.codexSketchStudio .codexSketchSwatch{width:28px;height:28px;border-radius:50%;background:var(--swatch);outline-offset:3px}
.codexSketchSwatch[aria-pressed=true]{outline:3px solid #0088ff}
.codexSketchCustom{position:relative;display:grid;place-items:center;flex-shrink:0;width:34px;height:34px;border-radius:50%;background:conic-gradient(#ff3936,#ffcc00,#34c759,#0088ff,#a855f7,#ff3936);cursor:pointer}
.codexSketchCustom span{width:22px;height:22px;border:3px solid white;border-radius:50%}
.codexSketchCustom input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.codexSketchRound,.codexSketchSwatch,.codexSketchConfirm,.codexSketchCustom,.codexSketchCustom span,.codexSketchPill button{corner-shape:round}
.codexSketchStudio .codexSketchConfirm{width:56px;height:56px;border-radius:50%;background:#007aff;color:white;box-shadow:0 3px 9px #007aff20}
.codexSketchStudio .codexSketchConfirm:not(:disabled):hover{background:#0065d5}
.codexSketchStudio .codexSketchHint{font-size:11px;color:#929398;text-align:center;margin:6px 0 0}
@media(max-width:520px){.codexSketchStudio{width:calc(100vw - 24px);padding:18px 18px 12px;border-radius:30px}.codexSketchPalette{gap:9px}.codexSketchStudio .codexSketchSwatch{width:23px;height:23px}.codexSketchStudio .codexSketchConfirm{width:46px;height:46px}.codexSketchPill button{width:35px;height:35px}.codexSketchHistory{gap:0}.codexSketchHistory .codexSketchRound{width:30px;height:32px}.codexSketchTop>.codexSketchRound{width:40px;height:40px}.codexSketchBottom{gap:12px}}
`
