# Diagnostics design

Code baseline `7795f59` (2026-11-09). See the [development index](DEVELOPMENT.md) and the [historical audit](archive/audit-2026-09-28.md).

## Scope

Diagnostics read existing state from DSH and the subscription path. They leave model execution, settings and reset credits to their respective workflows. Credential presence, remote validity, RPC acknowledgment, operation completion, slot selection and rendered visibility each require their own evidence.

- [diagnostics.js](../src/diagnostics.js) assembles schema version 3 and isolates collectors.
- [diagnostic-checks.js](../src/diagnostic-checks.js) handles timeouts, failures and unknown results. It discards late results. A timeout can bound an asynchronous wait, while synchronous code still runs on the same thread.
- [diagnostic-capabilities.js](../src/diagnostic-capabilities.js) records prerequisites as `readiness` and observed operations as `execution`. Inspect operation results separately from `inspection-completed`.
- [diagnostic-evidence.js](../src/diagnostic-evidence.js) and [diagnostic-summary.js](../src/diagnostic-summary.js) interpret failures, recovery, deadlines and scope. A later success clears evidence of failure for the same operation.

## Evidence sources

| Area | Evidence collected | Requires further verification |
| --- | --- | --- |
| Local sign-in, settings and models | Status, catalog source and refresh, write access and capabilities | Current token validity and individual model responses |
| HTTP attempts | Phases, classification, timing and limited route information from [oauth-network.js](../src/oauth-network.js) and [model-attempt.js](../src/model-attempt.js) | Completion, quality and billing |
| Adapter failures | Text-free request and adapter shape, bounded frame and category data from [request-observer.js](../src/request-observer.js) and [failure-capture.js](../src/failure-capture.js) | Conversation details. Review even anonymized structures before sharing. |
| Model response streams | Configured, selected and effective transport, duration, first and last event, counts and completion, failure or cancellation from [model-stream-health.js](../src/model-stream-health.js) | External proxy and edge failures, lossless resumption and what the UI retained |
| WebSocket recovery | Connection, reuse, fallback and cooldown counters and bounded recovery state | Stability or latency across networks and regions |
| Compaction | Requests, completed responses with a checkpoint, checkpoints attached to DSH replay state and checkpoints sent again | Third-party compression, semantic retention and quota effects |
| Tools and RPC | Final `tools/result` and plugin operation outcomes | Execution in a particular conversation when only registration was observed |
| Runtime and storage | Component state, restart requirement and forecast history access | Subtask execution, sandbox behavior and filesystem permissions |
| Host UI | [Host diagnostics](../src/diagnostic-host.js) and slot snapshots | Plugin conflicts, layout, theme, focus and rendered visibility |

For Codex model SSE, `requestCompression: "zstd-decoded"` records that the request-local transport decoded the SDK's zstd body before sending its original JSON bytes. This compatibility handling addresses [#261](https://github.com/WSL043/dsh-codex-subscription/issues/261). It clears the request encoding and stale content length, preserves the selected fetch/proxy chain, and sends once. This field concerns HTTP body encoding. Context compaction has its own evidence above.

## Limits and ownership

- Network history retains 32 recent entries and the last failure per network area for the current process. The shareable report can link a model stream failure to its network entry using an alias generated for that report. Operation history is also bounded and recent summaries cover 15 minutes. See [diagnostic-operations.js](../src/diagnostic-operations.js) for the current limits.
- Stream health retains 20 entries. The consecutive-failure map holds up to 100 sessions. Public snapshots omit session IDs.
- Reports are snapshots at generation time. Some history is process-wide. Report truncation and dropped entries.
- A registrant label identifies a slot registration. Confirm package ownership and rendered visibility separately.
- Report logs retain up to 300 entries. Exclude tokens, account identifiers, proxy URLs, prompts, answers, tool bodies and personal paths. Test new fields against allowlisting and redaction.

## Reading client incidents

Generate the report in the same tab after reproducing the problem. Reloading the client clears this in-memory history. Copy and Download include the same `clientIncidents` object when observations are available.

- `rpcFailures` keeps the last failure for each subscription RPC endpoint, its time and duration, and the first subsequent successful response for that endpoint. It distinguishes rejected and malformed responses, transport exceptions and observed deadline aborts. Caller cancellations are excluded. `inFlight` gives the age of outstanding calls at collection time. Long polling can be expected.
- `modelPicker` keeps the last 32 events from the subscription-owned picker, grouped by menu opening. A pointer press followed by dismissal without activation shows where input stopped. It can also be a deliberate dismissal. After an accepted selection the plugin compares the host directory with the selection at that instant. Later updates and third-party menus need separate observation.
- Client incidents retain endpoint names and fixed event codes. They exclude payloads, model names, raw errors and session identifiers.

The Safari workflow exercises the production component on macOS with a synthetic directory, then installs the candidate in official DSH 0.2.2-rc.1 Web. It checks both the DSH and subscription pickers with a fictional model catalog and saves the results as Actions artifacts. Use the optional published comparison when dispatching the workflow to repeat the 3.2.19 baseline in a separate profile.

## Investigating an interrupted stream

1. Record the host, plugin build, configured transport and observed transport.
2. Compare total and idle time, network and adapter events, and what reached the UI. Account for heartbeat events with no content.
3. Use a synthetic connection reset to verify recording, cancellation and recovery. Record live-account results with their specific conditions.
4. Trace unfinished attempts through the host message lifecycle.
5. If the original failure does not reproduce, record what remains unknown. See the [Issue #220 investigation](archive/issue-220-stream-recovery.md) for the 330-second comparison and the reported 235-second interruption.
