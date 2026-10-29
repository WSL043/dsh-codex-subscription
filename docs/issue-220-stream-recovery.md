# Issue #220: long-stream investigation and diagnostics

Validation date: 2026-10-30. Plugin baseline: 3.2.1 / `36e335a`.

## Findings

- No fixed 240-second total-response deadline was found in the plugin or the audited pi-ai transport. The plugin's stream timeout is an idle timeout; the SDK clears its HTTP response-header timeout after headers arrive.
- WebSocket is already optional. Cloud compaction currently routes model requests through SSE even when WebSocket is selected. The settings now explain this combination.
- Existing network timings measure individual iterator reads, not the lifetime of one response. New bounded request summaries record configured/selected/observed transport, total duration, first/last event timing, counts and an allowlisted failure category. They retain no prompt, reply, credential or session identifier.
- DSH durably records failed output as `assistant/attempt`, but its normal assistant display clears it during retry. This remains a host message-lifecycle issue. The plugin does not add a separate draft card, conversation projection or retry warning UI.

## Real-account control

Existing official desktop OAuth was read without refreshing or changing it. Two concurrent gpt-6.1-sol requests used this machine's existing proxy and the official rc.4 runtime / pi-ai 1.4.0. Both were deliberately stopped at the 330-second observation limit:

| Transport | Provider events | Last event | Largest event gap | External reset observed |
| --- | ---: | ---: | ---: | --- |
| SSE | 9,613 | 329,892 ms | 20,697 ms | No |
| WebSocket | 10,384 | 329,956 ms | 20,569 ms | No |

This does not reproduce or explain the reporter's approximately 235-second reset. It establishes that this tested path has no universal four-minute limit; it does not establish the reporter's proxy or upstream edge behavior. No additional long-running probe is required for this candidate.

## Native host diagnostic validation

A thin isolated home reused the installed official rc.4 core and the built candidate, without changing the user's Portable, settings, sessions, pairing or core. Only the test process intercepted the Codex response endpoint to emit text and then ECONNRESET.

- Native diagnostic persistence retained full-response timing and `failure=ECONNRESET`; the credential sanitizer did not erase this safe category.
- The reporter's rc.2 official packages were separately checked for compact streams and failed-attempt persistence. This is a source check, not a second rc.2 runtime acceptance.

## Regression and scope

- After removing the separate draft UI, the full local suite has 1,346 tests: 1,341 passed, 5 explicitly skipped, zero failures. Optional environment-specific checks are not counted as acceptance.
- Targeted provider integration confirms cloud transport selection, caller callback preservation, error classification and redaction. Browser bundling no longer includes the draft-only record reader or its value helpers.
- Replayed the exact sanitized Issue #220 body against intake: the previous workflow produced two conflicting comments and a waiting label; the new workflow produces one acknowledgement with no forced duplicate issue or waiting label. Open/edit races are serialized and welcomes are deduplicated.
- Sketch source and generated feature artifacts, Portable, kernel, version metadata and release assets are unchanged. This work does not prove a fix for the reporter's external connection reset; Issue #220 should remain open pending that evidence.
