# Sketch and DSH upstream research — 2026-09-15

Engineering findings, not release notes. No new feature is claimed shipped by this report.

## Evidence and boundaries

Inspected the signed-in ChatGPT Sketch editor and its actually loaded client modules through the browser debugger. These are distributed, minified frontend modules, not original source or server implementation. Local evidence is under `.artifacts/sketch-official-20260915/`; `sources.json` records observed script URLs. Vendor code is not incorporated into the plugin.

The core module was `https://chatgpt.com/cdn/assets/6418316b-d3ifo9dfnnzjlxxf.js`; the modal, controls and attachment transition are separate modules. This establishes the current ChatGPT frontend implementation, not a public Sketch API or an equivalent implementation in the Codex desktop binary. The latter has not been established.

DSH source inspected: tag `dsh-v0.1.6-alpha.1`, commit `0a15e36e7f82b6ed45af6fa9759f29b40dcd965d`, including `packages/llm/llm-pi-ai/src/context.ts`, `packages/compaction/compaction-image-offload/src/` and `packages/mcp/mcp-resources/README.md`.

## What to absorb from Sketch

| Observed implementation | Our current implementation | Decision |
| --- | --- | --- |
| Coalesced native pointer events, duplicate-event filtering, batched pointerMoves | `sketch-studio.jsx` already passes coalesced samples into the gesture layer | Preserve batching; profile duplicate handling before changing it. More samples do not alone prove smoother drawing. |
| Pixel-ratio-aware canvas allocation and document/replacement-aware render reuse | `sketch-layer-renderer.js` caches committed layers and renders active strokes separately | Keep existing incremental renderer. Measure actual repaint cost before adding dirty-region complexity. |
| Independent text measurement/layout and selection hit testing | Text and object commands exist, with targeted inspection and transforms | Prioritize direct text editing, selection handles and predictable text bounds in the next UI change. Verify existing behavior before adding a second text model. |
| Separate editor, controls, modal and attachment transition | Our document, gesture and command logic is split, but studio still coordinates substantial UI state | Extract controller responsibilities only alongside behavior changes; avoid a cosmetic whole-editor rewrite. |
| Visible line, arrow, rectangle, ellipse, triangle, diamond, star and heart tools | Agent already has polygons and cubic Beziers | Simple shape presets can reuse existing geometry. Do not make agents emit dense freehand points to approximate curves. |

No claim is made that official Sketch offers rotation, multiple selection, a public agent endpoint, or better measured latency: these were not established by the inspected evidence. Preserve the user's pen-up smoothing requirement; do not introduce a delayed cursor or replace it with continuous corrective smoothing.

## New DSH capabilities worth using

### Durable image offload: real integration opportunity

The pi-ai context builder prepares request images, enforces `maxRequestImageBytes`, and raises `IMAGE_OFFLOAD_REQUIRED` with the number of oldest image occurrences to offload. The host compaction plugin records `image/offload`, projects those occurrences as `offloaded: true`, and retries. Offloaded occurrences become text placeholders. This is not deletion of the underlying image attachment.

Our adapter already supplies `maxRequestImageBytes` in `src/index.js`. Therefore the correct integration is to preserve this native error and projection path, not add a second plugin-level image-history pruning algorithm. Whether the offload plugin is enabled in a particular installation still matters.

Required next acceptance: repeated sketch previews exceed a deliberately reduced byte limit; the native offload event persists across restart/fork; the next model request contains placeholders; the user can still explicitly reopen the original attachment; a new explicit reference remains usable. Also test cloud compaction against changed history projections. The bridge's history hash should reject stale checkpoints, but that alone does not demonstrate end-to-end correctness.

### Native resources and tools

DSH now exposes scoped MCP resource discovery/read/template tools when a server is configured. Reuse the host's tools for external resources; do not add an independent MCP manager or unconditional prompt injection. This does not require changing the subscription transport.

Headless session selection and JSON event output are useful for reproducible acceptance. They are not proof that the current browser-backed sketch bridge can draw without a connected client. A headless drawing service would require its own document lifetime and rendering design; do not advertise one implicitly.

Browser/computer tooling and team orchestration remain host responsibilities. Validate that the subscription adapter preserves their tool calls and results, rather than duplicate those implementations.

## Work order and acceptance gates

1. Add native image-offload lifecycle coverage, especially the interaction with optional cloud compaction. No new user setting is needed for a duplicate mechanism.
2. Audit text editing and selection in the running sketch UI, then implement the smallest identified usability gaps using the existing object model. Verify mouse, keyboard, zoom and agent lock behavior.
3. Improve agent shape ergonomics through existing polygon/Bezier commands and targeted inspection. Benchmark successful edits and tool payload size on the same drawing task; do not assume more prompt instructions help.
4. Complete the opt-in cloud-compaction settings, scheduler coexistence and retention/export-import acceptance before exposing it. Existing successful replay experiments do not establish summary quality or losslessness.

