# Sketch maintenance boundaries

This is an engineering guide, not a claim of additional shipped features.

## Ownership

- `sketch-session-state.js`: session lifetime, document refs and idle eviction.
- `sketch-document-lifecycle.js`: saved-document identity, snapshot saves, recovery, replacement and imports. Storage and image decoding can be injected for delayed/failing-I/O tests.
- `sketch-operation-gate.js`: synchronous exclusion for manual file operations. File menu, keyboard save, paste/drop, close and attach share this gate. Agent availability also checks it before a React busy-state commit.
- `sketch-gesture.js`: coalesced pointer samples, shape constraints, stroke erasing and object transforms. This hot path has no React state, storage, image decoding or layout reads; it preserves raw paths until pen-up smoothing.
- `sketch-tool-picker.jsx` and `sketch-layer-panel.jsx`: tool/layer presentation and callbacks. Document mutation stays with the owning controller. Every shape-menu choice observes the same busy/agent lock as its opener.
- `sketch-studio.jsx`: pointer lifecycle, painting scheduling, React effects and composition. Pointer-down/up, colors and brush options remain here; the component is still a candidate for evidence-led simplification.
- `sketch-agent-*`: transport, request receipts, command session and run lifecycle. Do not add model orchestration to the storage controller.

## Invariants for future changes

1. Save a cloned snapshot. Completing an older revision must not mark a newer edit clean; completing an older document save must not change the replacement document identity.
2. Recovery is cancellable and must not overwrite newer document edits. Recovered documents remain dirty until explicitly persisted.
3. Failed persistence must preserve the current document. Export remains independent of successful draft storage.
4. Acquire operation exclusion synchronously. Disabling a React button after the next render is insufficient to prevent same-event re-entry. Nested file-menu work stays inside one operation.
5. Rendering may use refs and animation frames; persistence and agent readiness must not infer state from visible button labels.
6. Keep host-native attachment behavior outside sketch document logic. Prefer an official host action/slot contract when available; maintain a bounded fallback for current DOM integration.

## Acceptance

Run the document-lifecycle tests with delayed storage and failures, then the full behavior suite/build. For client changes also verify the built client in official DSH: draw, save, create blank document, load the saved document, attach once, reopen attachment in sketch, and reload while a recovery checkpoint exists. Source tests alone are not visual acceptance.

## Remaining development requires evidence

Further pointer-lifecycle extraction should preserve synchronous operation exclusion and pen-up smoothing. Brush-pressure improvements need physical pen traces and frame-time measurements. Quota-forecast changes need chronological real-account trace replay. None of these should be presented as completed merely because the current unit tests pass.

## 2026-09-12 maintenance acceptance

- Source suite: 403 passed, 3 platform-gated tests skipped. Official DSH `0.1.5-rc.2` dependency probe: 300 behavior tests passed. Build passed.
- Fixed gesture traces cover coalesced versus individual samples, unmodified raw paths, Shift constraints on non-square canvases, object movement without accumulated drift, stroke/pixel eraser behavior, and bounded long strokes.
- Local CPU-only baseline: 1,000 strokes of 480 samples, median 0.012 ms and p95 0.050 ms per gesture update. This excludes painting, browser scheduling and physical pen latency; it is not an FPS guarantee.
- Built client loaded through the official rc.2 CLI in an isolated profile, with its installed client hash matched to the build. Visually checked pen/pencil switching, ellipse selection, layer copy/reorder/visibility, outside-click panel dismissal and shortcut layout. Saved and reopened a two-layer draft, attached one PNG through the native composer, opened preview and imported it as the third sketch layer. No browser console errors during this flow.
- rc.2's `ComposerAttachmentsOwnerProps` exposes add/remove/retry and upload state, but no preview-action injection callback. Its `ImageLightbox` only accepts source, alt, labels and close. Keep the current bounded preview wrapper; do not duplicate native upload/removal behavior. This audit does not change the published compatibility range or promote rc.2 to the stable baseline.
- Model capability gaps are reported only in support diagnostics (`catalog.unsupported` and `catalog-capabilities-not-adapted`). Unknown reasoning, input or speed identifiers do not enter executable model parameters. Diagnostics tests cover catalog reset/304 lifetime and exclusion of raw metadata.
