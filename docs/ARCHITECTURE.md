# Architecture and boundaries / 架构与边界

## Runtime shape

The repository is one DSH bundle with three surfaces:

1. `index` registers one DSH LLM adapter, one OAuth coordinator, one quota
   reader, and one loopback-only RPC channel.
2. `client` contributes one removable section to DSH Settings. It receives only
   redacted account state and validated quota projections.
3. `cordis.patch.yml` adds the provider plugin to the DSH composition without
   changing the default model.

The plugin uses the exact pi-ai peer already owned by DSH's pi-ai adapter. It
does not install a second provider stack, spawn Codex CLI, embed another agent
loop, or proxy prompts through a browser page. DSH continues to own sessions,
tools, permissions, attachments, model selection, and the application shell.

## Credential and quota flow

```text
DSH Settings client
  -> loopback RPC: login or quota intent only
  -> host OAuth coordinator / credential service
  -> auth.openai.com or chatgpt.com usage endpoint
  -> validated, redacted account/quota projection
  -> DSH Settings client
```

The browser receives authentication status, expiry, quota bucket identity and
display name, quota percentages, window duration, reset time, and fetch time.
When present, the projection may also contain an extra Credits balance and
monthly spend-control usage/limit/remaining state; both are optional account or
workspace fields, not assumed subscription entitlements. The browser never
receives access/refresh tokens, raw OAuth JSON, account identifiers, or the raw
provider response. Credential modifications are serialized so an older refresh
cannot overwrite a newer rotated credential.

Window slots are optional and labeled from their duration, not their position.
The UI therefore shows a weekly-only response without inventing a 5-hour card,
and automatically shows a short window if the backend returns one later.
`additional_rate_limits` is projected generically by `metered_feature` and
`limit_name`; this covers the current Spark-specific bucket without hard-coding
`codex_bengalfox` or a model display name into the client. OpenAI's current
[Codex-Spark announcement](https://openai.com/index/introducing-gpt-5-3-codex-spark/)
describes an independently governed research-preview limit that may change with
demand, which is why the provider response—not product-copy assumptions—is the
source of truth.

The direct ChatGPT usage reader is intentional rather than a guessed endpoint.
The official Codex backend client currently selects `/backend-api/wham/usage`
for the ChatGPT route and models `used_percent`, `limit_window_seconds`, and
`reset_at`. Codex app-server exposes the corresponding `usedPercent`,
`windowDurationMins`, and `resetsAt` projection. Primary references:

- [official Codex usage client](https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/client/rate_limit_resets.rs)
- [official Codex usage model](https://github.com/openai/codex/blob/main/codex-rs/codex-backend-openapi-models/src/models/rate_limit_window_snapshot.rs)
- [official Codex app-server account protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/account.rs)
- [official Codex TUI quota presentation](https://github.com/openai/codex/blob/main/codex-rs/tui/src/status/rate_limits.rs)

The endpoint remains an internal ChatGPT contract, not the public OpenAI API.
The parser therefore validates every exposed field, tolerates omitted optional
fields, refuses redirects, times out, and returns an unavailable state on drift.

## Failure policy

- Missing or expired subscription credentials fail the Codex route.
- Transient failures use DSH's normal same-provider retry policy; retries never
  select another provider or an API-key route.
- No route points to OpenAI API billing or another model provider.
- Usage failures do not stop model turns; they only make the optional Settings
  projection unavailable.
- Quota reads are cached for 60 seconds and concurrent reads share one request.
- A real model turn is never used merely to refresh quota.

## Current components

| Component | Purpose | Evidence |
| --- | --- | --- |
| DSH-native adapter | Model route | Reuses DSH tools, sessions, permissions, and model selection |
| Exact pi-ai peer | Provider seam | Prevents a duplicated provider dependency graph |
| Host OAuth coordinator | Credential lifecycle | Keeps secrets out of the browser and serializes refresh writes |
| Direct quota reader | Quota status | Matches the current official Codex ChatGPT usage route with reset timestamps and strict projections |

## Installation boundary

DSH deliberately forwards plugin package operations (`add`, `update`, `remove`,
`list`) through its profile-aware plugin command. This project ships prebuilt
`lib/` output and no `prepare` hook, so a tagged GitHub install does not require
running repository build scripts. See the [DSH CLI plugin reference](https://github.com/deepseek-ai/deepseek-harness/blob/main/apps/cli/reference/README.md)
and the shipped [agent runbook](../AGENTS.md).

DSH profile workspaces deliberately set `autoInstallPeers: false` and keep one
flat `$DSH_HOME/profiles/node_modules` fallback populated from the installation.
Normal Node parent lookup lets this external bundle share those exact host peers
instead of creating a second Cordis/DSH graph. Consequently, pnpm's isolated
`peers check` reports host peers as missing and is not a valid runtime closure
test here; exact host-version checks, composed config, and an authorized boot are.
