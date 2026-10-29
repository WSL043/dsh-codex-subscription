# Context budgets

The account catalog and settings retain raw model capacities. The subscription
provider selects Standard, Extended or Custom first, then applies the official
`effective_context_window_percent` once before giving DSH its model descriptor.
Custom values are clamped against the raw catalog maximum first. A missing or
invalid percentage uses 95; an explicit integer from 1 through 100 is respected.
Repeated reads and switching modes never modify the catalog or saved settings.

This follows Codex's `ModelInfo::usable_context_window` and its default of 95:
[official source](https://github.com/openai/codex/blob/6af345407d9c2a568da9d01b6c4b81a9e61495c0/codex-rs/protocol/src/openai_models.rs).
For example, 500,000 raw tokens become a 475,000-token effective window.
This is context headroom, not a reduction in subscription quota.

## Compaction and output reservations

DSH owns its native compaction policy. The plugin does not replace it or change
its settings. Cloud compaction uses the same effective descriptor and follows
the current DSH basic policy's default pressure calculation:

```text
C = effective context window (headroom percentage already applied)
R = request maxTokens, otherwise the prepared model's configured default, otherwise 0
threshold = floor(min(C * 0.8, C - R - 65536))
```

The ratio and pressure budget are alternative limits, not successive deductions.
The model's advertised maximum output is not automatically reserved. A prepared
call freezes its configured default; concurrent requests keep separate reserves.
Insufficient pressure budgets fail before sending a cloud request. A test-only
explicit compaction threshold can lower, but cannot exceed, the pressure limit.
No `max_output_tokens` parameter is added to subscription requests.

These constants match DSH's default basic policy, not arbitrary user overrides of
that policy. Older hosts may use a different native policy; their policy remains
host-owned, while the cloud path keeps the conservative pressure calculation.

## Verification, 2026-10-29

- Full local regression: 1,335 tests, 1,329 passed, 6 conditional skips, no failures.
- Real rc.4 `BasicCompactionEngine.compactIfNeeded`: five capacity/reservation
  combinations, each just below and exactly at its threshold, matched the cloud calculation.
- Real signed-in subscription requests through rc.4's adapter and pi-ai 1.4.0:
  Standard, Extended and Custom; no full-window saturation or long-duration run.
- Actual server compaction with a lowered test threshold: checkpoint saved,
  JSON round-trip restored, remembered content recovered, then ordinary requests
  succeeded after cloud compaction was disabled. The lowered test threshold is not shipped or saved as a setting.
- Adapter transport regressions cover explicit/configured output reserves,
  request overrides, prepared snapshots, concurrency, mode changes and cancellation.

No version, release, Portable kernel or drawing behavior changes are part of this work.
