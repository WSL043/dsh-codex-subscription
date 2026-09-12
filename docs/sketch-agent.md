# Native sketch commands — development interface

This document describes 2.1.0 and protocol v2.
Agent drawing remains an opt-in Beta feature.

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

## Draft reliability (development)

After a completed edit and 1.5 seconds of inactivity, the board stores a local
recovery checkpoint separately from named drafts. A page reload can restore
that checkpoint and shows a dismissible notice. It does not promise to recover
an in-progress stroke or edits made immediately before a crash. Explicit save
updates the draft and clears its checkpoint in one transaction. A failed save
preserves the previous persisted draft. Exports do not require a successful
local save, so a full draft store cannot block exporting. Clearing an unsaved
canvas and closing it removes its recovery checkpoint. Recovery is suspended during agent runs;
`finish` continues to save explicitly.

The browser database migrates from schema 1 to 2 without deleting existing
drafts. Lists read metadata; full documents are fetched only when opened.
Older plugin builds that explicitly open schema 1 cannot open the upgraded
database: export native drafts before downgrading. Storage keeps the existing
32-million-character budget, shared by at most 20 named drafts and 20 recovery
checkpoints. It refuses overflow instead of silently deleting drafts.

At most eight eligible idle session documents remain resident. Mounted, dirty,
running and user-stopped sessions are protected. Evicted saved sessions retain
a draft ID and reload on return; their undo history is not retained. This is
not a hard cap on all memory, since unsaved work takes priority.

The agent bridge polls every 2 seconds while idle and 350 milliseconds during
a run. Returning to the window or reconnecting the network wakes the bridge
after failed retries. Only one poll/connect is in flight; writes still use
claim checks and request receipts rather than automatic replay.

Storage migration blocked by another window is reported without leaving a
pending upgrade that later mutates the database. Close the other window and use
Retry. Recovery failures keep editing and agent writes disabled until recovery
succeeds; the board can still be closed. Incoming images wait for recovery and
file operations to finish before being marked received.
