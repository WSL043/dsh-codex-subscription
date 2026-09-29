# Beta acceptance, 2026-09-29

Real ChatGPT account, `dsh-codex-subscription` 2.2.6, isolated DSH `0.2.0-rc.1` web host, model `GPT-5.6-Luna`. Results come from the plugin's own diagnostics counters and the visible conversation. The subtask section found two defects on `0.2.0-rc.1`, fixed in 2.2.7 (below); everything else needed no code change.

## WebSocket connection (Beta)

| Check | Result |
| --- | --- |
| Setting the mode to WebSocket and chatting over several turns works, and context carries across turns ("417" then "add 1" gives 418) | pass |
| Connections are reused: 3 requests, 2 connections created, 1 reused, 1 delta request | pass |
| No failures on a healthy network: `websocketFailures` 0, `sseFallbacks` 0 | pass |
| Falling back to SSE when the connection fails | not reproducible live (WebSocket and SSE share one host and one tunnel); covered by integration tests that use a local proxy rejecting CONNECT, including that a disconnect after the response was accepted is reported and not replayed over SSE |

## Cloud compaction (Beta)

Threshold is the fixed 100000 tokens. A single message of about 194K tokens (random filler) was followed by short questions.

| Check | Result |
| --- | --- |
| Request after the long message is compacted: context drops from 194K to about 6K tokens | pass |
| A fact stated with "remember this" survives compaction and is answered correctly on later turns | pass |
| A fact inside a message labelled "filler, ignore it" is dropped by compaction (answer: "Unknown") | expected, but worth knowing: compaction is lossy |
| Checkpoints are saved and reused: 5 requests, 2 saved, 3 reused | pass |
| DSH restart, then the same session continues: history shows, answer still correct | pass |
| Tool call round trip (shell tool) after compaction, fact still answered | pass |
| While cloud compaction is on the request uses SSE, so WebSocket is not used together with it (as documented) | as documented |

Not covered: other models, thresholds other than the default, compaction while a tool call is running, and behaviour after editing earlier history.

## Independent subtasks (Beta)

**Correction.** The first two rounds reported subtasks as passing, but the child was DSH's own agent, not Codex: on `0.2.0-rc.1` the "Codex" choice never took effect. The child listed DSH tools (`pwsh`, `read`, ...) and said it ran inside the DSH harness, and no `codex.exe` process existed. Those earlier results (permission, cancel) therefore described DSH subtasks and are replaced by the table below.

Defects found and fixed in 2.2.7:

- Since 0.2.0 the host mounts Agent preset rows once at boot, before plugins load and in a separate event realm. The plugin's config hook never saw the subagent row and the Loader does not list it, so the switch converted nothing. The plugin now also reads the preset registry's mounted rows.
- With the switch really working, the Codex child exposed about 300 `mcp__codex_apps__*` tools from the ChatGPT account's connected apps (calendar create and delete, site deploy, parental-control update and so on) and could call them under automatic approval. The child now runs with apps, plugins, browser and computer control switched off; a retest lists no `mcp__` tools.

Checked with the fix, real Codex app-server (`codex.exe` is a child of DSH while a subtask runs):

| Check | Result |
| --- | --- |
| Optional Codex runtime installs from settings and is detected after a restart | pass |
| Switching DSH to Codex takes effect without restarting DSH; a new session's subtask starts the Codex runtime | pass |
| `list_subagent_models` lists exactly the models ticked under Plugins → Subagent; a call naming `openai-codex` / `gpt-5.5` runs | pass |
| Permissions: writing a file outside the workspace is refused ("blocked by policy"), the file is not created, the parent reports it | pass |
| Cancel: stopping the turn ends the subtask, no sleeping shell and no runtime process is left | pass |
| Child tool list: workspace tools only, no connected-app tools | pass |

Not covered: the reasoning effort actually applied (the child cannot report it), many subtasks at once, a subtask across a DSH restart, and the Codex child's own `multi_agent` tools, which stayed available when the feature was switched off.

## Sketch canvas, Agent drawing, preview return (Beta)

All three options were turned on.

| Check | Result |
| --- | --- |
| `@sketch` appears in the composer menu; "draw a red circle with a blue square below it" opens the canvas, the Agent draws both shapes correctly and reports done | pass |
| With "return preview" on, the drawing turn used 5 steps and 42K tokens, matching the documented extra image input cost | pass |
| Manual canvas entry reopens the drawing; adding a green line by hand and pressing attach puts the image in the composer | pass |
| The model reads the attached sketch: "Red circle, green horizontal line, blue square." | pass |

Not covered: undo and layer edits after Agent drawing, stopping a drawing halfway, aspect ratios other than 1:1, very large canvases, whether the returned preview itself was what the model looked at (the answer could also come from its own drawing commands).

## Image 2.5 Flare and Sunburst (experimental)

| Check | Result |
| --- | --- |
| Flare: "green apple" returns an image, recorded as requested model `gpt-image-2.5-flare`, 1254 x 1254 | pass |
| Sunburst: "yellow banana" returns an image, recorded as `gpt-image-2.5-sunburst`, size auto gives 1536 x 1024 | pass |
| Server never reports the image model actually used, so the requested name is the only evidence | unchanged |

They stay labelled experimental: only one prompt each, and there is no way to confirm the server really used the 2.5 models.

## Input image detail "original"

With the setting on "original", an attached sketch was accepted by `GPT-5.6-Luna` and answered correctly ("Three"). Other models were not tried, so no per-model gating was added.

## Decision

All of them keep their Beta label. Each has a passing happy path, but WebSocket fallback has no live evidence, subtask reasoning effort and nested Codex agents are unchecked, and compaction can drop content the user considers unimportant.
