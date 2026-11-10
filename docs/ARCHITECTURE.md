# Architecture

This overview covers subscription plugin `3.2.10` and DSH `0.2.2-rc.1`. See the [development index](DEVELOPMENT.md), [DSH extension contracts](dsh-plugin-contracts.md) and [Desktop checks](ui-smoke.md).

## Execution paths

```text
DSH Agent / native tools
  → DSH LLM adapter
  → subscription model / capability / request bridges
  → proxy-aware subscription transport → ChatGPT subscription backend

DSH client slots → shared controllers → typed plugin RPC
  → host-owned settings / credentials / attachments / session services

optional independent Codex subtask
  → DSH tool + official provider → explicitly prepared CLI
```

## Module responsibilities

| Area | Entry points | Responsibilities |
| --- | --- | --- |
| Plugin setup | [index.js](../src/index.js), [client.jsx](../src/client.jsx) | Wire services, RPC and lifecycle hooks. Keep feature logic in the corresponding modules. |
| Settings | [settings-contract.js](../src/settings-contract.js), [settings-adapter.js](../src/settings-adapter.js), [preference-controller.js](../src/preference-controller.js) | Use DSH settings as the source of truth. Verify persistence and the rendered state. |
| Settings UI | [subscription-settings-entry.js](../src/subscription-settings-entry.js), [client-section.jsx](../src/client-section.jsx) | Share the controller and RPC between Settings and the plugin details page. Give each rendered radio group a distinct name. |
| Sign-in and accounts | [credential-store.js](../src/credential-store.js), [account-vault.js](../src/account-vault.js), [login-coordinator.js](../src/login-coordinator.js), [subscription-credentials.js](../src/subscription-credentials.js) | Use DSH credential storage. Discard late responses from obsolete sign-ins. Keep tokens bound to their accounts. |
| Models and context budget | [model-catalog.js](../src/model-catalog.js), [capability-settings.js](../src/capability-settings.js), [context-budget.js](../src/context-budget.js) | Use the account's available capabilities. Distinguish raw capacity from the effective budget and apply headroom once. |
| Model picker | [client-model-picker-slot.js](../src/client-model-picker-slot.js), [default-model.js](../src/default-model.js), [default-model-controller.js](../src/default-model-controller.js) | Auto yields to Claude Style or another active picker. DSH standard uses the host picker. The subscription menu provides speed and output detail for supported models. |
| Transport and compatibility | [pi-ai-runtime.js](../src/pi-ai-runtime.js), [pi-ai-compat.js](../src/pi-ai-compat.js), [oauth-network.js](../src/oauth-network.js), [subscription-connection.js](../src/subscription-connection.js) | Use the reviewed SDK version. Separate connections by account, token, session and proxy. SSE is the default. Retry interrupted requests according to whether the provider accepted them. |
| Reasoning and compaction | [subscription-reasoning.js](../src/subscription-reasoning.js), [subscription-compaction.js](../src/subscription-compaction.js) | Preserve prepared calls and request-local state. Cloud compaction is optional on SSE. DSH owns history, persistence, forks and scheduling. |
| Ultra | [ultra-execution.js](../src/ultra-execution.js) | Record the selection through DSH and register delegation instructions in its runtime context. Resolve the actual reasoning effort before sending. DSH manages subtasks and permissions. |
| Usage and quota | [usage.js](../src/usage.js), [account-usage.js](../src/account-usage.js), [plan-history.js](../src/plan-history.js), [quota-forecast.js](../src/quota-forecast.js), [quota-forecast-store.js](../src/quota-forecast-store.js) | Track observations, estimates and separate quota pools independently. The local Beta forecast retains a bounded history. |
| Resets | [reset-credits.js](../src/reset-credits.js), [client-account-quota.jsx](../src/client-account-quota.jsx) | Preserve confirmation, waiting, single execution and handling of uncertain outcomes. Use fixtures to verify credit consumption. |
| Search and webpage reading | [search-router.js](../src/search-router.js), [codex-search.js](../src/codex-search.js), [codex-fetch.js](../src/codex-fetch.js), [dsh-search.js](../src/dsh-search.js) | Respect explicit source selection and Auto fallback. Readiness checks inspect prerequisites without executing requests or refreshing credentials. |
| Connectors | [connectors.js](../src/connectors.js) | Treat external results as data. Honor read-only, approval and direct modes and DSH session permissions. |
| Images | [codex-images.js](../src/codex-images.js), [image-original-store.js](../src/image-original-store.js), [image-original-contract.js](../src/image-original-contract.js), [original-image-download.js](../src/original-image-download.js) | Edit the selected original after verifying ownership, identity and hash. Record requested and returned model and dimensions independently. |
| Image UI | [client-image-previews.jsx](../src/client-image-previews.jsx), [subscription-image-viewer.jsx](../src/subscription-image-viewer.jsx), [image-composer.js](../src/image-composer.js) | DSH owns attachment and draft operations. Preserve manual edits during async preparation. Adding an image to the composer creates an editable draft. |
| Sketch canvas | [sketch-session-state.js](../src/sketch-session-state.js), [sketch-document-lifecycle.js](../src/sketch-document-lifecycle.js), [sketch-operation-gate.js](../src/sketch-operation-gate.js), [sketch-workspace.jsx](../src/sketch-workspace.jsx) | Keep document and execution state per conversation. Preserve save snapshots, cancel obsolete restores and serialize file operations. See [sketch maintenance](sketch-maintenance.md). |
| Voice | [voice-call.js](../src/voice-call.js), [voice-native-host.js](../src/voice-native-host.js), [voice-hangup.js](../src/voice-hangup.js), [voice-questions.js](../src/voice-questions.js) | Ending a call leaves active and queued DSH work running. Record whether a test used a physical microphone, digital audio or synthetic events. |
| Phone access | [remote-control-dsh.js](../src/remote-control-dsh.js), [remote-history-source.js](../src/remote-history-source.js), [remote-control-git.js](../src/remote-control-git.js), [remote-image-assets.js](../src/remote-image-assets.js) | Use native session observation and projection. Preserve ownership and limits for history pages, images, acknowledgments and reconnects. Git access uses a read-only allowlist within the conversation workspace. |
| Composer predictions | [composer-predictions.js](../src/composer-predictions.js), [composer-prediction-controller.js](../src/composer-prediction-controller.js), [composer-prediction-layout.js](../src/composer-prediction-layout.js) | Run only when enabled for a supported model. Invalidate on conversation, account or draft changes. Tab inserts the visible suggestion into the current draft. See the [usage terms in the guide](GUIDE.en.md#predictions). |
| Codex subtasks | [subagent-backend.js](../src/subagent-backend.js), [subagent-auth.js](../src/subagent-auth.js), [subagent-cli.js](../src/subagent-cli.js), [runtime-management.js](../src/runtime-management.js) | Keep the official provider and dedicated CLI optional. Preserve DSH management and the parent task's permissions. |
| Diagnostics | [diagnostics.js](../src/diagnostics.js), [diagnostic-evidence.js](../src/diagnostic-evidence.js), [model-stream-health.js](../src/model-stream-health.js), [failure-capture.js](../src/failure-capture.js) | Record bounded, structured evidence from the transport, adapter, UI and device. |

## Ownership and lifecycle

- DSH owns settings, credentials, attachments, sessions, jobs, approvals and subagents.
- Dispose registrations, timers, connections, abort controllers, styles, URLs and child processes when the plugin stops. When restoring settings, preserve edits made since the temporary change.
- Verify settings through host serialization and the UI state after reload.
- Keep diagnostics read-only. Run model calls, credential refreshes and settings writes as explicit test steps.

## Build and distribution

[tsdown.config.mjs](../tsdown.config.mjs) builds the host ESM and browser CJS factories. The sketch canvas and image viewer load separately through DSH's `require.async()`. Keep Node dependencies out of the browser bundle and reuse the host's React. Regenerate `lib/` from source.

Check `exports`, `files` and `peerDependencies` in [package.json](../package.json) and the [compatibility metadata](../compatibility.json) against the locked dependencies, the packed artifact and the host under test. Consult the [DSH extension contracts](dsh-plugin-contracts.md) before using a host export.