The compatibility candidate and earlier runtime probes are recorded separately in `.artifacts/alpha016-runtime/ACCEPTANCE.md`. This research adds implementation evidence; it does not replace installed-host visual acceptance or authorize a release.

## Implementation and acceptance follow-up

Implemented in the working candidate:

- Text wraps and fits uniformly instead of Canvas horizontally condensing long lines. Layout is cached by immutable object and canvas size. Double-click edits selected text; Ctrl/Command+Enter commits, Escape cancels, and IME composition is preserved. New text placed at the bottom/right keeps a usable box.
- Selection movement stops at canvas boundaries. Existing pen-up smoothing and incremental rendering are retained.
- Agent triangle, diamond and star presets take two corners and store canonical polygons, so existing imports, edits and exports continue to work. Targeted inspection omits unrelated objects and repeated help.
- Advanced settings expose opt-in cloud compaction, off by default. It preserves native DSH history/compaction, uses SSE, caps the trigger at half the model window (maximum 100,000 tokens), and discards checkpoints after seven days or after account/model/history changes. It creates no separate history database. Native session retention owns the persisted records.

Evidence from this follow-up (all live model checks used GPT-5.6-Luna):

- Native DSH 0.1.6-alpha.1 offload executor and pi-ai context conversion: oldest occurrence replaced, JSONL restored, seeded fork retained the projection, and a fresh explicit image reference remained live. Attachment bytes were retained. `scripts/experiments/upstream-offload.mjs` reproduces this using synthetic attachment storage and no network.
- Live Luna low image check: reduced image byte limit triggered the native repair/retry path; the retained image was correctly described as blue. `.artifacts/luna-offload-live-result.json`.
- Live Luna low geometry check: five successful tool calls, six editable objects, presets plus cubic curve, targeted star inspection, orange recolor and finish. Initial inspect returned 2,641 bytes; targeted inspect returned 745 bytes. This compares response sizes within this task, not overall model token consumption or universal drawing quality. `.artifacts/luna-upstream-sketch-result.json`.
- DSH web UI on an isolated 0.1.6-alpha.1 host: text input, wrapping, keyboard commit/cancel and double-click checked visually; Luna's draft imported and displayed. A live Luna conversation then automatically opened the board, added a blue star/curve/text and finished with the completion banner. `.artifacts/luna-native-upstream.png`.
- Cloud checkpoint: a 52,043-byte synthetic input compacted; fresh-process native JSONL restore replayed 9,426 bytes and recovered ORBIT-618, 7300, 2026-11-23 and the no-overwrite constraint. The official 0.1.6-alpha.1 source ZIP exporter preserved the checkpoint byte-for-byte; reimport into native JSONL preserved it. This is not a claim of an official ZIP import UI, losslessness, or quality superiority over DSH summaries.
- Cancellation, changed native summary, offloaded image projection, disabled mode, expired/future checkpoint, small context window and corrupted checkpoint have regression coverage. Host compaction still owns its scheduler; the bridge neither registers a competing scheduler nor replaces surface events.

Observed limits: one cloud continuation received a server-overload response before a successful retry. A first isolated UI trial edited settings.yaml externally: the host exposed the tool while the existing page still showed Agent drawing off, producing a missing-board error. Enabling it through the settings UI synchronized both ends and the live drawing passed. Follow-up isolated the plugin defect: the serialized searchDomains transform referenced a module-local helper, which browser schema rehydration could not resolve. The native scope therefore stayed unavailable and the plugin displayed its startup RPC fallback. Reusing the self-contained domain normalizer restores native scope updates without another cache or polling loop. A regression test reproduces the original ReferenceError and checks JSON schema/value round-trip, domain normalization and invalid-domain rejection. On DSH 0.1.6-alpha.1, external file changes now update Agent drawing in both directions without a page reload; after external enable, Luna low completed four tool calls (inspect, drawing, verification, finish), with the completion banner visually verified in .artifacts/settings-sync-luna.png. Both development and native-runtime focused suites passed 35/35. The host UI test used the linked working candidate; packaged install/update remains a release-time check.

Reproduction: set `DSH_TEST_RUNTIME` to an installed DSH `node_modules/.pnpm` directory, then run `node scripts/experiments/upstream-offload.mjs`. For the explicit, quota-consuming Luna tool experiment run `node scripts/experiments/luna-sketch-upstream.mjs --live`; it reads an existing Codex login from `CODEX_AUTH_PATH` or the user's `.codex/auth.json`. No user session is modified by these scripts. The experiment's in-memory board complements, rather than replaces, the separately performed browser acceptance.
