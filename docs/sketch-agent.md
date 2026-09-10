# Native sketch commands — development interface

Available in 2.1.0-beta.1; not included in stable 2.0.1.

`codex_sketch` is a DSH-native tool. The browser bridge is active while that session is viewed and sketch editing
is enabled. An inspect request automatically opens its board. It
does not open another browser, read unrelated drafts, generate images, or send
attachments/messages. Sketch canvas and Agent drawing are independent Beta settings, both off by default. The host registers the drawing tool only when both are enabled; disabling Agent drawing removes its tool definition from subsequent model requests. Existing conversation history is not erased.

Actions: `inspect`, `apply`, `preview`, `save`.

1. Call `inspect` to obtain `documentId`, `revision`, layer ids and command help.
2. Call `apply` with those values, a unique `requestId`, and `commands` containing
   a JSON-encoded array. The entire batch succeeds or fails; one batch is one undo.
3. Call `preview` to inspect the actual PNG rendered by the board. DSH receives
   a native image attachment as the tool result.
4. Call `save` with a draft name. The existing browser-local draft store is used.

Example commands (coordinates normalized to the canvas; width is canvas pixels):

```json
[
  {"op":"layer","action":"add"},
  {"op":"layer","action":"rename","value":"Foreground"},
  {"op":"stroke","shape":"circle","color":"#0088ff","width":2,"fill":true,"points":[{"x":0.1,"y":0.1},{"x":0.3,"y":0.3}]}
]
```

Supported shapes: pen, line, rectangle, circle, polygon, eraser. Closed shapes
can be filled. Layer actions reuse the manual editor's operations. Polygon
vertices are straight; pen points use the existing quadratic brush renderer.

`window.dshSketchAgent.execute(request)` exposes the same command session to
browser-capable agents/developer tools, only while the board is open. Here
`commands` is an array rather than an encoded JSON string. This is an explicit
application API, not React-state manipulation or direct IndexedDB editing.

Manual changes and undo/redo advance the revision. A stale revision, changed
document, active pen gesture or save rejects writes. An identical completed
request id is deduplicated within the current mounted board (128 recent requests).
After a timeout, reconnect or reload, inspect the current state before retrying;
deduplication is not a durable cross-restart transaction log.

The host owns only a temporary delivery queue, with a single browser lease per
session and bounded timeouts. Disconnected browsers cannot be used as a headless drawing renderer.
Closing the board rejects queued writes; a fresh inspect is required to reopen it. No WebMCP browser support is required.

Resource budgets: 2,000 strokes, 2,000 points per stroke, 200,000 points per agent
document, eight layers, 256 commands per batch. These are resource protections,
not a claim of professional painting-tool completeness. Draft/image storage
limits remain unchanged. Do not raise limits without real rendering evidence.


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
