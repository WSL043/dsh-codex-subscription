# Native sketch commands — development interface

This document describes protocol v2 (feedback tools and appearance fields added after 3.0.1).
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
3. `preview` returns the actual rendered PNG as a native DSH attachment (also `side`/`diff` modes against the reference; see Feedback tools).
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

### SVG command

`{op:"svg",svg:"<svg viewBox=\"0 0 1024 768\">…</svg>",layer:1}` lets the model draw a whole scene in the notation it is best at. A stroke command carries every Bezier point as a JSON object, roughly three times the tokens of the same curve in SVG path syntax, and models are trained on vastly more SVG than on this protocol, so long illustrations were slow and less detailed than the model could make them.

The SVG is converted to the same native strokes (bezier, polygon, line, pen) in one batch, so the result stays editable, layered, exportable, and undoable as a single step.

Supported: `path` (M L H V C S Q T A Z, relative forms, compact arc flags), `rect` (with `rx`/`ry`), `circle`, `ellipse`, `line`, `polyline`, `polygon`, `g`, `use` of an element in the same SVG, `transform` (matrix, translate, scale, rotate, skew), `fill`, `stroke`, `stroke-width`, `opacity`, `fill-opacity`, `stroke-opacity` and `style="…"` declarations, colors as `#rgb`, `#rrggbb`, `rgb()` or a basic name.

Kept as real effects (not flattened):
- `linearGradient` / `radialGradient` on filled shapes: `objectBoundingBox` and `userSpaceOnUse`, `href` chains, `stop-opacity`, `gradientTransform`. A gradient on a stroked line is flattened to its average color (`warnings`).
- `filter` with `feGaussianBlur` becomes a blur on each shape it covers; other filter primitives are ignored with a warning.
- `mix-blend-mode` becomes the stroke's `blend`.
- `clip-path="url(#id)"` whose `clipPath` holds one path, rect, circle, ellipse or polygon becomes the stroke's `clip`.

Reported, not silent:
- A filled path with more than 64 curve segments is flattened to a polygon (`warnings`).
- Points outside the canvas are clamped; the number is returned as `clampedPoints`.

Refused with the element or attribute named: `text`, `image`, `mask`, `pattern`, `marker`, `symbol`, `style` elements, `foreignObject`, and the `mask` attribute. The `viewBox` must match the canvas ratio. One command may hold up to 200000 characters, and a batch still stops at the stroke and point budgets.

### Appearance of a stroke

Every stroke (native or from SVG) can carry four optional appearance fields, all kept as data so the object stays editable:

| Field | Meaning |
| --- | --- |
| `gradient` | `linear` (`x1,y1,x2,y2`) or `radial` (`cx,cy,r`) with 2–8 stops; coordinates are relative to the shape's own box, so moving or scaling the object keeps the gradient |
| `blur` | softens the stroke by that many canvas pixels (glow, shadow, haze) |
| `blend` | `multiply`, `screen`, `overlay`, `soft-light`, `hard-light`, `color-dodge`, `color-burn`, `darken`, `lighten`, `lighter`; blends with what is already painted on the same layer |
| `clip` | a polygon, bezier, rectangle or circle that the stroke is cut to, so shading stays inside the form it shades |

A layer can blend with the layers under it: `{op:"layer",action:"blend",id:2,value:"multiply"}` (`normal` clears it). Gradient, blur, blend and clip are included in object transforms, saved drafts and exports.

## Feedback tools for drawing from a reference

The tools only measure and show; they never draw. The model decides every stroke.

- `reference` puts the attached reference picture into the board as a hidden image layer.
- `preview` returns the rendered PNG. `mode:"side"` shows reference and drawing next to each other; `mode:"diff"` adds a difference heat map (luma, chroma and edges); `box` zooms into a region (up to 3×); `grid` overlays canvas-pixel coordinates; `compare` overlays the two at 50%.
- `measure` compares drawing and reference and returns the error (0 = identical), the worst cells, the reference and drawing colour at given `points`, the main colours (`palette`), where each main colour sits (`regions`), and a `scan` ruler along a line that lists colour runs with start and end positions, so edges can be placed exactly. `box` limits it to a region.
- `apply` returns `progress` (error before and after the batch); `look:true` also returns a small preview, so the model sees what each batch did.
- `undo` takes back the last `steps` batches.
- The `guide` in `inspect` help describes the working method: plan, big to small, measure instead of guessing, five-tone shading with tinted shadows, undo what made things worse.

An automatic tracing command was built and removed again: copying the reference pixels is not drawing, and the point of the tools is that the model's own strokes get better.

## Replay and video

The board keeps the state before each change. **Replay** (button beside Drafts) plays the drawing back stroke by stroke in the order it was made: lines are drawn along their path, filled shapes are outlined first and then filled from top to bottom. Speed presets 12 / 30 / 60 seconds and a scrubber. **Record** captures the replay as a WebM video with `MediaRecorder`; the video is shown inside the board and only saved when the user clicks Save video. Nothing is downloaded automatically.

## Lifecycle and recovery

Document, history, run state and deduplication receipts belong to the plugin's
session registry, not the input component. Switching away and back in the same
page preserves them. Closing the board does not stop drawing. Explicit stop is
preserved across remounts; only the user can resume it. An abandoned run unlocks
after fifteen minutes without a tool operation (long script work between drawing calls is normal).

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

The Drafts menu exports PNG or `.dsh-sketch.json`. The native draft retains
editable brush strokes and can be imported again; import uses the existing file
chooser and preserves the current draft before replacing the board. Layered PSD
exchange was removed in 2.5.6 to keep the plugin small.

While the board is open, `window.dshSketchAgent.export('png'|'draft')`
returns `{ extension, mediaType, base64 }` for agent file delivery. This is
separate from the browser's user-facing download/save behavior.


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
