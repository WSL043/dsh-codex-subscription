# Optional runtime maintenance acceptance

Date: 2026-09-22.

Using the official DSH 0.1.6-alpha.2 CLI and a new isolated profile, installed the published 2.1.3-beta.1, then updated to the published 2.1.3.

| Installed tree | Before | After |
| --- | ---: | ---: |
| File bytes (excluding symbolic links) | 397313201 | 1283383 |
| Files | 154 | 80 |
| Codex CLI / subtask provider present | Yes | No |

These are logical installation sizes, not unique physical disk savings: pnpm hard links can share storage with its cache. The package cache was not pruned. No existing user profile was changed. Explicitly installed components and dependencies required by other plugins are outside this single-plugin upgrade scenario.

Follow-up fixes distinguish incompatible installed components from missing components, retain an uninstall action when the host owns a removable bundle, explain protected dependencies, and refresh backend preferences when asynchronous maintenance completes. Runtime management tests cover incompatible and host-owned components.
