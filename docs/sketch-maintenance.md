# Sketch canvas development and testing

## Implementation boundaries

- `sketch-session-state.js` and `sketch-workspace.jsx` keep each conversation's document, history, agent connection and execution state. Switching conversations or closing the canvas leaves running work intact.
- `sketch-document-lifecycle.js` handles saving, restoring, replacing and importing. Save from a snapshot. Preserve newer edits and document identity when old operations complete. A restored document stays dirty until explicitly saved. Keep the document and export available after a save failure.
- `sketch-operation-gate.js` serializes file operations synchronously. `sketch-agent-export.js` holds the lock through encoding and Blob reads and releases it on success or failure.
- `sketch-gesture.js` retains raw coordinates until pointer release. Keep React state updates, layout reads and storage I/O out of the pointer path. `sketch-studio.jsx` handles drawing frames and UI actions.
- `sketch-agent-*` handles conversation connections, execution IDs, commands and results. See the [drawing protocol](sketch-agent.md). Use DSH's attachment operations and keep model and attachment controls out of document persistence.

## Checks for changes

1. Start drawing in two conversations in official DSH. Switch between them and verify that both continue, stopping one leaves the other active, and returning shows the correct canvas and progress. Save drafts before testing a full reload.
2. Check manual drawing, saving, creating, loading, attaching, returning from an attachment to the canvas and editing during restore. Verify playback and on-demand recording separately.
3. For UI changes, check light and dark themes, the composer button on hover, the active drawing indicator and operation in a narrow Desktop window.
4. Use automated tests for delayed and failed document operations, per-conversation state and concurrent exports. Use real input and frame measurements for pen pressure and drawing performance.

The following records describe the host and code used at the time.

## 2026-09-12 maintenance acceptance

- Source suite: 403 passed, 3 platform-gated tests skipped. Official DSH `0.1.5-rc.2` dependency probe: 300 behavior tests passed. Build passed.
- Fixed gesture traces cover coalesced versus individual samples, unmodified raw paths, Shift constraints on non-square canvases, object movement without accumulated drift, stroke/pixel eraser behavior, and bounded long strokes.
- Local CPU-only baseline: 1,000 strokes of 480 samples, median 0.012 ms and p95 0.050 ms per gesture update. This excludes painting, browser scheduling and physical pen latency; it is not an FPS guarantee.
- Built client loaded through the official rc.2 CLI in an isolated profile, with its installed client hash matched to the build. Visually checked pen/pencil switching, ellipse selection, layer copy/reorder/visibility, outside-click panel dismissal and shortcut layout. Saved and reopened a two-layer draft, attached one PNG through the native composer, opened preview and imported it as the third sketch layer. No browser console errors during this flow.
- rc.2's `ComposerAttachmentsOwnerProps` exposes add/remove/retry and upload state, but no preview-action injection callback. Its `ImageLightbox` only accepts source, alt, labels and close. Keep the current bounded preview wrapper; do not duplicate native upload/removal behavior. This audit does not change the published compatibility range or promote rc.2 to the stable baseline.
- Model capability gaps are reported only in support diagnostics (`catalog.unsupported` and `catalog-capabilities-not-adapted`). Unknown reasoning, input or speed identifiers do not enter executable model parameters. Diagnostics tests cover catalog reset/304 lifetime and exclusion of raw metadata.

### Follow-up: Agent export exclusion

The native `dshSketchAgent.export()` previously only checked whether the editor was busy at entry; it never acquired the file-operation gate. It now holds the existing gate through encoding and byte serialization. The export payload and formats are unchanged.

- Regression tests hold encoding and Blob reads separately, reject concurrent exports/manual file work, preserve original failures, and verify successful retry. Full source suite: 406 passed, 3 platform-gated skips; official rc.2 behavior suite: 303 passed; build passed.
- In the isolated rc.2 browser, deliberately paused PSD Blob serialization. Pen and attach controls became disabled, and an immediate second export returned a busy error. Releasing the pause produced a 328,649-byte PSD and restored both controls. An unsupported-format request returned its original error; the following PNG export succeeded (49,200 bytes). No console errors. The temporary Blob interception was restored and removed after the test. No model requests were made.
