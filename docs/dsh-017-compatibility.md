# DSH 0.1.7-alpha.1 compatibility

## Changes

- Use volatile Config fields and profile-entry settings updates on the new host; retain namespace registration on older hosts.
- Do not require the removed client settingsScope service. The existing preference RPC handles hosts without it.
- Resolve renamed UI icons through one compatibility module.
- Include the new preview dependency cohort without widening support to untested versions.

## Acceptance (2026-09-22)

- Isolated official host: settings and advanced/image settings render without browser errors.
- Changing quota display to a progress bar persists in the profile and survives a process restart.
- Enable sketch, open the board, draw a stroke, and attach it to the composer: one image attachment rendered. Screenshot visually inspected.
- Behavior suites: 355 passed against both 0.1.7-alpha.1 and 0.1.6-alpha.2 dependencies.
- Full local suite: 461 passed, 3 skipped; after separating the legacy settings schema, 76 affected integration/delivery checks passed.
- V4 native session persistence: existing compacted message payload survives write/close and read in a new process with exact equality.

## Boundaries and retained failure evidence

The earlier V4 probe omitted turn/step lifecycle events and was rejected by the new strict log reader. The probe was corrected to emit the native lifecycle; this was a harness defect, not evidence of lost production sessions. Failed logs remain under .artifacts.

Follow-up acceptance passed before preparing 2.1.4:

- Real subscription text reply and a complete tool-call/result/reply exchange.
- WebSocket option request completed; this does not prove that fallback was unused.
- Cloud compression, V4 persistence, process restart and continuation retained the exact project identifier, revised budget, deadline and prohibition.
- Image generation saved a PNG and original asset. The new official ZIP exporter included its referenced image bytes; native log reimport preserved the compacted messages and attachment reference.
- Legacy settings.yaml migrated into the profile and the browser showed the migrated quota-display selection.
- Optional subtask completed under the new host subprocess service without writing a separate auth.json.

The isolated subtask runtime logged upstream optional plugin-catalog sync warnings before completing successfully; they did not affect its requested output. The user's existing host was not replaced.
