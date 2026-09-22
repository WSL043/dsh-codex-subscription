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

Cloud requests, generated-image reload/export, legacy settings-file migration and optional Codex subtask integration still require end-to-end acceptance on this host cohort before release. No release was published by this change. The existing user host was not replaced.
