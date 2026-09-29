# Beta acceptance, 2026-09-29

Real ChatGPT account, `dsh-codex-subscription` 2.2.6, isolated DSH `0.2.0-rc.1` web host, model `GPT-5.6-Luna`. Results come from the plugin's own diagnostics counters and the visible conversation. No code changed in this round, so there is no release.

## WebSocket connection (Beta)

| Check | Result |
| --- | --- |
| Setting the mode to WebSocket and chatting over several turns works, and context carries across turns ("417" then "add 1" gives 418) | pass |
| Connections are reused: 3 requests, 2 connections created, 1 reused, 1 delta request | pass |
| No failures on a healthy network: `websocketFailures` 0, `sseFallbacks` 0 | pass |
| Falling back to SSE when the connection fails | not exercised live; covered only by unit tests |

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

| Check | Result |
| --- | --- |
| Optional Codex runtime component installs from the settings page, the host asks for a restart, and it is detected afterwards | pass |
| With the Codex option selected, the model delegates through `functions.subagent`, the subtask runs `node --version` and returns v24.14.1, the parent reports it | pass |
| That the subtask really ran on the Codex runtime rather than DSH's own | not confirmed; diagnostics do not expose it |

Not covered: model and effort selection for subtasks, permission inheritance, cancelling a running subtask, several subtasks at once.

## Sketch canvas, Agent drawing, preview return (Beta)

All three options were turned on.

| Check | Result |
| --- | --- |
| `@sketch` appears in the composer menu; "draw a red circle with a blue square below it" opens the canvas, the Agent draws both shapes correctly and reports done | pass |
| With "return preview" on, the drawing turn used 5 steps and 42K tokens, matching the documented extra image input cost | pass |
| Manual canvas entry reopens the drawing; adding a green line by hand and pressing attach puts the image in the composer | pass |
| The model reads the attached sketch: "Red circle, green horizontal line, blue square." | pass |

Not covered: undo and layer edits after Agent drawing, stopping a drawing halfway, aspect ratios other than 1:1, very large canvases, whether the returned preview itself was what the model looked at (the answer could also come from its own drawing commands).

## Decision

All of them keep their Beta label. Each has a passing happy path, but the failure paths (fallback, cancel, permission inheritance) have no live evidence yet, and compaction can drop content the user considers unimportant.
