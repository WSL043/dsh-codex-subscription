# Subscription capability audit — 2026-09-22

Read-only review against current source and official documentation. This is a research backlog, not a claim of newly implemented or account-validated capabilities.

## Current versions

Registry: Codex stable 0.155.1, alpha 0.157.0-alpha.5; DSH stable 0.1.5-rc.2, alpha 0.1.6-alpha.2. Both DSH subagent providers still depend on Codex 0.153.4. Do not substitute the standalone latest CLI without provider compatibility acceptance.

## Findings and next acceptance

| Area | Current implementation | Next step |
| --- | --- | --- |
| Model capability discovery | Remote catalog drives context, modalities, supported effort, speed and verbosity. Unknown capabilities are exposed in bounded diagnostics, not sent blindly. | Check real account catalog against host effort enums, especially new levels; unsupported metadata is not proof the host can send it. |
| Model retirement | Spark removed from offline fallback; successful remote catalog remains authoritative. | Plan GPT-5.5 saved-selection handling before the announced October 14 retirement. Do not silently switch models or remove it early. |
| Identity isolation | Successful logout/account selection/removal closes connections in subscription-rpc.js; model catalog has generation cancellation. | Regression for in-flight account changes and token renewal, not a duplicate implementation. |
| Cloud compaction | Experimental opt-in SSE bridge; bounded encrypted replay state validated by account/model/history/digest/age. | Real restart/import/history-edit and failed-compaction recovery acceptance; do not infer readable summaries from encrypted items or enable by default from schema support. |
| Usage history | No plan_limit_history integration in product source. Earlier source research identified a candidate endpoint. | Read-only probe with only coverage/freshness/precision summaries; retain current sampling on unsupported/incomplete responses. No precision or forecast improvement claim before account evidence. |
| Codex independent subtasks | Official DSH provider, optional pinned runtime; default DSH path remains available. | Qualify runtime/provider together; evaluate continued tasks through upstream rather than implement another session controller. |
| Steering / async tools | No dedicated subscription adapter support established in this review. | Requires DSH scheduling, cancellation and tool-result ordering. App-server turn/steer is not the subscription Responses endpoint. |
| Voice, connectors, skills, marketplace | Official runtime/product capabilities, not automatically subscription transport features. | Do not add their full UI/auth/execution ownership to this plugin. Official plugin RPCs are still documented as under development. |

## Sources

- https://learn.chatgpt.com/docs/changelog — CLI changes, account invalidation, model lifecycle.
- https://learn.chatgpt.com/docs/app-server — model/list, modelProvider/capabilities/read, thread/compact/start, turn/steer; plugin RPC maturity limits.
- Published npm manifests for @openai/codex, @deepseek-ai/dsh and @deepseek-ai/dsh-subagent-codex (queried this date).
- Source: model-catalog.js, diagnostics.js, subscription-rpc.js, subscription-connection.js, subscription-compaction.js, subagent-runtime.js.

No model requests, account-history extraction, production runtime changes or feature enablement were performed for this audit.
