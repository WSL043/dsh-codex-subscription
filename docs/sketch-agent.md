# Native sketch commands — development interface

This document describes 2.1.0-beta.5, including protocol v2 changes.
Stable 2.0.1 does not include Agent drawing.

`codex_sketch` is a DSH-native tool, enabled only when both sketch editing and
Agent drawing are enabled. Both are opt-in Beta settings. The toolbar button is
for manual drawing; `@sketch` inserts a request and does not open the board by
itself. The Agent's first `inspect` opens it. No messages or attachments are sent
automatically.

## Protocol

1. `inspect` returns `protocolVersion`, `runId`, `documentId`, `revision`, layers,
   command help, a page of objects and recent write receipts.
2. `apply` takes these identity/version fields, a unique `requestId`, and a native
   command array (legacy JSON strings remain accepted). A batch is atomic and is
   one undo entry. A rejected geometry batch preserves the run and revision;
   correct it and retry. Other errors explain when a new inspect is needed.
3. `preview` returns the actual rendered PNG as a native DSH attachment.
4. `save` checkpoints without releasing the editing lock. `finish` saves and
   unlocks; its optional image feedback is off by default.

Coordinates are normalized; width is canvas pixels. Prefer meaningful object IDs
and targeted `object` updates instead of redrawing the document. `inspect` returns
50 objects per page and supports fetching one object's full geometry.

```json
[
  {"op":"layer","action":"add","id":2,"value":"Foreground"},
  {"op":"stroke","id":"wave","layer":2,"shape":"bezier","color":"#0088ff","width":12,
   "start":{"x":0.1,"y":0.7},
   "segments":[{"control1":{"x":0.2,"y":0.1},"control2":{"x":0.8,"y":0.1},"end":{"x":0.9,"y":0.7}}]}
]
```

In protocol v2, `layer.add.id` means the **new** layer's unique integer ID; omit it
to allocate automatically. `after` specifies an existing insertion anchor and
otherwise defaults to the active layer. `value` names the new layer. Earlier
versions reused the manual editor's anchor semantics for `id`; callers must not
carry that assumption forward. Other layer actions target an existing `id`.

Supported shapes: pen, line, arrow, text, rectangle, circle/ellipse, polygon,
bezier and eraser. Bezier accepts either `start` plus 1–64 complete segments or
the legacy 4/7/10/... point array, never both. Invalid geometry is rejected rather
than guessed or silently repaired.

## Lifecycle and recovery

Document, history, run state and deduplication receipts belong to the plugin's
session registry, not the input component. Switching away and back in the same
page preserves them. Closing the board does not stop drawing. Explicit stop is
preserved across remounts; only the user can resume it. An abandoned run unlocks
after three minutes without a tool operation.

The browser bridge is active while that session is viewed. A different session
has its own document and single authenticated browser lease. Connection failures
use bounded backoff and never replay an uncertain write. Inspect `recentRequests`
before retrying after transport failure. Identical writes are deduplicated by
request ID and content; stale revisions and conflicting retries are rejected.

Full-page reload, plugin reload and application exit are different from component
remounts: the registry is in memory. Saved drafts survive through IndexedDB;
unfinished changes and receipts are not a durable crash-recovery log. A disconnected
browser is not a headless renderer. This implementation does not promise continued
execution while viewing another session or after closing DSH.

`window.dshSketchAgent.execute(request)` exposes the same run when the session is
viewed and Agent drawing enabled, including with the dialog closed. It is an
explicit application API, not React-state manipulation or direct storage editing.

Resource budgets: 2,000 strokes, 2,000 points per stroke, 200,000 points per agent
document, eight layers, 256 commands per batch, 128 deduplication receipts subject
to a 4-million-character cache budget. These are resource protections, not a
claim of professional painting-tool completeness.

## File interchange (Beta)

The Drafts menu exports PNG, layered PSD, or `.dsh-sketch.json`. PSD exchanges
ordinary RGB pixel layers; the native draft retains editable brush strokes.
Import uses the existing file chooser and preserves the current draft before
replacing the board. ORA is intentionally not included.

PSD import accepts 8-bit RGB documents up to 4096 pixels per edge and 32 MB,
with at most eight raster layers, and fits the long edge to 1024 pixels.
Masks, effects, adjustments, non-normal blending and translucent groups are
rejected instead of being silently misrendered. Export preserves the editor's
white paper; if its bottom layer is hidden, a separate Paper layer is required.
An eight-layer document with a hidden bottom layer must show that layer first.

While the board is open, `window.dshSketchAgent.export('png'|'psd'|'draft')`
returns `{ extension, mediaType, base64 }` for agent file delivery. This is
separate from the browser's user-facing download/save behavior.

### Local acceptance evidence

The advanced illustration contains 427 native strokes in six layers at
1024 x 768. The actual file chooser imported both exported formats. PSD
retained all six named pixel layers; native JSON retained all 427 strokes and
the selected layer. Both re-rendered images were pixel-identical to the source.
Pillow independently decoded the PSD composite with an identical result.
The user also verified the PSD in Photoshop and supplied a screenshot showing all six layers.
The in-app browser previously canceled its blob download; successful file
encoding and roundtrip do not establish successful browser download delivery.
Artifacts are retained locally in `.artifacts/canvas-behind/`.
