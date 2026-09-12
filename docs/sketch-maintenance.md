# Sketch maintenance boundaries

This is an engineering guide, not a claim of additional shipped features.

## Ownership

- `sketch-session-state.js`: session lifetime, document refs and idle eviction.
- `sketch-document-lifecycle.js`: saved-document identity, snapshot saves, recovery, replacement and imports. Storage and image decoding can be injected for delayed/failing-I/O tests.
- `sketch-operation-gate.js`: synchronous exclusion for manual file operations. File menu, keyboard save, paste/drop, close and attach share this gate. Agent availability also checks it before a React busy-state commit.
- `sketch-studio.jsx`: browser input, painting scheduling, React effects and composition. It still contains substantial pointer/UI code; extracting document lifecycle does not make the remaining component debt-free.
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

Pointer handling and tool-panel composition can be extracted next along stable responsibility boundaries, keeping the pen-down path free of storage work. Brush-pressure improvements need physical pen traces and frame-time measurements. Quota-forecast changes need chronological real-account trace replay. None of these should be presented as completed merely because the current unit tests pass.
